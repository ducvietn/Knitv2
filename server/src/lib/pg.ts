/**
 * Lớp bọc Postgres — kết nối tới Supabase (hoặc bất kỳ Postgres nào).
 *
 * Chỉ được nạp khi `KNIT_DB_DRIVER=postgres` (hoặc khi có `DATABASE_URL`).
 * Toàn bộ câu SQL đi qua `pool.query` với tham số `$1, $2, ...` nên không
 * có nguy cơ SQL injection từ dữ liệu người dùng.
 */
import pg from 'pg'
import type { PoolClient, QueryResultRow } from 'pg'

// `pg` là CommonJS — import mặc định rồi lấy `Pool` từ đó.
const { Pool } = pg

/**
 * `pg` mặc định trả về cột `bigint` (`int8`) dưới dạng chuỗi, vì giá trị có
 * thể vượt quá `Number.MAX_SAFE_INTEGER`. SQLite trả về `number` — nếu để
 * nguyên, hai backend sẽ khác kiểu ở cùng một trường và mã nghiệp vụ phải
 * tự ép kiểu ở mọi nơi.
 *
 * Các cột đếm trong KNIT (số câu trả lời, số lượt xem…) không bao giờ gần
 * tới giới hạn đó, nên ép sang `number` là an toàn và giữ hai backend giống
 * hệt nhau.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number(value))

const DATABASE_URL = process.env.DATABASE_URL ?? ''

/**
 * Pool dùng chung — có thể bị thay thế từ bên ngoài.
 *
 * Mục đích: kiểm thử end-to-end cần một Postgres thật nhưng không muốn
 * phụ thuộc Docker. `scripts/test-pg-e2e.mjs` tiêm vào pool PGlite qua
 * socket shim `@electric-sql/pglite/node-postgres` — đúng client `pg` mà
 * production dùng với Supabase.
 */
let poolOverride: import('pg').Pool | undefined

export const setPool = (next: import('pg').Pool | undefined): void => {
  poolOverride = next
}

const createPool = (): import('pg').Pool => {
  if (!DATABASE_URL) {
    throw new Error(
      'Thiếu biến môi trường DATABASE_URL. Hãy đặt chuỗi kết nối Postgres trước khi chạy production.',
    )
  }

  /**
   * Supabase yêu cầu TLS. `sslmode=require` trong chuỗi kết nối cũng đủ, nhưng
   * nhiều công cụ sinh URL không kèm tham số đó — nên bật SSL theo mặc định
   * trừ khi người dùng tắt rõ ràng.
   */
  const sslDisabled = /sslmode=disable/i.test(DATABASE_URL)

  return new Pool({
    connectionString: DATABASE_URL,
    ssl: sslDisabled ? false : { rejectUnauthorized: false },
    max: Number(process.env.KNIT_PG_POOL_MAX ?? 10),
    // Postgres đóng kết nối idle sau 10s mặc định ở serverless — giữ lâu hơn
    // để tái dùng connection giữa các request liên tiếp.
    idleTimeoutMillis: 30_000,
  })
}

export const pool: import('pg').Pool = new Proxy({} as import('pg').Pool, {
  get(_target, prop, receiver) {
    const actual = poolOverride ?? createPool()
    poolOverride = actual
    const value = Reflect.get(actual, prop, actual)
    return typeof value === 'function' ? value.bind(actual) : value
  },
})

pool.on('error', (err) => {
  console.error('[knit-api] lỗi pool Postgres (kết nối idle bị đóng):', err.message)
})

/** Chạy một câu lệnh, trả về các dòng kết quả. */
export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> => {
  const result = await pool.query<T>(text, params as never[])
  return result.rows
}

/** Chạy một câu lệnh, trả về dòng đầu tiên (hoặc `undefined`). */
export const queryOne = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> => {
  const rows = await query<T>(text, params)
  return rows[0]
}

/** Chạy một câu lệnh không cần kết quả (INSERT/UPDATE/DELETE). */
export const execute = async (text: string, params: unknown[] = []): Promise<void> => {
  await pool.query(text, params as never[])
}

/**
 * Chạy một khối trong transaction.
 *
 * `fn` nhận một client đã `BEGIN` — mọi câu lệnh bên trong dùng client đó
 * nên cùng một transaction. Lỗi trong `fn` sẽ khiến `ROLLBACK`.
 */
export const transaction = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

export const closePool = async (): Promise<void> => {
  await pool.end()
}

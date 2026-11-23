/**
 * Lớp trừu hợp cho lớp truy cập dữ liệu.
 *
 * KNIT chạy được trên hai loại cơ sở dữ liệu:
 *
 * - **SQLite** (mặc định ở local) — file đơn, không cần cài server.
 * - **Postgres** (Supabase, hoặc bất kỳ Postgres nào) — dùng khi deploy.
 *
 * Toàn bộ mã nghiệp vụ gọi `sql.prepare(...)` với ngữ pháp `?` như SQLite.
 * Lớp này dịch sang `$1, $2, ...` của Postgres khi cần, đồng thời chuẩn hoá
 * khác biệt về kiểu dữ liệu giữa hai hệ quản trị:
 *
 * - Cột boolean: SQLite dùng INTEGER 0/1, Postgres dùng BOOLEAN.
 * - Cột JSON: SQLite lưu chuỗi, Postgres dùng JSONB và trả về object.
 * - Mốc thời gian: cả hai đều trả về chuỗi ISO để API không đổi hình dạng.
 *
 * Vì vậy phần lớn mã trong `routes/` và `lib/repo.ts` không cần biết mình
 * đang nói chuyện với hệ quản trị nào.
 */
import type { PoolClient, QueryResultRow } from 'pg'
import { createRequire } from 'node:module'

export type SqlValue = string | number | boolean | null | undefined | Date
export type SqlParams = readonly unknown[]

/** Kết quả của một câu lệnh ghi dữ liệu. */
export interface RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

/** Một câu lệnh đã chuẩn bị. */
export interface PreparedStatement {
  run(...params: SqlParams): Promise<RunResult>
  get<T = Record<string, unknown>>(...params: SqlParams): Promise<T | undefined>
  all<T = Record<string, unknown>>(...params: SqlParams): Promise<T[]>
}

export interface SqlDriver {
  readonly name: 'sqlite' | 'postgres'
  /**
   * Biểu thức chuyển cột sang văn bản, dùng cho `LIKE`.
   *
   * - Postgres: cột JSONB cần ép sang `text` mới `LIKE` được.
   * - SQLite: cột đã là TEXT, ép thêm sẽ là cú pháp sai.
   */
  jsonAsText(column: string): string
  /**
   * Chèn bỏ qua khi vi phạm ràng buộc duy nhất.
   *
   * - SQLite: `INSERT OR IGNORE`.
   * - Postgres: `INSERT ... ON CONFLICT DO NOTHING`.
   */
  insertIgnore(sql: string): string
  prepare(sql: string): PreparedStatement
  exec(sql: string): Promise<void>
  transaction<T>(fn: () => Promise<T>): Promise<T>
  /** Đóng kết nối (dùng khi server tắt). */
  close(): Promise<void>
}

/* ------------------------------------------------------------------ helpers */

/**
 * Tách câu SQL thành từng lệnh riêng.
 *
 * Bỏ qua comment `--` và chuỗi `'...'` để không bị cắt nhầm ở dấu `;`
 * bên trong dữ liệu. Chỉ dùng cho file schema do chính dự án viết.
 */
export const splitStatements = (sql: string): string[] => {
  const statements: string[] = []
  let current = ''
  let inString = false
  let inLineComment = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!
    const next = sql[i + 1]

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inString) {
      current += ch
      if (ch === "'") {
        // Dấu nháy kép bên trong chuỗi được escape bằng cách nhân đôi.
        if (next === "'") {
          current += next
          i++
        } else {
          inString = false
        }
      }
      continue
    }
    if (ch === '-' && next === '-') {
      inLineComment = true
      i++
      continue
    }
    if (ch === "'") {
      inString = true
      current += ch
      continue
    }
    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }
    current += ch
  }

  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)
  return statements
}

/**
 * Chuyển câu SQL từ ngữ pháp `?` sang `$1, $2, ...`.
 *
 * Bỏ qua dấu `?` nằm trong chuỗi hoặc comment. Postgres không có toán tử
 * `?` kiểu "escape", nên mọi `?` trong câu lệnh đều là placeholder.
 */
export const toPositional = (sql: string): string => {
  let out = ''
  let index = 0
  let inString = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!
    const next = sql[i + 1]

    if (inString) {
      out += ch
      if (ch === "'") {
        if (next === "'") {
          out += next
          i++
        } else {
          inString = false
        }
      }
      continue
    }
    if (ch === "'") {
      inString = true
      out += ch
      continue
    }
    if (ch === '-' && next === '-') {
      // Comment tới hết dòng — chép nguyên văn.
      const end = sql.indexOf('\n', i)
      if (end === -1) {
        out += sql.slice(i)
        break
      }
      out += sql.slice(i, end)
      i = end - 1
      continue
    }
    if (ch === '?') {
      index += 1
      out += `$${index}`
      continue
    }
    out += ch
  }

  return out
}

/**
 * Đếm số placeholder `?` trong một câu lệnh.
 *
 * Dùng để biết câu lệnh có bao nhiêu tham số — `pg` báo lỗi nếu số tham số
 * không khớp, còn SQLite không quan tâm nên phần còn lại của code vẫn chạy.
 */
export const countPlaceholders = (sql: string): number => {
  const converted = toPositional(sql)
  const matches = converted.match(/\$\d+/g)
  return matches ? matches.length : 0
}

/**
 * Chuẩn hoá một giá trị để gửi đi.
 *
 * - `undefined` -> `null` (Postgres không hiểu `undefined`).
 * - `boolean` -> giữ nguyên (Postgres BOOLEAN tự xử lý).
 * - Mọi thứ khác giữ nguyên.
 */
const normaliseParam = (value: unknown): unknown => {
  if (value === undefined) return null
  return value
}

/**
 * Chuẩn hoá một dòng kết quả về cùng hình dạng với SQLite.
 *
 * - Cột boolean trả về `true/false` ở cả hai hệ (SQLite của chúng ta lưu
 *   0/1 nên đọc ra là số — xem `normaliseSqliteRow`).
 * - Cột JSONB trả về object ở Postgres, chuỗi ở SQLite.
 */
export const normaliseRow = <T>(row: QueryResultRow | Record<string, unknown>): T => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key] = value
  }
  return out as T
}

/* ------------------------------------------------------------ postgres driver */

/**
 * Pool Postgres được nạp lazily.
 *
 * `pg.ts` ném lỗi khi thiếu `DATABASE_URL` — nếu import ngay ở đầu file thì
 * chạy SQLite cũng bị lỗi. Nạp động giúp `KNIT_DB_DRIVER=sqlite` không bao
 * giờ cần `DATABASE_URL`.
 */
let poolPromise: Promise<typeof import('./pg')['pool']> | undefined

const getPool = () => {
  if (!poolPromise) {
    poolPromise = import('./pg').then((mod) => mod.pool)
  }
  return poolPromise
}

const postgresDriver: SqlDriver = {
  name: 'postgres',

  jsonAsText(column: string): string {
    return `${column}::text`
  },

  insertIgnore(sql: string): string {
    return `${sql} ON CONFLICT DO NOTHING`
  },

  prepare(sql: string): PreparedStatement {
    const text = toPositional(sql)

    return {
      async run(...params: SqlParams): Promise<RunResult> {
        const pool = await getPool()
        const result = await pool.query(text, params.map(normaliseParam) as never[])
        return {
          changes: result.rowCount ?? 0,
          lastInsertRowid: 0,
        }
      },

      async get<T = Record<string, unknown>>(...params: SqlParams): Promise<T | undefined> {
        const pool = await getPool()
        const result = await pool.query(text, params.map(normaliseParam) as never[])
        return result.rows[0] as T | undefined
      },

      async all<T = Record<string, unknown>>(...params: SqlParams): Promise<T[]> {
        const pool = await getPool()
        const result = await pool.query(text, params.map(normaliseParam) as never[])
        return result.rows as T[]
      },
    }
  },

  async exec(sql: string): Promise<void> {
    const pool = await getPool()
    for (const statement of splitStatements(sql)) {
      await pool.query(statement)
    }
  },

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const pool = await getPool()
    const client: PoolClient = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn()
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
  },

  async close(): Promise<void> {
    const pool = await getPool()
    await pool.end()
  },
}

/* -------------------------------------------------------------- sqlite driver */

/**
 * Lớp bọc `better-sqlite3` cho API bất đồng bộ.
 *
 * SQLite là API đồng bộ, nhưng để hai backend có cùng chữ ký (Promise),
 * mọi lệnh đều được bọc trong `async` — việc chờ vô hại vì các lệnh này
 * hoàn tất gần như tức thì.
 */
const createSqliteDriver = (): SqlDriver => {
  // Nạp động để không phải cài `better-sqlite3` khi chạy Postgres.
  // `better-sqlite3` là CommonJS native module — cần `createRequire` vì
  // file này chạy ở chế độ ESM.
  const require = createRequire(import.meta.url)
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  const { mkdirSync } = require('node:fs') as typeof import('node:fs')
  const { dirname, resolve } = require('node:path') as typeof import('node:path')

  const DB_PATH = resolve(process.env.KNIT_DB ?? './data/knit.db')
  mkdirSync(dirname(DB_PATH), { recursive: true })

  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  /**
   * SQLite trả về INTEGER 0/1 cho các cột boolean, Postgres trả về
   * `true/false`. Chuẩn hoá về boolean để mã nghiệp vụ không phải rẽ nhánh.
   *
   * Danh sách cột boolean được biết trước nên khai báo tường minh — không
   * có cách nào suy ra từ kiểu dữ liệu runtime một cách đáng tin cậy.
   *
   * Lưu ý: `also_need`, `views` và `helpful_count` là số đếm, KHÔNG phải
   * boolean — dù chúng cũng lưu 0/1 trong SQLite.
   */
  const BOOLEAN_COLUMNS = new Set([
    'verified',
    'anonymous',
    'accepted',
    'variant_anonymous',
    'read',
  ])

  const normaliseSqliteRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (BOOLEAN_COLUMNS.has(key) && (value === 0 || value === 1)) {
        out[key] = value === 1
        continue
      }
      out[key] = value
    }
    return out
  }

  return {
    name: 'sqlite',

    jsonAsText(column: string): string {
      return column
    },

    insertIgnore(sql: string): string {
      return sql.replace(/^INSERT\s+INTO/i, 'INSERT OR IGNORE INTO')
    },

    prepare(sql: string): PreparedStatement {
      const statement = db.prepare(sql)

      /**
       * `better-sqlite3` chỉ nhận number, string, bigint, Buffer và null —
       * boolean bị từ chối. Vì vậy boolean được đổi thành 0/1 khi ghi.
       * (Khi đọc lên, `normaliseSqliteRow` đổi 0/1 ngược lại thành boolean.)
       */
      const bindParam = (value: unknown): unknown => {
        if (value === undefined || value === null) return null
        if (typeof value === 'boolean') return value ? 1 : 0
        return value
      }

      return {
        async run(...params: SqlParams): Promise<RunResult> {
          const info = statement.run(...params.map(bindParam))
          return {
            changes: info.changes,
            lastInsertRowid: info.lastInsertRowid,
          }
        },

        async get<T = Record<string, unknown>>(...params: SqlParams): Promise<T | undefined> {
          const row = statement.get(...params.map(bindParam)) as
            | Record<string, unknown>
            | undefined
          return row ? (normaliseSqliteRow(row) as T) : undefined
        },

        async all<T = Record<string, unknown>>(...params: SqlParams): Promise<T[]> {
          const rows = statement.all(...params.map(bindParam)) as Record<string, unknown>[]
          return rows.map((row) => normaliseSqliteRow(row) as T)
        },
      }
    },

    async exec(sql: string): Promise<void> {
      db.exec(sql)
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      // better-sqlite3 transaction chỉ nhận hàm đồng bộ — nhưng hàm của
      // chúng ta là async. Vì vậy bọc bằng `BEGIN`/`COMMIT` thủ công; lỗi
      // sẽ được ném ra sau khi `ROLLBACK`.
      db.exec('BEGIN')
      try {
        const result = await fn()
        db.exec('COMMIT')
        return result
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },

    async close(): Promise<void> {
      db.close()
    },
  }
}

/* ------------------------------------------------------------------ lựa chọn */

/**
 * Backend nào sẽ dùng.
 *
 * - `KNIT_DB_DRIVER=postgres` — ép dùng Postgres (bắt buộc có `DATABASE_URL`).
 * - `KNIT_DB_DRIVER=sqlite` — ép dùng SQLite.
 * - Không khai báo — dùng Postgres nếu có `DATABASE_URL`, ngược lại SQLite.
 */
const resolveDriver = (): SqlDriver => {
  const explicit = process.env.KNIT_DB_DRIVER?.toLowerCase()
  if (explicit === 'postgres') return postgresDriver
  if (explicit === 'sqlite') return createSqliteDriver()
  if (process.env.DATABASE_URL) return postgresDriver
  return createSqliteDriver()
}

export const sql: SqlDriver = resolveDriver()

export const nowIso = () => new Date().toISOString()

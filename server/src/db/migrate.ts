/**
 * Áp dụng lược đồ Postgres cho cơ sở dữ liệu trong `DATABASE_URL`.
 *
 * Dùng:  npm --prefix server run migrate
 *
 * File `server/db/schema.sql` được chia nhỏ thành từng câu lệnh và chạy
 * theo thứ tự. Tất cả đều dùng `IF NOT EXISTS` nên chạy lại nhiều lần vẫn
 * an toàn — không ghi đè dữ liệu đã có.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closePool, pool } from '../lib/pg'
import { splitStatements } from '../lib/sql'

/**
 * Tìm file `db/schema.sql` bằng cách dò ngược từ thư mục module.
 *
 * `process.cwd()` không đáng tin: trong container, entrypoint chạy
 * `node server/dist/migrate.js` từ `/app` nên `db/schema.sql` sẽ không
 * tồn tại. Dò ngược từ vị trí file đã bundle giúp script chạy được ở mọi
 * nơi — local (`server/`), container (`/app/server/dist/`).
 *
 * `KNIT_SCHEMA` là *gợi ý* chứ không phải lệnh tuyệt đối: nếu đường dẫn
 * không tồn tại thì vẫn dò tiếp các đường dẫn mặc định, thay vì crash.
 */
function findSchemaFile(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates: string[] = []

  const override = process.env.KNIT_SCHEMA
  if (override) {
    if (isAbsolute(override)) {
      if (!existsSync(override)) {
        throw new Error(`KNIT_SCHEMA trỏ tới file không tồn tại: ${override}`)
      }
      return override
    }
    candidates.push(
      resolve(process.cwd(), override),
      resolve(here, '..', '..', override),
      resolve(here, '..', override),
    )
  }

  candidates.push(
    resolve(here, '..', '..', 'db', 'schema.sql'), // server/db/schema.sql
    resolve(here, '..', 'db', 'schema.sql'),
    resolve(process.cwd(), 'db', 'schema.sql'),
    resolve(process.cwd(), 'server', 'db', 'schema.sql'),
  )
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    `Không tìm thấy schema.sql. Đã thử: ${candidates.join(', ')}. ` +
      'Đặt KNIT_SCHEMA để chỉ định đường dẫn tuyệt đối.',
  )
}

const SCHEMA_FILE = findSchemaFile()

const main = async () => {
  const sql = readFileSync(SCHEMA_FILE, 'utf8')
  const statements = splitStatements(sql)

  console.log(`[knit-migrate] áp dụng ${statements.length} câu lệnh từ ${SCHEMA_FILE}`)

  for (const statement of statements) {
    try {
      await pool.query(statement)
    } catch (err) {
      // Bảng đã tồn tại với cấu trúc khác là lỗi thật — dừng lại để lộ ra.
      const message = err instanceof Error ? err.message : String(err)
      console.error('[knit-migrate] câu lệnh thất bại:\n', statement.slice(0, 200))
      throw new Error(`Migration thất bại: ${message}`)
    }
  }

  console.log('[knit-migrate] xong — lược đồ đã sẵn sàng.')
}

main()
  .then(async () => {
    await closePool()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[knit-migrate] lỗi:', err)
    await closePool().catch(() => undefined)
    process.exit(1)
  })

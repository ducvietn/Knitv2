/**
 * Sinh `server/src/db/schema.generated.ts` từ `server/db/schema.sql`.
 *
 * Vì sao cần bước này?
 *
 * `schema.sql` là nguồn duy nhất cho lược đồ Postgres — cùng nội dung được
 * dùng cho `supabase db push` và cho script migration. Nhưng ứng dụng chạy
 * trong container không có đường dẫn tới file `.sql` sau khi được bundle
 * bằng esbuild (chỉ file được `import` mới được đóng gói).
 *
 * Nên file này nhúng nội dung schema thành một hằng số string, để app có
 * thể tự tạo lược đồ khi khởi động mà không cần script riêng.
 *
 * Dùng:  node scripts/build-schema.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(ROOT, 'server/db/schema.sql')
const TARGET = resolve(ROOT, 'server/src/db/schema.generated.ts')

const sql = readFileSync(SOURCE, 'utf8')

const target = `/**
 * Lược đồ Postgres dạng string — KHÔNG sửa file này.
 *
 * Sinh tự động từ \`server/db/schema.sql\` bằng:
 *   node scripts/build-schema.mjs
 *
 * Nguồn duy nhất là \`server/db/schema.sql\`.
 */

/* eslint-disable */
export const POSTGRES_SCHEMA = ${JSON.stringify(sql)}
`

writeFileSync(TARGET, target, 'utf8')
console.log(`[build-schema] đã ghi ${TARGET} (${sql.length} ký tự)`)

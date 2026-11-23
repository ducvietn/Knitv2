/**
 * Thiết lập Supabase cho KNIT.
 *
 * Gồm hai bước:
 *
 * 1. `supabase db push --remote=<url>` — áp dụng
 *    `supabase/migrations/0001_init.sql` thẳng vào database.
 * 2. `npm run seed:pg` — nạp dữ liệu mẫu vào Postgres.
 *
 * Cần biến môi trường:
 *
 *   DATABASE_URL — connection string (URI, port 5432) của project Supabase
 *                 (Project Settings > Database > Connection string > URI)
 *
 * KHÔNG cần access token: `db push --remote=<url>` nối thẳng bằng mật
 * khẩu database nên bỏ qua hoàn toàn `supabase link`.
 *
 * Chạy:  node scripts/setup-supabase.mjs
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DATABASE_URL = process.env.DATABASE_URL ?? ''

const step = (n, text) => console.log(`\n[${n}] ${text}`)

/** Chạy một lệnh, trả về mã thoát. */
const run = (command, args, env = {}) => {
  console.log(`   $ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  })
  return result.status ?? 1
}

if (!DATABASE_URL) {
  console.error('Thiếu DATABASE_URL (Project Settings > Database > Connection string > URI).')
  process.exit(1)
}

/* --------------------------------------------------------------- 1. db push */
step(1, 'Áp dụng schema (supabase db push --remote=<url>)')

/**
 * `db push --remote=<url>` nối thẳng bằng connection string nên KHÔNG cần
 * `supabase link` và không cần access token — chỉ cần mật khẩu database
 * (đã nằm sẵn trong `DATABASE_URL`).
 *
 * Đây là đường ngắn nhất: `supabase link` đòi token có quyền
 * "Project Settings + API Keys + API Key Secrets" (read), thường gây lỗi
 * 403 với token bị scope hẹp.
 */
const pushCode = run('supabase', [
  'db',
  'push',
  '--remote',
  DATABASE_URL,
  '--include-seed=false',
  '--yes',
])
if (pushCode !== 0) {
  console.error('   `db push` thất bại.')
  console.error('   Nếu không dùng CLI được, mở SQL Editor trên dashboard và chạy')
  console.error('   nội dung của `supabase/migrations/0001_init.sql`.')
  process.exit(1)
}

/* ----------------------------------------------------------------- 2. seed */
step(2, 'Nạp dữ liệu mẫu')
const seedCode = run('npm', ['--prefix', 'server', 'run', 'seed:pg'], {
  DATABASE_URL,
})
if (seedCode !== 0) {
  console.warn('   seed thất bại — chạy lại sau khi kiểm tra DATABASE_URL.')
  process.exit(1)
}

console.log(`
Hoàn tất Supabase.

Còn lại:
  - Tạo bucket Storage tên "avatars" (Dashboard > Storage > New bucket,
    bật Public) nếu muốn ảnh avatar sống sót qua các lần restart container.
  - Deploy app lên Northflank:  node scripts/deploy-northflank.mjs
`)

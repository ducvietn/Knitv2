/**
 * Thiết lập Supabase cho KNIT.
 *
 * Gồm ba bước:
 *
 * 1. `supabase link` — liên kết project Supabase với thư mục này.
 * 2. `supabase db push` — áp dụng `supabase/migrations/0001_init.sql`.
 * 3. `npm run seed:pg` — nạp dữ liệu mẫu vào Postgres.
 *
 * Cần biến môi trường:
 *
 *   SUPABASE_ACCESS_TOKEN — token từ Dashboard > Account > Access Tokens
 *   DATABASE_URL         — connection string (URI, port 5432) của project
 *
 * Tuỳ chọn:
 *
 *   SUPABASE_PROJECT_REF — project ref (lấy từ URL project)
 *
 * Chạy:  node scripts/setup-supabase.mjs
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? ''
const DATABASE_URL = process.env.DATABASE_URL ?? ''
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? ''

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

if (!ACCESS_TOKEN) {
  console.error('Thiếu SUPABASE_ACCESS_TOKEN (Dashboard > Account > Access Tokens).')
  process.exit(1)
}
if (!DATABASE_URL) {
  console.error('Thiếu DATABASE_URL (Project Settings > Database > Connection string > URI).')
  process.exit(1)
}
if (!PROJECT_REF) {
  console.error('Thiếu SUPABASE_PROJECT_REF (lấy từ URL: https://<ref>.supabase.co).')
  process.exit(1)
}

/* ------------------------------------------------------------- 1. login */
step(1, 'Đăng nhập Supabase CLI')
if (run('supabase', ['login', '--token', ACCESS_TOKEN]) !== 0) {
  console.error('   đăng nhập thất bại.')
  process.exit(1)
}

/* -------------------------------------------------------------- 2. link */
step(2, `Liên kết project ${PROJECT_REF}`)
if (run('supabase', ['link', '--project-ref', PROJECT_REF]) !== 0) {
  console.error('   link thất bại.')
  process.exit(1)
}

/* --------------------------------------------------------------- 3. db push */
step(3, 'Áp dụng schema (supabase db push)')
const pushCode = run('supabase', ['db', 'push', '--include-seed=false'])
if (pushCode !== 0) {
  console.error('   `db push` thất bại.')
  console.error('   Nếu không dùng CLI được, mở SQL Editor trên dashboard và chạy')
  console.error('   nội dung của `supabase/migrations/0001_init.sql`.')
  process.exit(1)
}

/* ----------------------------------------------------------------- 4. seed */
step(4, 'Nạp dữ liệu mẫu')
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

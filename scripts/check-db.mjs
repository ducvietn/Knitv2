/**
 * Kiem tra ket noi Postgres.
 *
 * Dung:
 *   $env:DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-<N>-<region>.pooler.supabase.com:5432/postgres"
 *   node scripts/check-db.mjs
 *
 * Script se thu ca hai che do:
 *   1. Session pooler    (port 5432) — dung cho app dai han
 *   2. Transaction pooler (port 6543) — dung cho serverless
 *
 * Luu y: `pg` khong tu phan giai host/port tu DATABASE_URL, nen script
 * tu tach phan de doi cong.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pg = require('../server/node_modules/pg')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Thieu DATABASE_URL.')
  console.error(
    'Vi du:\n' +
      '  $env:DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-<N>-<region>.pooler.supabase.com:5432/postgres"',
  )
  process.exit(1)
}

const parsed = new URL(url)
const host = parsed.hostname
const user = parsed.username
const password = decodeURIComponent(parsed.password)

console.log(`Host   : ${host}`)
console.log(`User   : ${user}`)
console.log(`Port   : ${parsed.port || 5432}`)
console.log(`Database: ${parsed.pathname.replace(/^\//, '')}\n`)

const ports = [Number(parsed.port || 5432), 6543].filter((p, i, a) => a.indexOf(p) === i)

for (const port of ports) {
  const label = port === 6543 ? 'transaction pooler' : 'session pooler'
  const testUrl = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}${parsed.pathname}`

  const pool = new pg.Pool({
    connectionString: testUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  })

  try {
    const r = await pool.query(
      'SELECT current_database() AS db, current_user AS u, version() AS v',
    )
    console.log(`[OK] ${label} (:${port})`)
    console.log(`     db=${r.rows[0].db} user=${r.rows[0].u}`)
    console.log(`     ${r.rows[0].v.split(',')[0]}`)
  } catch (e) {
    console.log(`[FAIL] ${label} (:${port}) -> code=${e.code} :: ${String(e.message).slice(0, 90)}`)
  } finally {
    await pool.end().catch(() => {})
  }
}

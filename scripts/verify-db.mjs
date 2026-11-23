/**
 * Kiem tra du lieu trong Postgres (mac dinh la Supabase cua project KNIT).
 *
 * Chuoi ket noi lay tu bien moi truong `DATABASE_URL`:
 *   $env:DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-<N>-<region>.pooler.supabase.com:5432/postgres"
 *   npm run verify:db
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pg = require('../server/node_modules/pg')

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Thieu DATABASE_URL.')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
})

const tables = [
  'users', 'questions', 'answers', 'answer_sources',
  'helpful_votes', 'also_need_votes', 'follows',
  'topic_follows', 'notifications', 'reports',
]

try {
  const info = await pool.query(
    'SELECT current_database() AS db, current_user AS u, version() AS v',
  )
  console.log(`db=${info.rows[0].db} user=${info.rows[0].u}`)
  console.log(`${info.rows[0].v.split(',')[0]}\n`)

  console.log('=== Bang trong database ===')
  for (const t of tables) {
    try {
      const r = await pool.query(`SELECT count(*)::int AS n FROM ${t}`)
      console.log(`  ${t.padEnd(18)} ${r.rows[0].n}`)
    } catch (e) {
      console.log(`  ${t.padEnd(18)} LOI: ${String(e.message).slice(0, 60)}`)
    }
  }

  console.log('\n=== Vi du du lieu ===')
  const q = await pool.query(
    'SELECT title, topic FROM questions ORDER BY created_at DESC LIMIT 3',
  )
  for (const row of q.rows) console.log(`  [Q] ${row.title} (${row.topic})`)

  const u = await pool.query('SELECT email, display_name FROM users ORDER BY email LIMIT 3')
  for (const row of u.rows) console.log(`  [U] ${row.email} — ${row.display_name}`)
} finally {
  await pool.end().catch(() => {})
}

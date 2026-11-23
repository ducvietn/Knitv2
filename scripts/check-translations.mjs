/**
 * Xem cap do dich cua cac ban ghi trong database.
 *
 * Dung:
 *   $env:DATABASE_URL="postgresql://..."
 *   node scripts/check-translations.mjs
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

try {
  console.log('=== Cau hoi ===')
  const q = await pool.query(
    `SELECT id, title, title_en,
            CASE WHEN title_en IS NULL OR title_en = title THEN 'CHUA DICH' ELSE 'da dich' END AS st
       FROM questions ORDER BY created_at DESC LIMIT 10`,
  )
  for (const r of q.rows) {
    console.log(`  [${r.st}] ${r.id}`)
    console.log(`      VI : ${r.title}`)
    console.log(`      EN : ${r.title_en}`)
  }

  console.log('\n=== Cau tra loi ===')
  const a = await pool.query(
    `SELECT id, body, body_en,
            CASE WHEN body_en IS NULL OR body_en = body THEN 'CHUA DICH' ELSE 'da dich' END AS st
       FROM answers WHERE length(body) > 0 ORDER BY created_at DESC LIMIT 6`,
  )
  for (const r of a.rows) {
    console.log(`  [${r.st}] ${r.id}`)
    console.log(`      VI : ${r.body.slice(0, 100)}`)
    console.log(`      EN : ${String(r.body_en).slice(0, 100)}`)
  }

  console.log('\n=== Thong ke ===')
  const s = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM questions WHERE title_en IS NOT NULL AND title_en <> title) AS q_dich,
      (SELECT count(*)::int FROM questions) AS q_total,
      (SELECT count(*)::int FROM answers WHERE body_en IS NOT NULL AND body_en <> body) AS a_dich,
      (SELECT count(*)::int FROM answers WHERE length(body) > 0) AS a_total
  `)
  const row = s.rows[0]
  console.log(`  Cau hoi : ${row.q_dich}/${row.q_total} da dich`)
  console.log(`  Tra loi : ${row.a_dich}/${row.a_total} da dich`)
} finally {
  await pool.end().catch(() => {})
}

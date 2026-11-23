/**
 * Xem noi dung day du cua mot bai viet trong DB — dung khi can kiem tra
 * xem snippet co bi cat khong.
 *
 * Dung: node scripts/inspect-answer.mjs "<tieu de can tim>"
 */
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.render', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

for (const [k, v] of Object.entries(env)) {
  if (v && !process.env[k]) process.env[k] = v
}

const { sql } = await import('../server/dist/testkit.js')

const needle = process.argv[2] ?? ''

const rows = await sql.prepare(
  `SELECT q.title AS q_title, a.body AS a_body, LENGTH(a.body) AS len
     FROM questions q JOIN answers a ON a.question_id = q.id
    WHERE q.title LIKE ? OR a.body LIKE ?`,
).all(`%${needle}%`, `%${needle}%`)

for (const row of rows) {
  console.log('---')
  console.log('TIEU DE:', row.q_title)
  console.log('DO DAI :', row.len)
  console.log('NOI DUNG:')
  console.log(row.a_body)
}

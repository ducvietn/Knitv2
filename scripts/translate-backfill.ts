/**
 * Dịch lại những câu hỏi / câu trả lời chưa có bản tiếng Anh.
 *
 * Dùng sau khi bật tính năng dịch lần đầu, hoặc khi muốn dịch lại toàn bộ.
 *
 * Dung:
 *   $env:DATABASE_URL="postgresql://..."
 *   $env:OPENAI_API_KEY="sk-..."
 *   $env:KNIT_TRANSLATE_BASE_URL="https://modelapi.vn/v1"
 *   npm run translate:backfill -- --limit 50
 */
import { sql } from '../server/src/lib/db'
import {
  translateAnswerInBackground,
  translateQuestionInBackground,
} from '../server/src/lib/translate'

const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1] ?? 20) : 20

const main = async () => {
  console.log('=== Backfill dich ===')
  console.log(`  limit moi loai: ${LIMIT}\n`)

  /* 1. Cau hoi thieu ban dich */
  const questions = await sql
    .prepare(
      `SELECT id, title FROM questions
        WHERE title_en IS NULL OR title_en = title
        LIMIT ?`,
    )
    .all<{ id: string; title: string }>(LIMIT)

  console.log(`=== Cau hoi can dich: ${questions.length} ===`)
  for (const q of questions) console.log(`  ${q.id}: ${q.title.slice(0, 70)}`)

  /* 2. Cau tra loi thieu ban dich */
  const answers = await sql
    .prepare(
      `SELECT id, body FROM answers
        WHERE (body_en IS NULL OR body_en = body) AND length(body) > 0
        LIMIT ?`,
    )
    .all<{ id: string; body: string }>(LIMIT)

  console.log(`\n=== Cau tra loi can dich: ${answers.length} ===`)
  for (const a of answers) console.log(`  ${a.id}: ${a.body.slice(0, 70)}`)

  /* 3. Cho module xu ly nen */
  for (const q of questions) translateQuestionInBackground(q.id)
  for (const a of answers) translateAnswerInBackground(a.id)

  const total = questions.length + answers.length
  console.log(`\n=== Da khoi chue ${total} muc ===`)
  console.log('Cho API tra ket qua (10-40 giay)...')

  await new Promise((r) => setTimeout(r, 40_000))

  const stillQ = await sql
    .prepare(
      `SELECT count(*) AS c FROM questions WHERE title_en IS NULL OR title_en = title`,
    )
    .all<{ c: number }>()
  const stillA = await sql
    .prepare(
      `SELECT count(*) AS c FROM answers WHERE body_en IS NULL OR body_en = body`,
    )
    .all<{ c: number }>()

  console.log(`\n=== Ket qua ===`)
  console.log(`  cau hoi chua dich:    ${stillQ[0]?.c ?? '?'}`)
  console.log(`  cau tra loi chua dich: ${stillA[0]?.c ?? '?'}`)

  await sql.close()
  process.exit(0)
}

main().catch(async (err) => {
  console.error('[backfill] loi:', err)
  await sql.close().catch(() => undefined)
  process.exit(1)
})

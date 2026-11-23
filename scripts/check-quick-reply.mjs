/**
 * Kiem tra buoc "tuc thi" (khong cho model) co tra ve nguon hay khong.
 *
 * Dung: node scripts/check-quick-reply.mjs
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

const API = process.env.KNIT_API ?? 'https://knitv2.onrender.com'
const QUESTION = 'Toi lay ma sinh vien o dau'

// Buoc tuc thi — khong cho model.
const quick = await (
  await fetch(`${API}/api/chatbot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: QUESTION, lang: 'vi' }),
  })
).json()

console.log('BUOC TUC THI')
console.log('  ready      :', quick.ready)
console.log('  sources    :', quick.sources?.length, '(phai la 0)')
console.log('  suggestPost:', quick.suggestPost, '(phai la false)')
console.log('  answer     :', quick.answer)

// Buoc cho — co ket qua LLM re-rank.
const full = await (
  await fetch(`${API}/api/chatbot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: QUESTION, lang: 'vi', wait: true }),
  })
).json()

console.log('\nBUOC CHO')
console.log('  ready      :', full.ready)
console.log('  sources    :', full.sources?.length, '(phai la <= 4)')
for (const s of (full.sources ?? [])) {
  console.log(`    - ${s.title}`)
}
console.log('  suggestPost:', full.suggestPost)

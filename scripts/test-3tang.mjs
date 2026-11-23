/**
 * Kiem tra kien truc 3 tang cua chatbot dieu huong.
 *
 * Dung: node scripts/build-testkit.mjs && node scripts/test-3tang.mjs
 *
 * Chay qua tung cau hoi mau (tieng Viet co dau / khong dau / tieng Anh) va in ra
 * ket qua tung tang de thay ro bot co hieu nghia khong.
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

const { normaliseIntent, retrieveCandidates, chat } = await import('../server/dist/testkit.js')

const QUESTIONS = [
  'Toi lay ma sinh vien o dau',
  'Làm thẻ sinh viên ở đâu',
  'Where do I get a student ID?',
  'Em lỡ rớt môn này thì kỳ sau học lại đóng tiền thế nào ạ?',
  'Toi nen choi game bao nhieu tieng',
  'Thủ tục miễn nghĩa vụ quân sự thế nào',
  'How do I get a certificate of enrollment?',
]

for (const question of QUESTIONS) {
  console.log('\n' + '='.repeat(70))
  console.log('CAU HOI:', question)

  // Tang 1
  const intent = await normaliseIntent(question)
  console.log('  [T1] intent  :', intent?.intent ?? '(that bai)')
  console.log('  [T1] concept :', intent?.concept ?? '(that bai)')
  console.log('  [T1] keywords:', intent?.keywords?.join(' | ') ?? '(that bai)')

  // Tang 2
  const queries = [question, intent?.concept ?? '', ...(intent?.keywords ?? [])].filter(Boolean)
  const candidates = await retrieveCandidates(queries, 20)
  console.log(`  [T2] ung vien: ${candidates.length}`)
  for (const hit of candidates.slice(0, 5)) {
    console.log(`       - ${hit.title} (${hit.kind}, score ${hit.score})`)
  }

  // Tang 3 + tong hop
  const reply = await chat({ question, lang: 'vi' }, true)
  console.log('  [T3] tra loi :', reply.answer?.slice(0, 300))
  console.log('  [T3] nguon  :', reply.sources.length)
  for (const s of reply.sources.slice(0, 4)) {
    console.log(`       - ${s.title} — ${s.authorName} ${s.authorCohort}`)
  }
  console.log('  suggestPost  :', reply.suggestPost)
}

console.log('\n' + '='.repeat(70))
console.log('Xong.')

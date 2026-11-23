/**
 * Kiem tra nguon rong khi chatbot noi "khong co bai nao lien quan".
 *
 * Dung: node scripts/check-no-false-sources.mjs
 *
 * Voi moi cau hoi: in ra so nguon va cau tra loi. Neu bot noi "khong co bai"
 * nhung van co nguon → LOI.
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

const { chat } = await import('../server/dist/testkit.js')

/**
 * Câu hỏi KHÔNG có bài viết nào trong diễn đàn — bot phải nói "chưa có bài"
 * và KHÔNG được kèm thẻ nguồn.
 */
const NO_MATCH = [
  'Làm sao để xin visa du lịch sang Nhật?',
  'Bánh xe điện của em có bảo hành ở đâu?',
  'Cách đăng ký tài khoản Gmail mới nhất',
  'Trường có xe buýt đưa đón sinh viên không?',
]

/** Câu hỏi CÓ bài viết — bot phải trả về nguồn. */
const HAS_MATCH = [
  'Toi lay ma sinh vien o dau',
  'Where do I get a student ID?',
  'Thủ tục miễn nghĩa vụ quân sự thế nào',
]

const NO_RESULT_WORDS = [
  'chưa có bài',
  'chưa tìm thấy',
  'không có bài',
  'không tìm thấy',
  'chưa tìm được',
  'không tìm được',
  'no threads',
  'nothing found',
  'no information',
]

let failures = 0

const check = async (question, expectSources) => {
  const reply = await chat({ question, lang: 'vi' }, true)
  const claimsNoResult = NO_RESULT_WORDS.some((w) =>
    reply.answer.toLowerCase().includes(w),
  )
  const hasSources = reply.sources.length > 0

  const ok = expectSources ? hasSources && !claimsNoResult : !hasSources && claimsNoResult
  if (!ok) failures++

  console.log(`${ok ? '  OK ' : '  FAIL'} | ${question}`)
  console.log(`        nguon=${hasSources} (${reply.sources.length}) noiKhongCo=${claimsNoResult}`)
  console.log(`        ${reply.answer.slice(0, 160)}`)
  for (const s of reply.sources.slice(0, 3)) console.log(`        - ${s.title}`)
}

console.log('CAU HOI KHONG CO BAI — phai noi "chua co bai" va KHONG co the nguon:')
for (const q of NO_MATCH) await check(q, false)

console.log('\nCAU HOI CO BAI — phai co the nguon:')
for (const q of HAS_MATCH) await check(q, true)

console.log(`\nKet qua: ${failures === 0 ? 'TAT CA PASS' : `${failures} LOI`}`)
process.exit(failures === 0 ? 0 : 1)

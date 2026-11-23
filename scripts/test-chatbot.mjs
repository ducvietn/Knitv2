/**
 * Kiem thu chatbot dieu huong theo luong 2 buoc.
 *
 * Buoc 1: goi khong cho -> phai tra ve nhanh (< 1s) kem the nguon.
 * Buoc 2: goi cho -> phai tra ve cau tra loi day du.
 *
 * Dung: node scripts/test-chatbot.mjs [base-url]
 */
const BASE = process.argv[2] ?? 'http://localhost:4123/api'

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* khong phai JSON */
  }
  return { status: res.status, data }
}

const questions = [
  'Làm sao để xin giấy xác nhận sinh viên hoãn nghĩa vụ quân sự?',
  'Đăng ký học phần bị trùng lịch thì có được ưu tiên không?',
  'Thủ tục miễn nghĩa vụ quân sự ở đâu?',
]

for (const question of questions) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`HOI: ${question}`)

  // Buoc 1 — khong cho.
  const t0 = Date.now()
  const quick = await call('/chatbot', { method: 'POST', body: { question, lang: 'vi' } })
  const quickMs = Date.now() - t0
  console.log(`\nBUOC 1 (khong cho): ${quick.status} (${quickMs}ms)  ready=${quick.data?.ready}`)
  console.log(`  tra loi tam thoi: ${quick.data?.answer}`)
  console.log(`  so nguon: ${quick.data?.sources?.length ?? 0}`)

  // Buoc 2 — cho.
  const t1 = Date.now()
  const full = await call('/chatbot', {
    method: 'POST',
    body: { question, lang: 'vi', wait: true },
  })
  const fullMs = Date.now() - t1
  console.log(`\nBUOC 2 (cho): ${full.status} (${fullMs}ms)  ready=${full.data?.ready}`)
  console.log(`\nTRA LOI DAY DU:\n${full.data?.answer}`)

  console.log(`\nNGUON (${full.data?.sources?.length ?? 0}):`)
  for (const s of full.data?.sources ?? []) {
    console.log(
      `  - [${s.kind}] ${s.title}\n    tac gia: ${s.authorName} ${s.authorCohort}` +
        `${s.authorVerified ? ' [tick xanh]' : ''}${s.accepted ? ' [giai quyet]' : ''}`,
    )
  }

  const d = full.data
  console.log(`\nDE XUAT DANG BAI: ${d?.suggestPost}`)
  if (d?.suggestPost) {
    console.log(`  tieu de: ${d.suggestedTitle}`)
    console.log(`  noi dung: ${d.suggestedBody}`)
    console.log(`  an danh: ${d.suggestAnonymous}`)
  }
}

/**
 * Smoke test chatbot dieu huong tren production (Render).
 *
 * Dung: node scripts/smoke-chatbot.mjs
 *
 * Gui cac cau hoi da ngon ngu va in ra ket qua de kiem chung Tầng 1-3
 * dang chay tren may chu that.
 */
const QUESTIONS = [
  ['Toi lay ma sinh vien o dau', 'VI khong dau'],
  ['Làm thẻ sinh viên ở đâu', 'VI co dau'],
  ['Where do I get a student ID?', 'EN'],
  ['Em lỡ rớt môn này thì kỳ sau học lại đóng tiền thế nào ạ?', 'VI'],
  ['Toi nen choi game bao nhieu tieng', 'VI khong dau'],
  ['Thủ tục miễn nghĩa vụ quân sự thế nào', 'VI'],
  ['How do I get a certificate of enrollment?', 'EN'],
]

const API = process.env.KNIT_API ?? 'https://knitv2.onrender.com'

for (const [question, label] of QUESTIONS) {
  console.log('\n' + '='.repeat(70))
  console.log(`[${label}] ${question}`)

  const started = Date.now()
  try {
    const res = await fetch(`${API}/api/chatbot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, lang: 'vi', wait: true }),
    })

    if (!res.ok) {
      console.log(`  HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
      continue
    }

    const data = await res.json()
    console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s)`)
    console.log('  TRA LOI:', data.answer?.slice(0, 400))
    console.log(`  NGUON (${data.sources?.length ?? 0}):`)
    for (const s of (data.sources ?? []).slice(0, 4)) {
      console.log(`    - ${s.title} — ${s.authorName} ${s.authorCohort}`)
    }
    console.log('  suggestPost:', data.suggestPost)
  } catch (err) {
    console.log('  LOI:', err.message)
  }
}

console.log('\n' + '='.repeat(70))
console.log('Xong.')

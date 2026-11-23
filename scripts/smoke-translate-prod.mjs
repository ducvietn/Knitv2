/**
 * Smoke test tren production: kiem tra endpoint moi /api/translate hoat dong.
 *
 * Dung: node scripts/smoke-translate-prod.mjs
 */
const BASE = 'https://knitv2.onrender.com/api'

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

// 1. Health check.
const health = await call('/health')
console.log(`health -> ${health.status} ${JSON.stringify(health.data)}`)

// 2. Dang ky tai khoan de tao noi dung chua co ban dich.
const email = `smoke${Date.now()}@ulis.vnu.edu.vn`
const reg = await call('/auth/register', {
  method: 'POST',
  body: {
    email,
    password: 'Test@12345',
    displayName: 'Smoke Test',
    facultyVi: 'Khoa Ngon ngu',
    facultyEn: 'Faculty of Languages',
    cohort: 'K23',
  },
})
if (reg.status !== 200 && reg.status !== 201) {
  console.log('DANG KY THAT BAI:', reg.status, JSON.stringify(reg.data).slice(0, 250))
  process.exit(1)
}
const auth = { Authorization: `Bearer ${reg.data.token}` }
console.log('dang ky OK')

// 3. Tao cau hoi tieng Viet.
const q = await call('/questions', {
  method: 'POST',
  headers: auth,
  body: {
    title: 'Lam sao de dang ky hoc phan khi bi trung lich voi mon khac',
    body: 'Toi dang can nghi, co ai biet quy trinh uu tien khi bi trung lich hoc phan khong?',
    topic: 'hoc-tap',
    anonymous: false,
    tags: [],
  },
})
if (q.status !== 201) {
  console.log('TAO CAU HOI THAT BAI:', q.status, JSON.stringify(q.data).slice(0, 250))
  process.exit(1)
}
const questionId = q.data.question.id
console.log(`tao cau hoi OK ${questionId}`)

// 4. Tao cau tra loi.
const a = await call(`/questions/${questionId}/answers`, {
  method: 'POST',
  headers: auth,
  body: {
    body: 'Ban nen xem trang dang ky hoc phan cua hoc ky truoc, phan trung lich thuong duoc ghi ro trong thong bao.',
    accepted: false,
  },
})
const answerId = a.data?.answers?.[0]?.id
console.log(`tao cau tra loi OK ${answerId ?? 'that bai'}`)

// 5. GOI ENDPOINT DICH — thuong xuyen la nhanh hon vi may Render da cache.
const t0 = Date.now()
const tr = await call('/translate', {
  method: 'POST',
  headers: auth,
  body: { questionIds: [questionId], answerIds: answerId ? [answerId] : [] },
})
const ms = Date.now() - t0

console.log(`\nPOST /api/translate -> ${tr.status} (${ms}ms)`)
if (tr.status !== 200) {
  console.log(JSON.stringify(tr.data).slice(0, 400))
  process.exit(1)
}

const dq = tr.data.questions?.[0]
const da = tr.data.answers?.[0]
console.log('  titleEn:', dq?.titleEn)
console.log('  bodyEn :', dq?.bodyEn)
console.log('  ansEn  :', da?.bodyEn)

const ok = dq?.titleEn && dq.titleEn !== dq.title
console.log('\n=> DICH:', ok ? 'CO' : 'KHONG')

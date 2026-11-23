/**
 * Smoke test tren URL public cua Render.
 *
 * Dung:
 *   node scripts/smoke-public.mjs [base-url]
 */
const BASE = (process.argv[2] ?? 'https://knitv2.onrender.com').replace(/\/+$/, '')

console.log(`=== Smoke test ${BASE} ===\n`)

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`  ${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? ' — ' + detail : ''}`)
}

/* 1. Health */
try {
  const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(120_000) })
  const j = await r.json()
  check('GET /api/health', r.ok, JSON.stringify(j))
} catch (e) {
  check('GET /api/health', false, `${e.cause?.code ?? e.message}`)
  console.log('\nKhong goi duoc — service co the dang cold start (free plan). Thu lai sau 60s.')
  process.exit(1)
}

/* 2. Danh sach cau hoi */
const qs = await fetch(`${BASE}/api/questions`, { signal: AbortSignal.timeout(60_000) })
const qj = await qs.json()
const qCount = Array.isArray(qj) ? qj.length : (qj.questions?.length ?? 0)
check('GET /api/questions', qs.ok && qCount > 0, `${qCount} cau hoi`)

/* 3. Chi tiet */
const q1 = await fetch(`${BASE}/api/questions/q1`, { signal: AbortSignal.timeout(60_000) })
const q1j = await q1.json()
check('GET /api/questions/q1', q1.ok, q1j?.title ?? q1j?.question?.title ?? '')

/* 4. Dang nhap */
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'a2@ulis.vnu.edu.vn', password: 'knit1234' }),
  signal: AbortSignal.timeout(60_000),
})
const lj = await login.json()
const token = lj?.token ?? lj?.accessToken
check('POST /api/auth/login', login.ok && Boolean(token), token ? 'lay duoc token' : JSON.stringify(lj).slice(0, 150))

if (token) {
  const auth = { Authorization: `Bearer ${token}` }

  const me = await fetch(`${BASE}/api/me`, { headers: auth, signal: AbortSignal.timeout(60_000) })
  const mj = await me.json()
  check('GET /api/me', me.ok, mj?.email ?? mj?.user?.email ?? '')

  const notif = await fetch(`${BASE}/api/notifications`, { headers: auth, signal: AbortSignal.timeout(60_000) })
  const nj = await notif.json()
  const nCount = Array.isArray(nj) ? nj.length : (nj.notifications?.length ?? 0)
  check('GET /api/notifications', notif.ok, `${nCount} thong bao`)

  const topics = await fetch(`${BASE}/api/questions/topics/hoc-tap/follow`, {
    method: 'POST',
    headers: auth,
    signal: AbortSignal.timeout(60_000),
  })
  check('POST /api/questions/topics/:topic/follow', topics.ok, `status=${topics.status}`)
}

/* 5. Web static */
const web = await fetch(BASE, { signal: AbortSignal.timeout(60_000) })
const html = await web.text()
check(
  'GET / (web static)',
  web.ok && html.includes('<html'),
  `status=${web.status}, ${html.length} bytes`,
)

const failed = results.filter((r) => !r.ok)
console.log(`\n=== Ket qua: ${results.length - failed.length}/${results.length} pass ===`)
if (failed.length) console.log(`FAIL: ${failed.map((f) => f.name).join(', ')}`)

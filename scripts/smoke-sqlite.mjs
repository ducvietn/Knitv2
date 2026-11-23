/**
 * Smoke test API với driver SQLite (đường chạy local).
 *
 * Dùng chung bộ kiểm thử với `smoke-postgres.mjs` — chỉ khác ở chỗ không
 * cần Postgres: server được khởi động với `KNIT_DB_DRIVER=sqlite`.
 *
 * Chạy:  npx tsx scripts/smoke-sqlite.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4125
const BASE = `http://127.0.0.1:${PORT}`

let failures = 0
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  [OK] ${label}`)
  } else {
    failures += 1
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const api = async (path, options = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, body }
}

/* --------------------------------------------------------- 1. server */
console.log('\n[1] Khởi động server với driver SQLite')
// Windows cần `.cmd` để spawn được shim của npm.
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(NPX, ['tsx', 'src/index.ts'], {
  cwd: resolve(ROOT, 'server'),
  env: {
    ...process.env,
    KNIT_DB_DRIVER: 'sqlite',
    DATABASE_URL: '',
    KNIT_DB: resolve(ROOT, '.tmp-smoke/knit.db'),
    KNIT_AVATAR_DIR: resolve(ROOT, '.tmp-smoke/avatars'),
    KNIT_SEED: resolve(ROOT, 'server/seed-data.json'),
    KNIT_WEB_DIST: resolve(ROOT, 'app/dist'),
    KNIT_SECRET: 'smoke-test-secret-smoke-test-secret-1234',
    PORT: String(PORT),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
child.stdout.on('data', (d) => (serverLog += d.toString()))
child.stderr.on('data', (d) => (serverLog += d.toString()))

// Chờ server sẵn sàng.
let ready = false
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500))
  try {
    const res = await fetch(`${BASE}/api/health`)
    if (res.ok) {
      ready = true
      break
    }
  } catch {
    // Chưa lên — thử lại.
  }
}
check('server khởi động', ready, serverLog.slice(-400))
if (!ready) {
  child.kill()
  process.exit(1)
}

/* --------------------------------------------------------- 2. health */
console.log('\n[2] Health check')
const health = await api('/api/health')
check('GET /api/health trả 200', health.status === 200, `status=${health.status}`)
check('health có trường ok', health.body?.ok === true, JSON.stringify(health.body))

/* -------------------------------------------------------- 3. câu hỏi */
console.log('\n[3] Đọc câu hỏi')
const questions = await api('/api/questions')
check('GET /api/questions trả 200', questions.status === 200, `status=${questions.status}`)
const list = questions.body?.questions
check('danh sách câu hỏi có dữ liệu', Array.isArray(list) && list.length > 0, `len=${list?.length}`)
const first = list?.[0]
check('câu hỏi có tác giả', Boolean(first?.author?.displayName))
check('answerCount dạng số', typeof first?.answerCount === 'number', `type=${typeof first?.answerCount}`)
check('tags dạng mảng', Array.isArray(first?.tags), JSON.stringify(first?.tags))
check('views dạng số', typeof first?.views === 'number', `type=${typeof first?.views}`)

const detail = await api(`/api/questions/${first.id}`)
check('GET /api/questions/:id trả 200', detail.status === 200, `status=${detail.status}`)

/* -------------------------------------------------------- 4. tìm kiếm */
console.log('\n[4] Tìm kiếm')
const search = await api('/api/questions?q=' + encodeURIComponent('đăng ký'))
check('tìm kiếm trả 200', search.status === 200, `status=${search.status}`)

/* ------------------------------------------------------- 5. đăng nhập */
console.log('\n[5] Đăng nhập')
const login = await api('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'a2@ulis.vnu.edu.vn', password: 'knit1234' }),
})
check(
  'đăng nhập thành công',
  login.status === 200,
  `status=${login.status} ${JSON.stringify(login.body)}`,
)
const token = login.body?.token
check('nhận được token', typeof token === 'string' && token.length > 0)
const authHeader = { Authorization: `Bearer ${token}` }

/* ----------------------------------------------------------- 6. hồ sơ */
console.log('\n[6] Hồ sơ cá nhân')
const me = await api('/api/me', { headers: authHeader })
check('GET /api/me trả 200', me.status === 200, `status=${me.status}`)
check('có danh sách câu hỏi của tôi', Array.isArray(me.body?.myQuestions))
check('có chủ đề đã theo dõi', Array.isArray(me.body?.followedTopics))

/* -------------------------------------------------------- 7. trả lời */
console.log('\n[7] Trả lời câu hỏi')
const answer = await api(`/api/questions/${first.id}/answers`, {
  method: 'POST',
  headers: authHeader,
  body: JSON.stringify({ body: 'Câu trả lời từ smoke test SQLite.' }),
})
check(
  'POST trả lời trả 201',
  answer.status === 201,
  `status=${answer.status} ${JSON.stringify(answer.body)}`,
)

const afterAnswer = await api(`/api/questions/${first.id}`)
const answerCount = (afterAnswer.body?.question ?? afterAnswer.body)?.answerCount
check(
  'answerCount tăng sau khi trả lời',
  typeof answerCount === 'number' && answerCount >= 1,
  `answerCount=${answerCount}`,
)

/* --------------------------------------------------------- 8. bài hay */
console.log('\n[8] Đánh dấu "bài hay"')
const answerId = answer.body?.answers?.[0]?.id
if (answerId) {
  const helpful = await api(`/api/answers/${answerId}/helpful`, {
    method: 'POST',
    headers: authHeader,
  })
  check('POST helpful trả 200', helpful.status === 200, `status=${helpful.status}`)
} else {
  check('có id câu trả lời để đánh dấu', false, JSON.stringify(answer.body))
}

/* ------------------------------------------------------ 9. thông báo */
console.log('\n[9] Thông báo')
const notifications = await api('/api/notifications', { headers: authHeader })
check('GET /api/notifications trả 200', notifications.status === 200, `status=${notifications.status}`)

/* ------------------------------------------------------ 10. câu hỏi mới */
console.log('\n[10] Đăng câu hỏi mới')
const created = await api('/api/questions', {
  method: 'POST',
  headers: authHeader,
  body: JSON.stringify({
    title: 'Câu hỏi tạo từ smoke test SQLite',
    body: 'Nội dung kiểm thử.',
    topic: 'hoc-tap',
    tags: ['smoke'],
  }),
})
check(
  'POST câu hỏi trả 201',
  created.status === 201,
  `status=${created.status} ${JSON.stringify(created.body)}`,
)
check('câu hỏi mới có id', Boolean(created.body?.question?.id))

/* ---------------------------------------------------------- 11. quyền */
console.log('\n[11] Phân quyền admin')
const adminLogin = await api('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'a6@ulis.vnu.edu.vn', password: 'knit1234' }),
})
if (adminLogin.status === 200) {
  const adminHeader = { Authorization: `Bearer ${adminLogin.body.token}` }
  const stats = await api('/api/admin/stats', { headers: adminHeader })
  check('GET /api/admin/stats trả 200', stats.status === 200, `status=${stats.status}`)
  check(
    'thống kê có số câu hỏi',
    typeof stats.body?.questions === 'number',
    JSON.stringify(stats.body),
  )
} else {
  check('đăng nhập admin', false, `status=${adminLogin.status}`)
}
const forbidden = await api('/api/admin/stats', { headers: authHeader })
check(
  'user thường bị chặn khỏi /api/admin/stats',
  forbidden.status === 403,
  `status=${forbidden.status}`,
)

/* -------------------------------------------------------- 12. avatar */
console.log('\n[12] Avatar (filesystem)')
const tone = await api('/api/avatar/tone', {
  method: 'PATCH',
  headers: authHeader,
  body: JSON.stringify({ tone: 'emerald' }),
})
check(
  'PATCH /api/avatar/tone trả 200',
  tone.status === 200,
  `status=${tone.status} ${JSON.stringify(tone.body)}`,
)

child.kill()
await new Promise((r) => setTimeout(r, 500))

console.log(
  failures === 0
    ? '\nSmoke test API voi SQLite deu pass.'
    : `\n${failures} kiem thu that bai.`,
)
process.exit(failures === 0 ? 0 : 1)

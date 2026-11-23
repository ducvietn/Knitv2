/**
 * Smoke test API với driver Postgres.
 *
 * Khởi động server thật (`server/src/index.ts`) trên Postgres (PGlite qua
 * socket shim `pg`), rồi gọi các endpoint chính bằng `fetch` — đúng như
 * trình duyệt thật.
 *
 * Chạy:  npx tsx scripts/smoke-postgres.mjs
 */
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  [OK] ${label}`)
  } else {
    failures += 1
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const { PGlite } = await import('@electric-sql/pglite')
const { createPgConfig } = await import('@electric-sql/pglite/node-postgres')

const db = await PGlite.create()
await db.waitReady

const pg = require(resolve(ROOT, 'server/node_modules/pg'))
const pool = new pg.Pool(createPgConfig(db))

/* --------------------------------------------- 1. schema + dữ liệu mẫu */
console.log('\n[1] Chuẩn bị dữ liệu')
const { readFileSync } = require('node:fs')
const { splitStatements } = await import(
  pathToFileURL(resolve(ROOT, 'server/src/lib/sql.ts')).href
)
const schema = readFileSync(resolve(ROOT, 'server/db/schema.sql'), 'utf8')
for (const statement of splitStatements(schema)) {
  await pool.query(statement)
}
check('schema đã áp dụng', true)

const seedBundle = JSON.parse(readFileSync(resolve(ROOT, 'server/seed-data.json'), 'utf8'))
const bcrypt = require(resolve(ROOT, 'server/node_modules/bcryptjs'))
const passwordHash = bcrypt.hashSync('knit1234', 10)

for (const a of seedBundle.authors) {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, avatar_tone, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (id) DO NOTHING`,
    [a.id, a.email, passwordHash, a.displayName, a.facultyVi, a.facultyEn, a.cohort, a.role, a.verified, a.avatarSeed, a.avatarTone ?? 'brand'],
  )
}
for (const q of seedBundle.questions) {
  await pool.query(
    `INSERT INTO questions (id, title, title_en, body, body_en, topic, author_id, created_at, also_need, views, anonymous, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
    [q.id, q.title, q.titleEn, q.body, q.bodyEn, q.topic, q.author.id, q.createdAt, q.alsoNeed, q.views, q.anonymous, JSON.stringify(q.tags)],
  )
}
for (const a of seedBundle.answers) {
  await pool.query(
    `INSERT INTO answers (id, question_id, author_id, body, body_en, created_at, accepted, helpful_count,
       variant_context, variant_context_en, variant_anonymous,
       referral_office, referral_office_en, referral_note, referral_note_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
    [a.id, a.questionId, a.author.id, a.body, a.bodyEn, a.createdAt, a.accepted, a.helpful, a.variant?.context ?? null, a.variant?.contextEn ?? null, a.variant ? a.variant.anonymous : null, a.referral?.office ?? null, a.referral?.officeEn ?? null, a.referral?.note ?? null, a.referral?.noteEn ?? null],
  )
  for (const s of a.sources) {
    await pool.query(
      `INSERT INTO answer_sources (answer_id, title, url, publisher) VALUES ($1,$2,$3,$4)`,
      [a.id, s.title, s.url, s.publisher],
    )
  }
}
for (const n of seedBundle.notifications) {
  await pool.query(
    `INSERT INTO notifications (id, user_id, kind, title, title_en, body, body_en, at, read, question_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
    [n.id, 'a2', n.kind, n.title, n.titleEn, n.body, n.bodyEn, n.at, n.read, n.questionId ?? null],
  )
}
check(`nạp ${seedBundle.authors.length} tài khoản mẫu`, true)

/* ------------------------------------------------ 2. khởi động server */
console.log('\n[2] Khởi động server với driver postgres')
process.env.KNIT_DB_DRIVER = 'postgres'
process.env.DATABASE_URL = 'postgres://postgres@localhost:5432/postgres'
process.env.KNIT_SECRET = 'smoke-test-secret-smoke-test-secret-1234'
process.env.PORT = '4123'
process.env.KNIT_WEB_DIST = resolve(ROOT, 'app/dist')
// Dùng SQLite tạm cho avatar — Postgres không cần thư mục này.
process.env.KNIT_AVATAR_DIR = resolve(ROOT, '.tmp-smoke-avatars')

const { setPool } = await import(pathToFileURL(resolve(ROOT, 'server/src/lib/pg.ts')).href)
setPool(pool)

await import(pathToFileURL(resolve(ROOT, 'server/src/index.ts')).href)
await new Promise((r) => setTimeout(r, 1500))

const BASE = 'http://127.0.0.1:4123'
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

/* ----------------------------------------------------------- 3. health */
console.log('\n[3] Health check')
const health = await api('/api/health')
check('GET /api/health trả 200', health.status === 200, `status=${health.status}`)
check(
  'health có trường ok',
  health.body?.ok === true || health.body?.status !== undefined,
  JSON.stringify(health.body),
)

/* ------------------------------------------------------------ 4. câu hỏi */
console.log('\n[4] Đọc câu hỏi')
const questions = await api('/api/questions')
check('GET /api/questions trả 200', questions.status === 200, `status=${questions.status}`)
const list = Array.isArray(questions.body) ? questions.body : questions.body?.questions
check('danh sách câu hỏi có dữ liệu', Array.isArray(list) && list.length > 0, `len=${list?.length}`)
const first = list?.[0]
check('câu hỏi có tác giả', Boolean(first?.author?.displayName), JSON.stringify(first?.author))
check(
  'câu hỏi có answerCount dạng số',
  typeof first?.answerCount === 'number',
  `type=${typeof first?.answerCount}`,
)
check('câu hỏi có tags dạng mảng', Array.isArray(first?.tags), `tags=${JSON.stringify(first?.tags)}`)
check('views dạng số', typeof first?.views === 'number', `type=${typeof first?.views}`)

const detail = await api(`/api/questions/${first.id}`)
check('GET /api/questions/:id trả 200', detail.status === 200, `status=${detail.status}`)

/* ------------------------------------------------------------ 5. tìm kiếm */
console.log('\n[5] Tìm kiếm (LIKE trên JSONB)')
const search = await api('/api/questions?q=' + encodeURIComponent('đăng ký'))
check('tìm kiếm trả 200', search.status === 200, `status=${search.status}`)

/* ----------------------------------------------------------- 6. đăng nhập */
console.log('\n[6] Đăng nhập')
const login = await api('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'a2@ulis.vnu.edu.vn', password: 'knit1234' }),
})
check(
  'đăng nhập thành công',
  login.status === 200,
  `status=${login.status} body=${JSON.stringify(login.body)}`,
)
const token = login.body?.token
check('nhận được token', typeof token === 'string' && token.length > 0)

const authHeader = { Authorization: `Bearer ${token}` }

/* ------------------------------------------------------------ 7. hồ sơ */
console.log('\n[7] Hồ sơ cá nhân')
const me = await api('/api/me', { headers: authHeader })
check('GET /api/me trả 200', me.status === 200, `status=${me.status}`)
check('có danh sách câu hỏi của tôi', Array.isArray(me.body?.myQuestions), JSON.stringify(Object.keys(me.body ?? {})))
check('có danh sách câu trả lời của tôi', Array.isArray(me.body?.myAnswers))
check('có chủ đề đã theo dõi', Array.isArray(me.body?.followedTopics))

/* --------------------------------------------------------- 8. trả lời */
console.log('\n[8] Trả lời câu hỏi')
const answer = await api(`/api/questions/${first.id}/answers`, {
  method: 'POST',
  headers: authHeader,
  body: JSON.stringify({ body: 'Câu trả lời từ smoke test Postgres.' }),
})
check(
  'POST trả lời trả 201',
  answer.status === 201,
  `status=${answer.status} body=${JSON.stringify(answer.body)}`,
)

const afterAnswer = await api(`/api/questions/${first.id}`)
const questionBody = afterAnswer.body?.question ?? afterAnswer.body
const answerCount = questionBody?.answerCount
check(
  'answerCount tăng sau khi trả lời',
  typeof answerCount === 'number' && answerCount >= 1,
  `answerCount=${answerCount}`,
)

/* ------------------------------------------------------- 9. bài hay */
console.log('\n[9] Đánh dấu "bài hay"')
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

/* --------------------------------------------------- 10. thông báo */
console.log('\n[10] Thông báo')
const notifications = await api('/api/notifications', { headers: authHeader })
check('GET /api/notifications trả 200', notifications.status === 200, `status=${notifications.status}`)

/* --------------------------------------------------- 11. câu hỏi mới */
console.log('\n[11] Đăng câu hỏi mới')
const created = await api('/api/questions', {
  method: 'POST',
  headers: authHeader,
  body: JSON.stringify({
    title: 'Câu hỏi tạo từ smoke test Postgres',
    body: 'Nội dung kiểm thử đường dẫn Postgres.',
    topic: 'hoc-tap',
    tags: ['smoke', 'postgres'],
  }),
})
check(
  'POST câu hỏi trả 201',
  created.status === 201,
  `status=${created.status} body=${JSON.stringify(created.body)}`,
)
check('câu hỏi mới có id', Boolean(created.body?.question?.id))

/* ---------------------------------------------------------- 12. quyền */
console.log('\n[12] Phân quyền admin')
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
  console.log('  [BỎ QUA] không đăng nhập được tài khoản admin')
}

const forbidden = await api('/api/admin/stats', { headers: authHeader })
check(
  'user thường bị chặn khỏi /api/admin/stats',
  forbidden.status === 403,
  `status=${forbidden.status}`,
)

await pool.end()
await db.close()

console.log(
  failures === 0
    ? '\nSmoke test API voi Postgres deu pass.'
    : `\n${failures} kiem thu that bai.`,
)
process.exit(failures === 0 ? 0 : 1)

/**
 * Kiểm thử end-to-end với driver Postgres thật.
 *
 * Khác với `test-postgres.mjs` (chạy PGlite trực tiếp), script này dùng
 * chính `pg.Pool` — đúng client mà production dùng với Supabase — kết nối
 * vào PGlite qua socket shim `@electric-sql/pglite/node-postgres`.
 *
 * Nhờ đó mọi đường đi qua code thật:
 *   `server/src/lib/sql.ts` -> `postgresDriver` -> `server/src/lib/pg.ts` -> `pg.Pool`
 *
 * Chạy:  node scripts/test-pg-e2e.mjs
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
const { Pool } = pg

const pool = new Pool(createPgConfig(db))

/* ------------------------------------------------------ 1. adapter -> pool */
console.log('\n[1] Adapter `sql.ts` chạy qua `pg.Pool` thật')

// Nạp adapter với `DATABASE_URL` giả — pool thật được tiêm vào từ dưới lên
// qua `setPool`, nên adapter đi qua đúng đường của production.
process.env.KNIT_DB_DRIVER = 'postgres'
process.env.DATABASE_URL = 'postgres://postgres@localhost:5432/postgres'

const { setPool } = await import(
  pathToFileURL(resolve(ROOT, 'server/src/lib/pg.ts')).href
)
setPool(pool)

const { sql, splitStatements, toPositional } = await import(
  pathToFileURL(resolve(ROOT, 'server/src/lib/sql.ts')).href
)

check('adapter chọn driver postgres', sql.name === 'postgres', `name=${sql.name}`)

/* ------------------------------------------------------------ 2. schema */
console.log('\n[2] Áp dụng schema Postgres')
const { readFileSync } = require('node:fs')
const schema = readFileSync(resolve(ROOT, 'server/db/schema.sql'), 'utf8')
const statements = splitStatements(schema)
for (const statement of statements) {
  await pool.query(statement)
}
check(`chạy ${statements.length} câu lệnh`, true)

const tables = await pool.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
)
const tableNames = tables.rows.map((r) => r.table_name)
for (const expected of [
  'also_need_votes',
  'answer_sources',
  'answers',
  'follows',
  'helpful_votes',
  'notifications',
  'questions',
  'reports',
  'topic_follows',
  'users',
]) {
  check(`bảng ${expected}`, tableNames.includes(expected))
}

/* -------------------------------------------------------- 3. tham số */
console.log('\n[3] Tham số hoá — `$1, $2` và kiểu dữ liệu')
const inserted = await sql
  .prepare(
    `INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, avatar_tone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(
    'e2e-1',
    'e2e@ulis.vnu.edu.vn',
    'hash',
    'E2E User',
    'Khoa Toán',
    'Mathematics',
    'K19',
    'student',
    true,
    'AB',
    'brand',
    '2026-01-01T00:00:00.000Z',
  )
check('INSERT với tham số hoá chạy được', inserted.changes === 1, `changes=${inserted.changes}`)

const row = await sql.prepare('SELECT * FROM users WHERE id = ?').get('e2e-1')
check('đọc lại được', Boolean(row))
check('BOOLEAN trả về boolean thật', row?.verified === true, `verified=${row?.verified}`)

const updated = await sql
  .prepare('UPDATE users SET display_name = ? WHERE id = ?')
  .run('Đã đổi tên', 'e2e-1')
check('UPDATE chạy được', updated.changes === 1, `changes=${updated.changes}`)

/* --------------------------------------------------------- 4. JSONB */
console.log('\n[4] Cột JSONB (`tags`)')
await sql
  .prepare(
    `INSERT INTO questions (id, title, title_en, body, body_en, topic, author_id, created_at, also_need, views, anonymous, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(
    'e2e-q1',
    'Câu h��i thử JSONB',
    'JSONB test question',
    'Nội dung',
    'Body',
    'hoc-tap',
    'e2e-1',
    '2026-01-01T00:00:00.000Z',
    0,
    0,
    false,
    JSON.stringify(['đăng ký', 'học phí']),
  )
const tags = await sql.prepare('SELECT tags FROM questions WHERE id = ?').get('e2e-q1')
check('JSONB trả về array', Array.isArray(tags?.tags), `tags=${JSON.stringify(tags?.tags)}`)

const matched = await sql
  .prepare("SELECT id FROM questions WHERE " + sql.jsonAsText('tags') + " LIKE ?")
  .all('%học phí%')
check('LIKE trên JSONB (::text) hoạt động', matched.length === 1, `rows=${matched.length}`)

/* --------------------------------------------- 5. ON CONFLICT DO NOTHING */
console.log('\n[5] `insertIgnore` -> ON CONFLICT DO NOTHING')
await sql.prepare('INSERT INTO follows (user_id, question_id) VALUES (?, ?)').run('e2e-1', 'e2e-q1')
const again = await sql
  .prepare(sql.insertIgnore('INSERT INTO follows (user_id, question_id) VALUES (?, ?)'))
  .run('e2e-1', 'e2e-q1')
check('không tạo bản ghi trùng', again.changes === 0, `changes=${again.changes}`)

const removed = await sql.prepare('DELETE FROM users WHERE id = ?').run('e2e-1')
check('DELETE chạy được', removed.changes === 1, `changes=${removed.changes}`)

/* ------------------------------------------------------- 6. transaction */
console.log('\n[6] Transaction — rollback khi lỗi')
await sql
  .prepare(
    `INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, avatar_tone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(
    'e2e-tx',
    'e2e-tx@ulis.vnu.edu.vn',
    'hash',
    'TX',
    'K',
    'K',
    'K20',
    'student',
    false,
    'TX',
    'brand',
    '2026-01-01T00:00:00.000Z',
  )
try {
  await sql.transaction(async (tx) => {
    await tx
      .prepare('UPDATE users SET display_name = ? WHERE id = ?')
      .run('Đổi trong transaction', 'e2e-tx')
    throw new Error('cố tình lỗi')
  })
} catch {
  // Bỏ qua — lỗi cố ý.
}
const afterRollback = await sql.prepare('SELECT display_name FROM users WHERE id = ?').get('e2e-tx')
check('rollback hoạt động', afterRollback?.display_name === 'TX', `name=${afterRollback?.display_name}`)
// Dọn bản ghi thử để phần seed bên dưới đếm đúng.
await sql.prepare('DELETE FROM users WHERE id = ?').run('e2e-tx')

/* ------------------------------------------------------- 7. bigint count */
console.log('\n[7] Cột đếm BIGINT')
const countRow = await sql
  .prepare('SELECT COUNT(*)::bigint AS c FROM answers')
  .get()
check('COUNT trả về number', typeof countRow?.c === 'number', `type=${typeof countRow?.c}`)

/* ------------------------------------------------------------- 8. seed */
console.log('\n[8] Nạp dữ liệu mẫu qua `server/src/db/seed.ts`')
const seedBundle = JSON.parse(readFileSync(resolve(ROOT, 'server/seed-data.json'), 'utf8'))
const bcrypt = require(resolve(ROOT, 'server/node_modules/bcryptjs'))
const passwordHash = bcrypt.hashSync('knit1234', 10)

for (const a of seedBundle.authors) {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, avatar_tone, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (id) DO NOTHING`,
    [
      a.id,
      a.email,
      passwordHash,
      a.displayName,
      a.facultyVi,
      a.facultyEn,
      a.cohort,
      a.role,
      a.verified,
      a.avatarSeed,
      a.avatarTone ?? 'brand',
    ],
  )
}
for (const q of seedBundle.questions) {
  await pool.query(
    `INSERT INTO questions (id, title, title_en, body, body_en, topic, author_id, created_at, also_need, views, anonymous, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
    [
      q.id,
      q.title,
      q.titleEn,
      q.body,
      q.bodyEn,
      q.topic,
      q.author.id,
      q.createdAt,
      q.alsoNeed,
      q.views,
      q.anonymous,
      JSON.stringify(q.tags),
    ],
  )
}
for (const a of seedBundle.answers) {
  await pool.query(
    `INSERT INTO answers (id, question_id, author_id, body, body_en, created_at, accepted, helpful_count,
       variant_context, variant_context_en, variant_anonymous,
       referral_office, referral_office_en, referral_note, referral_note_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
    [
      a.id,
      a.questionId,
      a.author.id,
      a.body,
      a.bodyEn,
      a.createdAt,
      a.accepted,
      a.helpful,
      a.variant?.context ?? null,
      a.variant?.contextEn ?? null,
      a.variant ? a.variant.anonymous : null,
      a.referral?.office ?? null,
      a.referral?.officeEn ?? null,
      a.referral?.note ?? null,
      a.referral?.noteEn ?? null,
    ],
  )
  for (const s of a.sources) {
    await pool.query(
      `INSERT INTO answer_sources (answer_id, title, url, publisher) VALUES ($1,$2,$3,$4)`,
      [a.id, s.title, s.url, s.publisher],
    )
  }
}

const userCount = await pool.query('SELECT COUNT(*)::int AS c FROM users')
check(`nạp ${seedBundle.authors.length} tài khoản`, userCount.rows[0].c === seedBundle.authors.length, `c=${userCount.rows[0].c}`)
const questionCount = await pool.query('SELECT COUNT(*)::int AS c FROM questions')
check(
  `nạp ${seedBundle.questions.length} câu hỏi`,
  questionCount.rows[0].c === seedBundle.questions.length,
  `c=${questionCount.rows[0].c}`,
)
const answerCount = await pool.query('SELECT COUNT(*)::int AS c FROM answers')
check(
  `nạp ${seedBundle.answers.length} câu trả lời`,
  answerCount.rows[0].c === seedBundle.answers.length,
  `c=${answerCount.rows[0].c}`,
)

/* --------------------------------------------------- 9. truy vấn thật */
console.log('\n[9] Truy vấn giống `repo.ts` — câu hỏi kèm tác giả')
const questionRows = await sql
  .prepare(
    `SELECT q.id, q.title, q.topic, q.tags, u.display_name AS author_name,
            (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id)::bigint AS answer_count
     FROM questions q
     JOIN users u ON u.id = q.author_id
     WHERE q.id = ?`,
  )
  .all(seedBundle.questions[0].id)
check('trả về câu hỏi', questionRows.length === 1)
check('có cột answer_count', typeof questionRows[0]?.answer_count === 'number')
check('tags là array', Array.isArray(questionRows[0]?.tags))

/* --------------------------------------------------------- 10. cascade */
console.log('\n[10] ON DELETE CASCADE')
await pool.query('DELETE FROM users WHERE id = $1', [seedBundle.questions[0].author.id])
const orphan = await pool.query('SELECT COUNT(*)::int AS c FROM questions WHERE author_id = $1', [
  seedBundle.questions[0].author.id,
])
check('câu hỏi bị xoá theo tác giả', orphan.rows[0].c === 0, `c=${orphan.rows[0].c}`)

await pool.end()
await db.close()

console.log(
  failures === 0
    ? '\nTat ca kiem thu end-to-end voi pg.Pool deu pass.'
    : `\n${failures} kiem thu that bai.`,
)
process.exit(failures === 0 ? 0 : 1)

/**
 * Kiểm thử lớp trừu hợp trên nền Postgres thật (PGlite — Postgres biên dịch
 * sang WASM, chạy ngay trong Node, không cần cài server).
 *
 * PGlite không cài được qua `pg` driver, nên script này chạy trực tiếp
 * các câu lệnh SQL mà `server/src/lib/sql.ts` sinh ra — đủ để kiểm chứng:
 *
 * - Lược đồ Postgres đúng và tạo được.
 * - Phép chuyển `?` -> `$1` đúng với chuỗi và comment.
 * - `ON CONFLICT DO NOTHING` chạy được.
 * - Cột JSONB trả về object.
 *
 * Dùng:  node scripts/test-postgres.mjs
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Ban sao logic trong `server/src/lib/sql.ts` (de test khong can build TS). */
function splitStatements(sql) {
  const statements = []
  let current = ''
  let inString = false
  let inLineComment = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      continue
    }
    if (inString) {
      current += ch
      if (ch === "'") {
        if (next === "'") {
          current += next
          i++
        } else {
          inString = false
        }
      }
      continue
    }
    if (ch === '-' && next === '-') {
      inLineComment = true
      i++
      continue
    }
    if (ch === "'") {
      inString = true
      current += ch
      continue
    }
    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }
    current += ch
  }
  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)
  return statements
}

function toPositional(sql) {
  let out = ''
  let index = 0
  let inString = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]
    if (inString) {
      out += ch
      if (ch === "'") {
        if (next === "'") {
          out += next
          i++
        } else {
          inString = false
        }
      }
      continue
    }
    if (ch === "'") {
      inString = true
      out += ch
      continue
    }
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i)
      if (end === -1) {
        out += sql.slice(i)
        break
      }
      out += sql.slice(i, end)
      i = end - 1
      continue
    }
    if (ch === '?') {
      index += 1
      out += `$${index}`
      continue
    }
    out += ch
  }
  return out
}

let failures = 0
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  [OK] ${label}`)
  } else {
    failures += 1
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const db = await PGlite.create()

console.log('\n[1] Luoc do Postgres')
const schemaSql = readFileSync(resolve(ROOT, 'server/db/schema.sql'), 'utf8')
const statements = splitStatements(schemaSql)
check(`chia thanh ${statements.length} cau lenh`, statements.length > 15)
for (const statement of statements) {
  await db.exec(statement)
}
const tables = await db.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
)
const tableNames = tables.rows.map((r) => r.table_name)
for (const expected of [
  'users',
  'questions',
  'answers',
  'answer_sources',
  'helpful_votes',
  'also_need_votes',
  'follows',
  'topic_follows',
  'notifications',
  'reports',
]) {
  check(`bang ${expected}`, tableNames.includes(expected))
}

console.log('\n[2] Chay lai luoc do khong loi (IF NOT EXISTS)')
for (const statement of statements) {
  await db.exec(statement)
}
check('chay lai luoc do thanh cong', true)

console.log('\n[3] Chuyen `?` -> `$n`')
check('don gian', toPositional('SELECT * FROM t WHERE id = ?') === 'SELECT * FROM t WHERE id = $1')
check(
  'nhieu tham so',
  toPositional('SELECT * FROM t WHERE a = ? AND b = ?') ===
    'SELECT * FROM t WHERE a = $1 AND b = $2',
)
check(
  'bo qua dau ? trong chuoi',
  toPositional("SELECT * FROM t WHERE a = 'x?y' AND b = ?") ===
    "SELECT * FROM t WHERE a = 'x?y' AND b = $1",
)
check(
  'bo qua comment',
  toPositional('SELECT 1 -- ghi chu ?\nWHERE a = ?') === 'SELECT 1 -- ghi chu ?\nWHERE a = $1',
)

console.log('\n[4] Ghi va doc du lieu')
await db.exec(`
  INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, avatar_tone, created_at)
  VALUES ('u1', 'a@ulis.vnu.edu.vn', 'hash', 'A', 'Khoa', 'Faculty', 'K18', 'student', FALSE, 'AA', 'brand', NOW())
`)

const verified = await db.query('SELECT verified FROM users WHERE id = $1', ['u1'])
check('cot BOOLEAN tra ve boolean that', verified.rows[0].verified === false)

await db.query('UPDATE users SET verified = $1 WHERE id = $2', [true, 'u1'])
const verified2 = await db.query('SELECT verified FROM users WHERE id = $1', ['u1'])
check('cap nhat BOOLEAN hoat dong', verified2.rows[0].verified === true)

await db.query(
  `INSERT INTO questions (id, title, title_en, body, body_en, topic, author_id, created_at, also_need, views, anonymous, tags)
   VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),0,0,FALSE,$8)`,
  ['q1', 'Tieu de', 'Title', 'Noi dung', 'Body', 'hoc-tap', 'u1', JSON.stringify(['a', 'b'])],
)
const q = await db.query('SELECT tags FROM questions WHERE id = $1', ['q1'])
check('cot JSONB tra ve array', Array.isArray(q.rows[0].tags) && q.rows[0].tags.length === 2)

const search = await db.query(
  'SELECT id FROM questions WHERE title LIKE $1 OR body LIKE $2 OR tags::text LIKE $3',
  ['%Tieu%', '%nope%', '%a%'],
)
check('LIKE tren cot JSONB (::text) hoat dong', search.rows.length === 1)

console.log('\n[5] INSERT OR IGNORE -> ON CONFLICT DO NOTHING')
// `db.exec()` cua PGlite khong ho tro tham so — phai dung `db.query()`.
await db.query(
  'INSERT INTO follows (user_id, question_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
  ['u1', 'q1'],
)
await db.query(
  'INSERT INTO follows (user_id, question_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
  ['u1', 'q1'],
)
const follows = await db.query('SELECT COUNT(*)::int AS c FROM follows')
check('khong tao ban ghi trung', follows.rows[0].c === 1, `c=${follows.rows[0].c}`)

console.log('\n[6] Xoa cascaded')
await db.query('DELETE FROM users WHERE id = $1', ['u1'])
const orphans = await db.query('SELECT COUNT(*)::int AS c FROM questions')
check('cau hoi bi xoa theo user', orphans.rows[0].c === 0)

console.log('\n[7] Cot `at` (tu kho khong reserved trong Postgres)')
await db.exec(`
  INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, avatar_tone, created_at)
  VALUES ('u2', 'b@ulis.vnu.edu.vn', 'hash', 'B', 'Khoa', 'Faculty', 'K18', 'student', FALSE, 'BB', 'brand', NOW())
`)
await db.exec(
  `INSERT INTO notifications (id, user_id, kind, title, title_en, body, body_en, at, read, question_id)
   VALUES ('n1', 'u2', 'system', 'Tieu de', 'Title', 'Noi dung', 'Body', NOW(), FALSE, NULL)`,
)
const notif = await db.query('SELECT at FROM notifications WHERE id = $1', ['n1'])
check('cot `at` dung duoc lam ten cot', notif.rows.length === 1)
check('`at` tra ve Date', notif.rows[0].at instanceof Date)

console.log('\n[8] Nap du lieu mau')
// Xoa sach truoc de so dem chinh xac (buoc 7 da them mot tai khoan).
await db.exec(`
  TRUNCATE answer_sources, helpful_votes, also_need_votes, follows, topic_follows,
           notifications, reports, answers, questions, users CASCADE
`)
const seed = JSON.parse(readFileSync(resolve(ROOT, 'server/seed-data.json'), 'utf8'))
await db.exec('BEGIN')
for (const a of seed.authors) {
  await db.query(
    `INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, avatar_tone, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (id) DO NOTHING`,
    [a.id, a.email, 'hash', a.displayName, a.facultyVi, a.facultyEn, a.cohort, a.role, a.verified, a.avatarSeed, a.avatarTone ?? 'brand'],
  )
}
for (const qd of seed.questions) {
  await db.query(
    `INSERT INTO questions (id, title, title_en, body, body_en, topic, author_id, created_at, also_need, views, anonymous, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
    [qd.id, qd.title, qd.titleEn, qd.body, qd.bodyEn, qd.topic, qd.author.id, qd.createdAt, qd.alsoNeed, qd.views, qd.anonymous, JSON.stringify(qd.tags)],
  )
}
for (const a of seed.answers) {
  await db.query(
    `INSERT INTO answers (id, question_id, author_id, body, body_en, created_at, accepted, helpful_count,
       variant_context, variant_context_en, variant_anonymous,
       referral_office, referral_office_en, referral_note, referral_note_en)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING`,
    [a.id, a.questionId, a.author.id, a.body, a.bodyEn, a.createdAt, a.accepted, a.helpful,
      a.variant?.context ?? null, a.variant?.contextEn ?? null, a.variant ? a.variant.anonymous : null,
      a.referral?.office ?? null, a.referral?.officeEn ?? null, a.referral?.note ?? null, a.referral?.noteEn ?? null],
  )
  for (const s of a.sources) {
    await db.query(
      'INSERT INTO answer_sources (answer_id, title, url, publisher) VALUES ($1,$2,$3,$4)',
      [a.id, s.title, s.url, s.publisher],
    )
  }
}
await db.exec('COMMIT')

const counts = await db.query(`
  SELECT
    (SELECT COUNT(*)::int FROM users) AS users,
    (SELECT COUNT(*)::int FROM questions) AS questions,
    (SELECT COUNT(*)::int FROM answers) AS answers,
    (SELECT COUNT(*)::int FROM answer_sources) AS sources
`)
const c = counts.rows[0]
check(`nap ${c.users} tai khoan`, c.users === seed.authors.length, `expected ${seed.authors.length}`)
check(`nap ${c.questions} cau hoi`, c.questions === seed.questions.length, `expected ${seed.questions.length}`)
check(`nap ${c.answers} cau tra loi`, c.answers === seed.answers.length, `expected ${seed.answers.length}`)
check('co nguon chinh thuc', c.sources > 0)

console.log('\n[9] Truy van cau hoi kem tac gia (nhu `repo.ts`)')
const rows = await db.query(`
  SELECT q.*, u.id AS a_id, u.display_name AS a_display_name,
         (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) AS answer_count
  FROM questions q JOIN users u ON u.id = q.author_id
  ORDER BY q.created_at DESC LIMIT 3
`)
check('tra ve cau hoi', rows.rows.length === 3)
check('co cot answer_count', typeof rows.rows[0].answer_count === 'number')
check('tags la array', Array.isArray(rows.rows[0].tags))

await db.close()

console.log(
  failures === 0
    ? '\nTat ca kiem thu Postgres deu pass.\n'
    : `\nCon ${failures} kiem thu fail.\n`,
)
process.exit(failures === 0 ? 0 : 1)

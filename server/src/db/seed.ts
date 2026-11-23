/**
 * Nạp dữ liệu mẫu vào Postgres.
 *
 * Dùng:  npm --prefix server run seed:pg
 *
 * Đọc `server/seed-data.json` (cùng định dạng với bản SQLite) rồi nạp vào
 * cơ sở dữ liệu trong `DATABASE_URL`. Mặc định là nạp thêm, không xoá dữ
 * liệu sẵn có — truyền `--replace` để xoá sạch trước.
 *
 * Mật khẩu chung cho mọi tài khoản mẫu: `knit1234`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { closePool, pool } from '../lib/pg'
import type { SeedBundle } from '../seed-data'

const DEFAULT_PASSWORD = 'knit1234'

/**
 * Tìm file `seed-data.json` bằng cách dò ngược từ thư mục module.
 *
 * Xem giải thích ở `migrate.ts` — `process.cwd()` trong container là `/app`
 * nên đường dẫn tương đối sẽ không tồn tại.
 */
function findSeedFile(): string {
  const override = process.env.KNIT_SEED
  if (override) return resolve(process.cwd(), override)

  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '..', '..', 'seed-data.json'), // server/seed-data.json
    resolve(here, '..', 'seed-data.json'),
    resolve(process.cwd(), 'seed-data.json'),
    resolve(process.cwd(), 'server', 'seed-data.json'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    `Không tìm thấy seed-data.json. Đã thử: ${candidates.join(', ')}. ` +
      'Đặt KNIT_SEED để chỉ định đường dẫn tuyệt đối.',
  )
}

const SEED_FILE = findSeedFile()
const replace = process.argv.includes('--replace')

const main = async () => {
  const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as SeedBundle
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    if (replace) {
      console.log('[knit-seed-pg] xoá dữ liệu cũ...')
      await client.query(`
        DELETE FROM answer_sources;
        DELETE FROM helpful_votes;
        DELETE FROM also_need_votes;
        DELETE FROM follows;
        DELETE FROM topic_follows;
        DELETE FROM notifications;
        DELETE FROM reports;
        DELETE FROM answers;
        DELETE FROM questions;
        DELETE FROM users;
      `)
    }

    // Băm mật khẩu một lần cho tất cả tài khoản mẫu — chậm hơn nhiều so với
    // băm lặp lại, nhưng dữ liệu mẫu chỉ có vài chục tài khoản.
    const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10)

    for (const a of seed.authors) {
      await client.query(
        `INSERT INTO users (
           id, email, password_hash, display_name, faculty_vi, faculty_en, cohort,
           role, verified, avatar_seed, avatar_tone, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (id) DO NOTHING`,
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

    for (const q of seed.questions) {
      await client.query(
        `INSERT INTO questions (
           id, title, title_en, body, body_en, topic, author_id, created_at,
           also_need, views, anonymous, tags
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO NOTHING`,
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

    for (const a of seed.answers) {
      await client.query(
        `INSERT INTO answers (
           id, question_id, author_id, body, body_en, created_at, accepted, helpful_count,
           variant_context, variant_context_en, variant_anonymous,
           referral_office, referral_office_en, referral_note, referral_note_en
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO NOTHING`,
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
        await client.query(
          `INSERT INTO answer_sources (answer_id, title, url, publisher)
           VALUES ($1,$2,$3,$4)`,
          [a.id, s.title, s.url, s.publisher],
        )
      }
    }

    // Thông báo có `questionId` thuộc về người hỏi câu đó; thông báo hệ thống
    // thì dành cho tài khoản mẫu chính (a2) để luôn có gì để xem khi demo.
    const questionOwner = new Map<string, string>(
      seed.questions.map((q) => [q.id, q.author.id] as const),
    )
    for (const n of seed.notifications) {
      const owner = n.questionId ? questionOwner.get(n.questionId) : undefined
      await client.query(
        `INSERT INTO notifications (
           id, user_id, kind, title, title_en, body, body_en, at, read, question_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          n.id,
          owner ?? 'a2',
          n.kind,
          n.title,
          n.titleEn,
          n.body,
          n.bodyEn,
          n.at,
          n.read,
          n.questionId ?? null,
        ],
      )
    }

    for (const r of seed.reports) {
      await client.query(
        `INSERT INTO reports (
           id, user_id, question_id, answer_id, reason, detail, status, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [r.id, 'a2', r.questionId, r.answerId ?? null, r.reason, r.detail, r.status, r.createdAt],
      )
    }

    // Theo dõi mẫu: một số câu hỏi và chủ đề có người theo dõi để trang cá
    // nhân hiển thị đầy đủ ngay khi mở bản dựng.
    const follows: [string, string][] = [
      ['a2', 'q1'],
      ['a2', 'q4'],
      ['a2', 'q7'],
    ]
    for (const [userId, questionId] of follows) {
      await client.query(
        `INSERT INTO follows (user_id, question_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [userId, questionId],
      )
    }

    for (const [userId, topic] of [
      ['a2', 'hoc-tap'],
      ['a2', 'thu-tuc'],
    ] as [string, string][]) {
      await client.query(
        `INSERT INTO topic_follows (user_id, topic) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [userId, topic],
      )
    }

    for (const [userId, questionId] of [
      ['a2', 'q1'],
      ['a2', 'q3'],
    ] as [string, string][]) {
      await client.query(
        `INSERT INTO also_need_votes (question_id, user_id) VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [questionId, userId],
      )
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }

  console.log('[knit-seed-pg] đã nạp dữ liệu mẫu:')
  console.log(
    `  ${seed.authors.length} tài khoản · ${seed.questions.length} câu hỏi · ${seed.answers.length} câu trả lời`,
  )
  console.log(`  mật khẩu chung: ${DEFAULT_PASSWORD}`)
  console.log('  đăng nhập thử: a2@ulis.vnu.edu.vn')
}

main()
  .then(async () => {
    await closePool()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[knit-seed-pg] lỗi:', err)
    await closePool().catch(() => undefined)
    process.exit(1)
  })

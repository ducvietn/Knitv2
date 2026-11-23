/**
 * Logic nạp dữ liệu mẫu — dùng chung giữa script `npm run seed` (SQLite)
 * và `npm run seed:pg` (Postgres, xem `src/db/seed.ts`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql, nowIso } from './lib/db'
import { hashPassword } from './lib/auth'

export const DEFAULT_PASSWORD = 'knit1234'

export interface SeedAuthor {
  id: string
  email: string
  displayName: string
  facultyVi: string
  facultyEn: string
  cohort: string
  role: string
  verified: boolean
  avatarSeed: string
  /** Màu avatar dựng sẵn — xem `AVATAR_TONES` trong `shared/types.ts` */
  avatarTone?: string
}

export interface SeedSource {
  title: string
  url: string
  publisher: string
}

export interface SeedAnswer {
  id: string
  questionId: string
  author: SeedAuthor
  body: string
  bodyEn: string
  createdAt: string
  helpful: number
  accepted: boolean
  variant?: { context: string; contextEn: string; anonymous: boolean }
  referral?: { office: string; officeEn: string; note: string; noteEn: string }
  sources: SeedSource[]
}

export interface SeedQuestion {
  id: string
  title: string
  titleEn: string
  body: string
  bodyEn: string
  topic: string
  author: SeedAuthor
  createdAt: string
  alsoNeed: number
  views: number
  answered: boolean
  answerCount: number
  anonymous: boolean
  followed: boolean
  hasVariants: boolean
  tags: string[]
}

export interface SeedBundle {
  authors: SeedAuthor[]
  questions: SeedQuestion[]
  answers: SeedAnswer[]
  notifications: {
    id: string
    kind: string
    title: string
    titleEn: string
    body: string
    bodyEn: string
    at: string
    read: boolean
    questionId?: string
  }[]
  reports: {
    id: string
    questionId: string
    answerId?: string
    reason: string
    detail: string
    status: string
    createdAt: string
  }[]
}

/**
 * Tìm file dữ liệu mẫu bằng cách dò ngược từ thư mục module.
 *
 * `process.cwd()` không đáng tin: chạy `npm run dev` ở thư mục gốc dự án,
 * nhưng container lại chạy từ `/app`. Dò ngược từ vị trí module để cách
 * chạy được ở mọi nơi.
 */
export function readSeedFile(seedFile = process.env.KNIT_SEED ?? './seed-data.json'): SeedBundle {
  const seedPath = resolve(process.cwd(), seedFile)
  if (existsSync(seedPath)) {
    return JSON.parse(readFileSync(seedPath, 'utf8')) as SeedBundle
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '..', 'seed-data.json'), // server/seed-data.json
    resolve(here, '..', '..', 'server', 'seed-data.json'),
    resolve(process.cwd(), 'server', 'seed-data.json'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, 'utf8')) as SeedBundle
    }
  }
  throw new Error(
    `Không tìm thấy file dữ liệu mẫu tại "${seedPath}". ` +
      `Đã thử: ${candidates.join(', ')}. ` +
      'Đặt KNIT_SEED để chỉ định đường dẫn tuyệt đối.',
  )
}

/** Cơ sở dữ liệu còn trống hay không (chưa có câu hỏi nào). */
export async function isDatabaseEmpty(): Promise<boolean> {
  const row = await sql.prepare('SELECT COUNT(*) AS c FROM questions').get<{ c: number }>()
  return Number(row?.c ?? 0) === 0
}

/**
 * Nạp dữ liệu mẫu vào cơ sở dữ liệu.
 *
 * @param options.replace — xoá sạch dữ liệu cũ trước khi nạp (dùng cho
 *   `npm run seed`). Mặc định là `false` (giữ dữ liệu, chỉ thêm).
 * @returns true nếu đã nạp, false nếu bỏ qua.
 */
export async function seedIfEmpty(
  seed: SeedBundle,
  options: { replace?: boolean } = {},
): Promise<boolean> {
  if (!options.replace && !(await isDatabaseEmpty())) return false

  await sql.transaction(async () => {
    await sql.exec(`
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

    const insertUser = sql.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, avatar_tone, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const a of seed.authors) {
      await insertUser.run(
        a.id,
        a.email,
        hashPassword(DEFAULT_PASSWORD),
        a.displayName,
        a.facultyVi,
        a.facultyEn,
        a.cohort,
        a.role,
        a.verified,
        a.avatarSeed,
        a.avatarTone ?? 'brand',
        nowIso(),
      )
    }

    const insertQuestion = sql.prepare(
      `INSERT INTO questions (id, title, title_en, body, body_en, topic, author_id, created_at, also_need, views, anonymous, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const q of seed.questions) {
      await insertQuestion.run(
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
      )
    }

    const insertAnswer = sql.prepare(
      `INSERT INTO answers (
         id, question_id, author_id, body, body_en, created_at, accepted, helpful_count,
         variant_context, variant_context_en, variant_anonymous,
         referral_office, referral_office_en, referral_note, referral_note_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const insertSource = sql.prepare(
      'INSERT INTO answer_sources (answer_id, title, url, publisher) VALUES (?, ?, ?, ?)',
    )
    for (const a of seed.answers) {
      await insertAnswer.run(
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
      )
      for (const s of a.sources) await insertSource.run(a.id, s.title, s.url, s.publisher)
    }

    const insertNotification = sql.prepare(
      `INSERT INTO notifications (id, user_id, kind, title, title_en, body, body_en, at, read, question_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    // Thông báo có `questionId` thuộc về người hỏi câu đó; thông báo hệ thống
    // thì dành cho tài khoản mẫu chính (a2) để luôn có gì để xem khi demo.
    const questionOwner = new Map<string, string>(
      seed.questions.map((q) => [q.id, q.author.id] as const),
    )
    for (const n of seed.notifications) {
      const owner = n.questionId ? questionOwner.get(n.questionId) : undefined
      await insertNotification.run(
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
      )
    }

    const insertReport = sql.prepare(
      `INSERT INTO reports (id, user_id, question_id, answer_id, reason, detail, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const r of seed.reports) {
      await insertReport.run(
        r.id,
        'a2',
        r.questionId,
        r.answerId ?? null,
        r.reason,
        r.detail,
        r.status,
        r.createdAt,
      )
    }

    // Theo dõi mẫu: một số câu hỏi và chủ đề có người theo dõi để trang
    // cá nhân hiển thị đầy đủ ngay khi mở bản dựng.
    const insertFollow = sql.prepare(
      sql.insertIgnore('INSERT INTO follows (question_id, user_id) VALUES (?, ?)'),
    )
    await insertFollow.run('q1', 'a2')
    await insertFollow.run('q4', 'a2')
    await insertFollow.run('q7', 'a2')

    const insertTopicFollow = sql.prepare(
      sql.insertIgnore('INSERT INTO topic_follows (topic, user_id) VALUES (?, ?)'),
    )
    await insertTopicFollow.run('hoc-tap', 'a2')
    await insertTopicFollow.run('thu-tuc', 'a2')

    const insertAlsoNeed = sql.prepare(
      sql.insertIgnore('INSERT INTO also_need_votes (question_id, user_id) VALUES (?, ?)'),
    )
    await insertAlsoNeed.run('q1', 'a2')
    await insertAlsoNeed.run('q3', 'a2')
  })

  return true
}

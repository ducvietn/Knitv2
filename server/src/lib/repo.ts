import { db, nowIso } from './db'
import { toPublicUser } from './auth'
import type {
  Answer,
  Notification,
  PublicUser,
  Question,
  Report,
  Source,
  Topic,
} from '../../../shared/types'

type Row = Record<string, unknown>

/* ------------------------------------------------------------------ users */

export const getUser = (id: string): PublicUser | undefined => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined
  return row ? toPublicUser(row) : undefined
}

/* -------------------------------------------------------------- questions */

const questionSelect = `
  SELECT q.*, u.id AS a_id, u.display_name AS a_display_name, u.faculty_vi AS a_faculty_vi,
         u.faculty_en AS a_faculty_en, u.cohort AS a_cohort, u.role AS a_role,
         u.verified AS a_verified, u.avatar_seed AS a_avatar_seed,
         u.avatar_url AS a_avatar_url, u.avatar_tone AS a_avatar_tone,
         (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) AS answer_count,
         (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id
            AND a.variant_context IS NOT NULL) AS variant_count
  FROM questions q JOIN users u ON u.id = q.author_id
`

const authorFromRow = (row: Row): PublicUser => ({
  id: String(row.a_id),
  displayName: String(row.a_display_name),
  facultyVi: String(row.a_faculty_vi),
  facultyEn: String(row.a_faculty_en),
  cohort: String(row.a_cohort),
  role: String(row.a_role) as PublicUser['role'],
  verified: Boolean(row.a_verified),
  avatarSeed: String(row.a_avatar_seed),
  avatarUrl: row.a_avatar_url ? String(row.a_avatar_url) : undefined,
  avatarTone: (row.a_avatar_tone ? String(row.a_avatar_tone) : 'brand') as PublicUser['avatarTone'],
})

const toQuestion = (row: Row): Question => ({
  id: String(row.id),
  title: String(row.title),
  titleEn: String(row.title_en),
  body: String(row.body),
  bodyEn: String(row.body_en),
  topic: String(row.topic) as Topic,
  author: authorFromRow(row),
  createdAt: String(row.created_at),
  alsoNeed: Number(row.also_need),
  views: Number(row.views),
  answered: Number(row.answer_count) > 0,
  answerCount: Number(row.answer_count),
  anonymous: Boolean(row.anonymous),
  followed: false,
  hasVariants: Number(row.variant_count) > 0,
  tags: JSON.parse(String(row.tags)) as string[],
})

export const listQuestions = (
  opts: { topic?: Topic; q?: string; limit?: number; offset?: number; userId?: string } = {},
) => {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.topic) {
    where.push('q.topic = ?')
    params.push(opts.topic)
  }
  if (opts.q) {
    where.push('(q.title LIKE ? OR q.body LIKE ? OR q.tags LIKE ?)')
    const like = `%${opts.q}%`
    params.push(like, like, like)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = db
    .prepare(`${questionSelect} ${clause} ORDER BY q.created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, opts.limit ?? 50, opts.offset ?? 0) as Row[]

  return rows.map((row) => {
    const q = toQuestion(row)
    if (opts.userId) {
      const f = db
        .prepare('SELECT 1 FROM follows WHERE user_id = ? AND question_id = ?')
        .get(opts.userId, q.id)
      q.followed = Boolean(f)
    }
    return q
  })
}

export const getQuestion = (id: string, userId?: string): Question | undefined => {
  const row = db.prepare(`${questionSelect} WHERE q.id = ?`).get(id) as Row | undefined
  if (!row) return undefined
  const q = toQuestion(row)
  if (userId) {
    const f = db
      .prepare('SELECT 1 FROM follows WHERE user_id = ? AND question_id = ?')
      .get(userId, q.id)
    q.followed = Boolean(f)
  }
  return q
}

export const incrementViews = (id: string) => {
  db.prepare('UPDATE questions SET views = views + 1 WHERE id = ?').run(id)
}

/* -------------------------------------------------------- trạng thái của tôi */

/** Danh sách câu hỏi mà tôi đã bấm "Mình cũng cần biết". */
export const listMyAlsoNeed = (userId: string) =>
  (
    db.prepare('SELECT question_id FROM also_need_votes WHERE user_id = ?').all(userId) as {
      question_id: string
    }[]
  ).map((r) => r.question_id)

/** Danh sách câu trả lời mà tôi đã bấm "Hữu ích". */
export const listMyHelpful = (userId: string) =>
  (
    db.prepare('SELECT answer_id FROM helpful_votes WHERE user_id = ?').all(userId) as {
      answer_id: string
    }[]
  ).map((r) => r.answer_id)

/** Danh sách câu hỏi mà tôi đang theo dõi. */
export const listMyFollows = (userId: string) =>
  (
    db.prepare('SELECT question_id FROM follows WHERE user_id = ?').all(userId) as {
      question_id: string
    }[]
  ).map((r) => r.question_id)

/** Người dùng nào đang theo dõi chủ đề này — dùng để gửi thông báo. */
export const listTopicFollowers = (topic: string) =>
  (
    db.prepare('SELECT user_id FROM topic_follows WHERE topic = ?').all(topic) as {
      user_id: string
    }[]
  ).map((r) => r.user_id)

/** Câu hỏi mà tôi đã đặt. */
export const listMyQuestions = (userId: string) =>
  (
    db
      .prepare('SELECT id FROM questions WHERE author_id = ? ORDER BY created_at DESC')
      .all(userId) as { id: string }[]
  ).map((r) => r.id)

/* ---------------------------------------------------------------- answers */

const answerSelect = `
  SELECT a.*, u.id AS a_id, u.display_name AS a_display_name, u.faculty_vi AS a_faculty_vi,
         u.faculty_en AS a_faculty_en, u.cohort AS a_cohort, u.role AS a_role,
         u.verified AS a_verified, u.avatar_seed AS a_avatar_seed,
         u.avatar_url AS a_avatar_url, u.avatar_tone AS a_avatar_tone
   FROM answers a JOIN users u ON u.id = a.author_id
`

const toAnswer = (row: Row): Answer => {
  const sources = db
    .prepare('SELECT title, url, publisher FROM answer_sources WHERE answer_id = ? ORDER BY id')
    .all(String(row.id)) as unknown as Source[]

  const answer: Answer = {
    id: String(row.id),
    questionId: String(row.question_id),
    author: authorFromRow(row),
    body: String(row.body),
    bodyEn: String(row.body_en),
    createdAt: String(row.created_at),
    helpful: Number(row.helpful_count),
    accepted: Boolean(row.accepted),
    sources,
  }

  if (row.variant_context) {
    answer.variant = {
      context: String(row.variant_context),
      contextEn: String(row.variant_context_en ?? ''),
      anonymous: Boolean(row.variant_anonymous),
    }
  }
  if (row.referral_office) {
    answer.referral = {
      office: String(row.referral_office),
      officeEn: String(row.referral_office_en ?? ''),
      note: String(row.referral_note ?? ''),
      noteEn: String(row.referral_note_en ?? ''),
    }
  }
  return answer
}

export const listAnswers = (questionId: string): Answer[] => {
  const rows = db
    .prepare(`${answerSelect} WHERE a.question_id = ? ORDER BY a.accepted DESC, a.helpful_count DESC`)
    .all(questionId) as Row[]
  return rows.map(toAnswer)
}

/* ----------------------------------------------------------- notifications */

const toNotification = (row: Row): Notification => ({
  id: String(row.id),
  kind: String(row.kind) as Notification['kind'],
  title: String(row.title),
  titleEn: String(row.title_en),
  body: String(row.body),
  bodyEn: String(row.body_en),
  at: String(row.at),
  read: Boolean(row.read),
  questionId: row.question_id ? String(row.question_id) : undefined,
})

export const listNotifications = (userId: string) =>
  (
    db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY at DESC LIMIT 50')
      .all(userId) as Row[]
  ).map(toNotification)

export const unreadCount = (userId: string) => {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0')
    .get(userId) as { c: number }
  return row.c
}

export const pushNotification = (input: {
  userId: string
  kind: Notification['kind']
  title: string
  titleEn: string
  body: string
  bodyEn: string
  questionId?: string
}) => {
  db.prepare(
    `INSERT INTO notifications (id, user_id, kind, title, title_en, body, body_en, at, read, question_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(
    `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    input.userId,
    input.kind,
    input.title,
    input.titleEn,
    input.body,
    input.bodyEn,
    nowIso(),
    input.questionId ?? null,
  )
}

/* ---------------------------------------------------------------- reports */

const toReport = (row: Row): Report => ({
  id: String(row.id),
  questionId: String(row.question_id),
  answerId: row.answer_id ? String(row.answer_id) : undefined,
  reason: String(row.reason) as Report['reason'],
  detail: String(row.detail),
  status: String(row.status) as Report['status'],
  createdAt: String(row.created_at),
})

export const listReports = (status?: Report['status']) => {
  const rows = status
    ? (db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC').all(status) as Row[])
    : (db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all() as Row[])
  return rows.map(toReport)
}

export const listReportsByUser = (userId: string) =>
  (db.prepare('SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Row[]).map(
    toReport,
  )

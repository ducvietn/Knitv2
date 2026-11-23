import { Router } from 'express'
import { z } from 'zod'
import { db, nowIso } from '../lib/db'
import { requireAuth, isModerator, type AuthedRequest } from '../lib/auth'
import { getQuestion, incrementViews, listAnswers, listQuestions, listTopicFollowers, pushNotification } from '../lib/repo'
import { rankSimilar } from '../lib/similar'
import type { Topic } from '../../../shared/types'

export const questionsRouter = Router()

const TOPICS: Topic[] = ['hoc-tap', 'thu-tuc', 'doi-song', 'clb']

const questionSchema = z.object({
  title: z.string().min(8, 'Tiêu đề quá ngắn').max(180),
  body: z.string().min(10, 'Nội dung quá ngắn').max(8000),
  topic: z.enum(['hoc-tap', 'thu-tuc', 'doi-song', 'clb']),
  anonymous: z.boolean().default(false),
  tags: z.array(z.string().min(1).max(40)).max(8).default([]),
  source: z
    .object({ title: z.string().min(1).max(200), url: z.string().url('Đường dẫn không hợp lệ') })
    .optional(),
})

/** Danh sách câu hỏi, lọc theo chủ đề và từ khoá. */
questionsRouter.get('/', (req: AuthedRequest, res) => {
  const topic = typeof req.query.topic === 'string' ? (req.query.topic as Topic) : undefined
  if (topic && !TOPICS.includes(topic)) {
    res.status(400).json({ error: 'invalid_topic', message: 'Chủ đề không hợp lệ.' })
    return
  }
  const q = typeof req.query.q === 'string' ? req.query.q : undefined
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 100)
  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)
  res.json({ questions: listQuestions({ topic, q, limit, offset, userId: req.user?.id }) })
})

/** Gợi ý câu hỏi tương tự — chạy khi người dùng đang soạn bài. */
questionsRouter.get('/similar', (req, res) => {
  const draft = typeof req.query.draft === 'string' ? req.query.draft : ''
  const exclude = typeof req.query.exclude === 'string' ? req.query.exclude : undefined
  const pool = listQuestions({ limit: 200 }).filter((q) => q.id !== exclude)
  res.json({ similar: rankSimilar(draft, pool) })
})

questionsRouter.get('/:id', (req: AuthedRequest, res) => {
  const question = getQuestion(req.params.id!, req.user?.id)
  if (!question) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu hỏi này.' })
    return
  }
  incrementViews(question.id)
  res.json({ question, answers: listAnswers(question.id) })
})

questionsRouter.post('/', requireAuth, (req: AuthedRequest, res) => {
  const parsed = questionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const input = parsed.data
  const id = `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const createdAt = nowIso()

  db.prepare(
    `INSERT INTO questions (id, title, title_en, body, body_en, topic, author_id, created_at, also_need, views, anonymous, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
  ).run(
    id,
    input.title,
    input.title,
    input.body,
    input.body,
    input.topic,
    req.user!.id,
    createdAt,
    input.anonymous ? 1 : 0,
    JSON.stringify(input.tags),
  )

  // Người đăng tự theo dõi câu hỏi của mình.
  db.prepare('INSERT OR IGNORE INTO follows (user_id, question_id) VALUES (?, ?)').run(req.user!.id, id)
  db.prepare('INSERT OR IGNORE INTO also_need_votes (question_id, user_id) VALUES (?, ?)').run(id, req.user!.id)

  // Nguồn chính thức kèm theo câu hỏi được lưu thành câu trả lời hệ thống.
  if (input.source) {
    const answerId = `ans-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    db.prepare(
      `INSERT INTO answers (id, question_id, author_id, body, body_en, created_at, accepted, helpful_count)
       VALUES (?, ?, ?, '', '', ?, 1, 0)`,
    ).run(answerId, id, req.user!.id, createdAt)
    db.prepare('INSERT INTO answer_sources (answer_id, title, url, publisher) VALUES (?, ?, ?, ?)').run(
      answerId,
      input.source.title,
      input.source.url,
      'Cộng đồng ULIS',
    )
  }

  // Báo cho người đang theo dõi chủ đề này.
  for (const follower of listTopicFollowers(input.topic)) {
    if (follower === req.user!.id) continue
    pushNotification({
      userId: follower,
      kind: 'follow',
      title: 'Có câu hỏi mới trong chủ đề bạn theo dõi',
      titleEn: 'New question in a topic you follow',
      body: `${req.user!.displayName} đã hỏi "${input.title}".`,
      bodyEn: `${req.user!.displayName} asked "${input.title}".`,
      questionId: id,
    })
  }

  res.status(201).json({ question: getQuestion(id, req.user!.id) })
})

/** Sửa câu hỏi của chính mình. */
questionsRouter.patch('/:id', requireAuth, (req: AuthedRequest, res) => {
  const current = getQuestion(req.params.id!)
  if (!current) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu hỏi này.' })
    return
  }
  if (current.author.id !== req.user!.id && !isModerator(req.user)) {
    res.status(403).json({ error: 'forbidden', message: 'Chỉ người hỏi mới sửa được câu hỏi này.' })
    return
  }
  const parsed = questionSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const input = parsed.data
  db.prepare(
    `UPDATE questions SET title = ?, body = ?, topic = ?, anonymous = ?, tags = ? WHERE id = ?`,
  ).run(
    input.title ?? current.title,
    input.body ?? current.body,
    input.topic ?? current.topic,
    (input.anonymous ?? current.anonymous) ? 1 : 0,
    input.tags ? JSON.stringify(input.tags) : JSON.stringify(current.tags),
    req.params.id!,
  )
  res.json({ question: getQuestion(req.params.id!, req.user!.id) })
})

/** Xoá câu hỏi của chính mình (kéo theo câu trả lời và nguồn). */
questionsRouter.delete('/:id', requireAuth, (req: AuthedRequest, res) => {
  const current = getQuestion(req.params.id!)
  if (!current) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu hỏi này.' })
    return
  }
  if (current.author.id !== req.user!.id && !isModerator(req.user)) {
    res.status(403).json({ error: 'forbidden', message: 'Chỉ người hỏi mới xoá được câu hỏi này.' })
    return
  }
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id!)
  res.json({ deleted: true })
})

/** Bấm "Mình cũng cần biết". */
questionsRouter.post('/:id/also-need', requireAuth, (req: AuthedRequest, res) => {
  const question = getQuestion(req.params.id!)
  if (!question) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu hỏi này.' })
    return
  }
  const existing = db
    .prepare('SELECT 1 FROM also_need_votes WHERE question_id = ? AND user_id = ?')
    .get(req.params.id!, req.user!.id)

  if (existing) {
    db.prepare('DELETE FROM also_need_votes WHERE question_id = ? AND user_id = ?').run(
      req.params.id!,
      req.user!.id,
    )
    db.prepare('UPDATE questions SET also_need = MAX(also_need - 1, 0) WHERE id = ?').run(req.params.id!)
  } else {
    db.prepare('INSERT INTO also_need_votes (question_id, user_id) VALUES (?, ?)').run(
      req.params.id!,
      req.user!.id,
    )
    db.prepare('UPDATE questions SET also_need = also_need + 1 WHERE id = ?').run(req.params.id!)
  }
  res.json({ alsoNeed: getQuestion(req.params.id!)?.alsoNeed })
})

/** Theo dõi / bỏ theo dõi câu hỏi. */
questionsRouter.post('/:id/follow', requireAuth, (req: AuthedRequest, res) => {
  const question = getQuestion(req.params.id!)
  if (!question) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu hỏi này.' })
    return
  }
  const existing = db
    .prepare('SELECT 1 FROM follows WHERE user_id = ? AND question_id = ?')
    .get(req.user!.id, req.params.id!)

  if (existing) {
    db.prepare('DELETE FROM follows WHERE user_id = ? AND question_id = ?').run(req.user!.id, req.params.id!)
  } else {
    db.prepare('INSERT INTO follows (user_id, question_id) VALUES (?, ?)').run(req.user!.id, req.params.id!)
    pushNotification({
      userId: req.user!.id,
      kind: 'follow',
      title: 'Đã theo dõi câu hỏi',
      titleEn: 'Question followed',
      body: `Bạn sẽ nhận thông báo khi có người trả lời "${question.title}".`,
      bodyEn: `You will be notified when someone answers "${question.titleEn}".`,
      questionId: question.id,
    })
  }
  res.json({ followed: !existing })
})

/** Theo dõi / bỏ theo dõi chủ đề. */
questionsRouter.post('/topics/:topic/follow', requireAuth, (req: AuthedRequest, res) => {
  const topic = req.params.topic as Topic
  if (!TOPICS.includes(topic)) {
    res.status(400).json({ error: 'invalid_topic', message: 'Chủ đề không hợp lệ.' })
    return
  }
  const existing = db
    .prepare('SELECT 1 FROM topic_follows WHERE user_id = ? AND topic = ?')
    .get(req.user!.id, topic)
  if (existing) {
    db.prepare('DELETE FROM topic_follows WHERE user_id = ? AND topic = ?').run(req.user!.id, topic)
  } else {
    db.prepare('INSERT INTO topic_follows (user_id, topic) VALUES (?, ?)').run(req.user!.id, topic)
  }
  res.json({ following: !existing })
})

import { Router } from 'express'
import { z } from 'zod'
import { sql, nowIso } from '../lib/db'
import { requireAuth, isModerator, type AuthedRequest } from '../lib/auth'
import { getQuestion, listAnswers, listMyAlsoNeed, listMyHelpful, listQuestions, pushNotification } from '../lib/repo'
import type { Topic } from '../../../shared/types'

export const answersRouter = Router()

const sourceSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url('Đường dẫn nguồn không hợp lệ'),
  publisher: z.string().min(1).max(200).optional(),
})

const answerSchema = z.object({
  body: z.string().min(10, 'Câu trả lời quá ngắn').max(8000),
  accepted: z.boolean().default(false),
  variant: z
    .object({
      context: z.string().min(5, 'Bối cảnh quá ngắn').max(500),
      contextEn: z.string().max(500).optional(),
      anonymous: z.boolean().default(true),
    })
    .optional(),
  referral: z
    .object({
      office: z.string().min(2).max(200),
      officeEn: z.string().max(200).optional(),
      note: z.string().max(400).optional(),
      noteEn: z.string().max(400).optional(),
    })
    .optional(),
  sources: z.array(sourceSchema).max(8).default([]),
})

/** Trả lời một câu hỏi. */
answersRouter.post('/questions/:questionId/answers', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = answerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const question = await getQuestion(req.params.questionId!)
  if (!question) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu hỏi này.' })
    return
  }

  const input = parsed.data
  const id = `ans-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  await sql
    .prepare(
      `INSERT INTO answers (
         id, question_id, author_id, body, body_en, created_at, accepted, helpful_count,
         variant_context, variant_context_en, variant_anonymous,
         referral_office, referral_office_en, referral_note, referral_note_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      question.id,
      req.user!.id,
      input.body,
      input.body,
      nowIso(),
      input.accepted,
      input.variant?.context ?? null,
      input.variant?.contextEn ?? null,
      input.variant ? input.variant.anonymous : null,
      input.referral?.office ?? null,
      input.referral?.officeEn ?? null,
      input.referral?.note ?? null,
      input.referral?.noteEn ?? null,
    )

  for (const source of input.sources) {
    await sql
      .prepare('INSERT INTO answer_sources (answer_id, title, url, publisher) VALUES (?, ?, ?, ?)')
      .run(id, source.title, source.url, source.publisher ?? 'Cộng đồng ULIS')
  }

  // Thông báo cho người đặt câu hỏi và cho người theo dõi câu hỏi.
  const recipients = new Set<string>([question.author.id])
  const followers = await sql
    .prepare('SELECT user_id FROM follows WHERE question_id = ?')
    .all<{ user_id: string }>(question.id)
  for (const row of followers) {
    recipients.add(row.user_id)
  }
  for (const userId of recipients) {
    if (userId === req.user!.id) continue
    await pushNotification({
      userId,
      kind: 'answer',
      title: 'Câu hỏi của bạn đã có câu trả lời',
      titleEn: 'Your question has an answer',
      body: `${req.user!.displayName} đã trả lời "${question.title}".`,
      bodyEn: `${req.user!.displayName} answered "${question.titleEn}".`,
      questionId: question.id,
    })
  }

  res.status(201).json({ answers: await listAnswers(question.id) })
})

/** Đánh giá hữu ích — mỗi tài khoản chỉ được bấm một lần cho mỗi câu trả lời. */
answersRouter.post('/answers/:answerId/helpful', requireAuth, async (req: AuthedRequest, res) => {
  const answer = await sql
    .prepare('SELECT * FROM answers WHERE id = ?')
    .get<Record<string, unknown>>(req.params.answerId!)
  if (!answer) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu trả lời này.' })
    return
  }

  const existing = await sql
    .prepare('SELECT 1 FROM helpful_votes WHERE answer_id = ? AND user_id = ?')
    .get(req.params.answerId!, req.user!.id)

  if (existing) {
    await sql
      .prepare('DELETE FROM helpful_votes WHERE answer_id = ? AND user_id = ?')
      .run(req.params.answerId!, req.user!.id)
    await sql
      .prepare('UPDATE answers SET helpful_count = MAX(helpful_count - 1, 0) WHERE id = ?')
      .run(req.params.answerId!)
  } else {
    await sql
      .prepare('INSERT INTO helpful_votes (answer_id, user_id) VALUES (?, ?)')
      .run(req.params.answerId!, req.user!.id)
    await sql
      .prepare('UPDATE answers SET helpful_count = helpful_count + 1 WHERE id = ?')
      .run(req.params.answerId!)
  }

  const row = await sql
    .prepare('SELECT helpful_count FROM answers WHERE id = ?')
    .get<{ helpful_count: number }>(req.params.answerId!)
  res.json({ helpful: Number(row?.helpful_count ?? 0) })
})

/** Người hỏi đánh dấu một câu trả lời đã giải quyết vấn đề. */
answersRouter.post('/answers/:answerId/accept', requireAuth, async (req: AuthedRequest, res) => {
  const answer = await sql
    .prepare('SELECT * FROM answers WHERE id = ?')
    .get<Record<string, unknown>>(req.params.answerId!)
  if (!answer) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu trả lời này.' })
    return
  }
  const question = await getQuestion(String(answer.question_id))
  if (!question) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu hỏi này.' })
    return
  }
  if (question.author.id !== req.user!.id && !isModerator(req.user)) {
    res.status(403).json({ error: 'forbidden', message: 'Chỉ người hỏi mới đánh dấu câu trả lời đã giải quyết.' })
    return
  }

  await sql.prepare('UPDATE answers SET accepted = FALSE WHERE question_id = ?').run(question.id)
  await sql.prepare('UPDATE answers SET accepted = TRUE WHERE id = ?').run(req.params.answerId!)
  res.json({ answers: await listAnswers(question.id) })
})

/** Sửa câu trả lời của chính mình. */
answersRouter.patch('/answers/:answerId', requireAuth, async (req: AuthedRequest, res) => {
  const row = await sql
    .prepare('SELECT * FROM answers WHERE id = ?')
    .get<Record<string, unknown>>(req.params.answerId!)
  if (!row) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu trả lời này.' })
    return
  }
  if (String(row.author_id) !== req.user!.id && !isModerator(req.user)) {
    res.status(403).json({ error: 'forbidden', message: 'Chỉ tác giả mới sửa được câu trả lời này.' })
    return
  }
  const parsed = answerSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const input = parsed.data
  await sql
    .prepare(
      `UPDATE answers SET body = ?, variant_context = ?, variant_context_en = ?, variant_anonymous = ?,
         referral_office = ?, referral_office_en = ?, referral_note = ?, referral_note_en = ?
       WHERE id = ?`,
    )
    .run(
      input.body ?? String(row.body),
      input.variant?.context ?? (row.variant_context as string | null),
      input.variant?.contextEn ?? (row.variant_context_en as string | null),
      input.variant ? input.variant.anonymous : (row.variant_anonymous as boolean | null),
      input.referral?.office ?? (row.referral_office as string | null),
      input.referral?.officeEn ?? (row.referral_office_en as string | null),
      input.referral?.note ?? (row.referral_note as string | null),
      input.referral?.noteEn ?? (row.referral_note_en as string | null),
      req.params.answerId!,
    )

  // Cập nhật danh sách nguồn chính thức nếu người gửi kèm nguồn mới.
  if (input.sources) {
    await sql.prepare('DELETE FROM answer_sources WHERE answer_id = ?').run(req.params.answerId!)
    for (const source of input.sources) {
      await sql
        .prepare('INSERT INTO answer_sources (answer_id, title, url, publisher) VALUES (?, ?, ?, ?)')
        .run(
          req.params.answerId!,
          source.title,
          source.url,
          source.publisher ?? 'Trường Đại học Ngoại ngữ, ĐHQGHN',
        )
    }
  }

  res.json({ answers: await listAnswers(String(row.question_id)) })
})

/** Xoá câu trả lời của chính mình. */
answersRouter.delete('/answers/:answerId', requireAuth, async (req: AuthedRequest, res) => {
  const row = await sql
    .prepare('SELECT * FROM answers WHERE id = ?')
    .get<Record<string, unknown>>(req.params.answerId!)
  if (!row) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy câu trả lời này.' })
    return
  }
  if (String(row.author_id) !== req.user!.id && !isModerator(req.user)) {
    res.status(403).json({ error: 'forbidden', message: 'Chỉ tác giả mới xoá được câu trả lời này.' })
    return
  }
  await sql.prepare('DELETE FROM answers WHERE id = ?').run(req.params.answerId!)
  res.json({ answers: await listAnswers(String(row.question_id)) })
})

/** Hồ sơ người dùng: câu hỏi đã đăng, câu trả lời đã viết, chủ đề đã theo dõi. */
export const meRouter = Router()

meRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.user!.id

  const all = await listQuestions({ limit: 200, userId })
  const myQuestions = all.filter((q) => q.author.id === userId)

  const answersByQuestion = await Promise.all(all.map((q) => listAnswers(q.id)))
  const myAnswers = answersByQuestion
    .flat()
    .filter((a) => a.author.id === userId)

  const followedTopics = (
    await sql
      .prepare('SELECT topic FROM topic_follows WHERE user_id = ?')
      .all<{ topic: Topic }>(userId)
  ).map((r) => r.topic)

  const followedQuestions = all
    .filter((q) => q.followed)
    .map((q) => ({ ...q, followed: true }))

  res.json({
    myQuestions,
    myAnswers,
    followedTopics,
    followedQuestions,
    alsoNeed: await listMyAlsoNeed(userId),
    helpful: await listMyHelpful(userId),
  })
})

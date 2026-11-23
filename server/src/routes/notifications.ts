import { Router } from 'express'
import { z } from 'zod'
import { sql, nowIso } from '../lib/db'
import { requireAuth, requireRole, type AuthedRequest } from '../lib/auth'
import { listNotifications, listReports, listReportsByUser, unreadCount } from '../lib/repo'

export const notificationsRouter = Router()

notificationsRouter.get('/', requireAuth, async (req: AuthedRequest, res) => {
  res.json({
    notifications: await listNotifications(req.user!.id),
    unread: await unreadCount(req.user!.id),
  })
})

notificationsRouter.post('/read-all', requireAuth, async (req: AuthedRequest, res) => {
  await sql.prepare('UPDATE notifications SET read = TRUE WHERE user_id = ?').run(req.user!.id)
  res.json({ unread: 0 })
})

notificationsRouter.post('/:id/read', requireAuth, async (req: AuthedRequest, res) => {
  await sql
    .prepare('UPDATE notifications SET read = TRUE WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id)
  res.json({ unread: await unreadCount(req.user!.id) })
})

export const reportsRouter = Router()

const reportSchema = z.object({
  questionId: z.string().min(1),
  answerId: z.string().optional(),
  reason: z.enum(['outdated', 'inaccurate', 'insensitive', 'other']),
  detail: z.string().min(5, 'Vui lòng mô tả cụ thể vấn đề').max(2000),
})

/** Báo cáo nội dung lỗi thời hoặc không chính xác. */
reportsRouter.post('/', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const input = parsed.data
  const id = `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  await sql
    .prepare(
      `INSERT INTO reports (id, user_id, question_id, answer_id, reason, detail, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .run(
      id,
      req.user!.id,
      input.questionId,
      input.answerId ?? null,
      input.reason,
      input.detail,
      nowIso(),
    )
  res.status(201).json({ id })
})

/** Người dùng xem các báo cáo mình đã gửi. */
reportsRouter.get('/mine', requireAuth, async (req: AuthedRequest, res) => {
  res.json({ reports: await listReportsByUser(req.user!.id) })
})

/** Quản trị viên xem và xử lý báo cáo. */
reportsRouter.get('/', requireAuth, requireRole('admin', 'staff'), async (req, res) => {
  const status = typeof req.query.status === 'string' ? (req.query.status as never) : undefined
  res.json({ reports: await listReports(status) })
})

reportsRouter.patch('/:id/status', requireAuth, requireRole('admin', 'staff'), async (req, res) => {
  const parsed = z.object({ status: z.enum(['open', 'reviewing', 'resolved']) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', message: 'Trạng thái không hợp lệ.' })
    return
  }
  await sql
    .prepare('UPDATE reports SET status = ? WHERE id = ?')
    .run(parsed.data.status, req.params.id)
  res.json({ id: req.params.id, status: parsed.data.status })
})

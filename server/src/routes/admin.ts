import { Router } from 'express'
import { z } from 'zod'
import { db } from '../lib/db'
import { requireAuth, requireRole, toPublicUser, type AuthedRequest } from '../lib/auth'

export const adminRouter = Router()

adminRouter.use(requireAuth)

// Danh sách tài khoản — cán bộ cũng được xem.
adminRouter.get('/users', requireRole('admin', 'staff'), (_req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Record<
    string,
    unknown
  >[]
  res.json({ users: rows.map(toPublicUser) })
})

/**
 * Đổi vai trò tài khoản (người hỏi / cộng tác viên / cán bộ / quản trị viên)
 * và bật-tắt tick xanh cho tài khoản đại diện. Chỉ quản trị viên được phép.
 */
adminRouter.patch('/users/:id', requireRole('admin'), (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      role: z.enum(['student', 'contributor', 'staff', 'admin']).optional(),
      verified: z.boolean().optional(),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!current) {
    res.status(404).json({ error: 'not_found', message: 'Không tìm thấy tài khoản này.' })
    return
  }
  db.prepare('UPDATE users SET role = ?, verified = ? WHERE id = ?').run(
    parsed.data.role ?? String(current.role),
    (parsed.data.verified ?? Boolean(current.verified)) ? 1 : 0,
    req.params.id,
  )
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ user: toPublicUser(row) })
})

/** Thống kê sơ bộ cho trang quản trị. */
adminRouter.get('/stats', requireRole('admin', 'staff'), (_req, res) => {
  const one = (sql: string) => (db.prepare(sql).get() as { c: number }).c
  res.json({
    users: one('SELECT COUNT(*) AS c FROM users'),
    questions: one('SELECT COUNT(*) AS c FROM questions'),
    answers: one('SELECT COUNT(*) AS c FROM answers'),
    answeredQuestions: one(
      'SELECT COUNT(DISTINCT question_id) AS c FROM answers',
    ),
    openReports: one("SELECT COUNT(*) AS c FROM reports WHERE status != 'resolved'"),
    variants: one('SELECT COUNT(*) AS c FROM answers WHERE variant_context IS NOT NULL'),
  })
})

import { Router } from 'express'
import { z } from 'zod'
import { sql, nowIso } from '../lib/db'
import {
  findUserByEmail,
  findUserById,
  hashPassword,
  issueToken,
  requireAuth,
  toPublicUser,
  verifyPassword,
  type AuthedRequest,
} from '../lib/auth'

export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  displayName: z.string().min(2, 'Tên hiển thị quá ngắn').max(60),
  facultyVi: z.string().min(2).max(120),
  facultyEn: z.string().min(2).max(120),
  cohort: z.string().min(2).max(20),
})

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const input = parsed.data
  if (await findUserByEmail(input.email)) {
    res.status(409).json({ error: 'email_taken', message: 'Email này đã được dùng để đăng ký.' })
    return
  }
  const id = `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  await sql
    .prepare(
      `INSERT INTO users (id, email, password_hash, display_name, faculty_vi, faculty_en, cohort, role, verified, avatar_seed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'student', FALSE, ?, ?)`,
    )
    .run(
      id,
      input.email.toLowerCase(),
      hashPassword(input.password),
      input.displayName,
      input.facultyVi,
      input.facultyEn,
      input.cohort,
      input.displayName.slice(0, 2).toUpperCase(),
      nowIso(),
    )
  const user = toPublicUser((await findUserById(id))!)
  res.status(201).json({ token: issueToken(id), user })
})

authRouter.post('/login', async (req, res) => {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', message: 'Email hoặc mật khẩu không hợp lệ.' })
    return
  }
  const row = await findUserByEmail(parsed.data.email)
  if (!row || !verifyPassword(parsed.data.password, String(row.password_hash))) {
    res.status(401).json({ error: 'bad_credentials', message: 'Email hoặc mật khẩu không đúng.' })
    return
  }
  res.json({ token: issueToken(String(row.id)), user: toPublicUser(row) })
})

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user })
})

/** Đổi mật khẩu. */
authRouter.post('/password', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      currentPassword: z.string().min(1, 'Cần nhập mật khẩu hiện tại'),
      newPassword: z.string().min(8, 'Mật khẩu mới tối thiểu 8 ký tự'),
    })
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const current = (await findUserById(req.user!.id))!
  if (!verifyPassword(parsed.data.currentPassword, String(current.password_hash))) {
    res.status(401).json({ error: 'bad_credentials', message: 'Mật khẩu hiện tại không đúng.' })
    return
  }
  await sql
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(hashPassword(parsed.data.newPassword), req.user!.id)
  res.json({ ok: true })
})

/** Cập nhật hồ sơ hiển thị. Không cho tự ý đổi vai trò hay tick xanh. */
const profileSchema = z.object({
  displayName: z.string().min(2).max(60).optional(),
  facultyVi: z.string().min(2).max(120).optional(),
  facultyEn: z.string().min(2).max(120).optional(),
  cohort: z.string().min(2).max(20).optional(),
})

authRouter.patch('/me', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }
  const current = (await findUserById(req.user!.id))!
  const next = { ...parsed.data }
  await sql
    .prepare(
      `UPDATE users SET display_name = ?, faculty_vi = ?, faculty_en = ?, cohort = ? WHERE id = ?`,
    )
    .run(
      next.displayName ?? String(current.display_name),
      next.facultyVi ?? String(current.faculty_vi),
      next.facultyEn ?? String(current.faculty_en),
      next.cohort ?? String(current.cohort),
      req.user!.id,
    )
  res.json({ user: toPublicUser((await findUserById(req.user!.id))!) })
})

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { db } from './db'
import type { AvatarTone, PublicUser, Role } from '../../../shared/types'

/**
 * Bí mật ký JWT.
 *
 * Ở production, thiếu `KNIT_SECRET` là lỗi nghiêm trọng — dừng server ngay
 * thay vì rơi về giá trị mặc định ai cũng biết (ai đó cũng ký được token).
 * Ở development thì dùng secret mặc định để chạy tiện, kèm cảnh báo.
 */
const DEV_SECRET = 'knit-dev-secret-change-me'
const isProduction = process.env.NODE_ENV === 'production'
const JWT_SECRET = process.env.KNIT_SECRET ?? (isProduction ? '' : DEV_SECRET)

if (!JWT_SECRET) {
  throw new Error(
    'Thiếu biến môi trường KNIT_SECRET. Hãy đặt một chuỗi bí mật ngẫu nhiên trước khi chạy production.',
  )
}

if (JWT_SECRET === DEV_SECRET) {
  console.warn('[knit-api] CẢNH BÁO: đang dùng KNIT_SECRET mặc định cho môi trường phát triển.')
}

const TOKEN_TTL = '7d'

export interface AuthedRequest extends Request {
  user?: PublicUser
}

export const hashPassword = (plain: string) => bcrypt.hashSync(plain, 10)
export const verifyPassword = (plain: string, hash: string) => bcrypt.compareSync(plain, hash)

export const issueToken = (userId: string) => jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL })

export const verifyToken = (token: string): string | null => {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string }
    return payload.sub ?? null
  } catch {
    return null
  }
}

export const toPublicUser = (row: Record<string, unknown>): PublicUser => ({
  id: String(row.id),
  displayName: String(row.display_name),
  facultyVi: String(row.faculty_vi),
  facultyEn: String(row.faculty_en),
  cohort: String(row.cohort),
  role: String(row.role) as Role,
  verified: Boolean(row.verified),
  avatarSeed: String(row.avatar_seed),
  avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
  avatarTone: (row.avatar_tone ? String(row.avatar_tone) : 'brand') as AvatarTone,
})

export const findUserById = (id: string) =>
  db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined

export const findUserByEmail = (email: string) =>
  db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as
    | Record<string, unknown>
    | undefined

/** Đọc Bearer token và gắn user vào request. Không chặn nếu thiếu token. */
export function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const userId = verifyToken(header.slice(7))
    if (userId) {
      const row = findUserById(userId)
      if (row) req.user = toPublicUser(row)
    }
  }
  next()
}

/** Chặn request không có token hợp lệ. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized', message: 'Cần đăng nhập để thực hiện thao tác này.' })
    return
  }
  next()
}

/**
 * Cán bộ và quản trị viên có quyền kiểm duyệt nội dung: sửa, xoá,
 * đánh dấu đã giải quyết và xử lý báo cáo.
 */
export function isModerator(user?: PublicUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'staff'
}

/** Chặn theo vai trò. `admin` có quyền của mọi vai trò khác. */
export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: 'Cần đăng nhập để thực hiện thao tác này.' })
      return
    }
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      res.status(403).json({ error: 'forbidden', message: 'Tài khoản của bạn không có quyền này.' })
      return
    }
    next()
  }
}

import { Router } from 'express'
import { z } from 'zod'
import { sql } from '../lib/db'
import { findUserById, requireAuth, toPublicUser, type AuthedRequest } from '../lib/auth'
import { deleteAvatar, isSupportedImageType, MAX_AVATAR_BYTES, saveAvatar } from '../lib/avatar'
import { AVATAR_TONES } from '../../../shared/types'

export const avatarRouter = Router()

avatarRouter.use(requireAuth)

/**
 * Chọn màu cho avatar dựng sẵn (chữ cái đại diện).
 *
 * Dùng khi người dùng không muốn đăng ảnh thật — hoặc muốn bỏ ảnh đã
 * tải lên và quay lại dùng chữ cái.
 */
avatarRouter.patch('/tone', async (req: AuthedRequest, res) => {
  const parsed = z.object({ tone: z.enum(AVATAR_TONES) }).safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', message: 'Màu avatar không hợp lệ.' })
    return
  }
  const current = (await findUserById(req.user!.id))!
  await deleteAvatar(current.avatar_url ? String(current.avatar_url) : undefined)
  await sql
    .prepare('UPDATE users SET avatar_tone = ?, avatar_url = NULL WHERE id = ?')
    .run(parsed.data.tone, req.user!.id)
  res.json({ user: toPublicUser((await findUserById(req.user!.id))!) })
})

/**
 * Tải ảnh avatar lên.
 *
 * Nhận JSON `{ dataUrl }` — ảnh được mã hoá base64 kèm MIME type. Cách này
 * giữ server không cần thêm dependency xử lý multipart (và giữ ảnh Docker
 * gọn), với dung lượng nhỏ như avatar thì hoàn toàn đủ.
 */
avatarRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ dataUrl: z.string().min(1) })
    .safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', message: 'Chưa có ảnh nào được chọn.' })
    return
  }

  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    parsed.data.dataUrl,
  )
  if (!match) {
    res.status(400).json({ error: 'invalid_input', message: 'Ảnh không đúng định dạng.' })
    return
  }

  const mime = match[1]!.toLowerCase()
  if (!isSupportedImageType(mime)) {
    res.status(415).json({
      error: 'unsupported_type',
      message: 'Chỉ nhận ảnh PNG, JPEG, WEBP hoặc GIF.',
    })
    return
  }

  const buffer = Buffer.from(match[2]!, 'base64')
  if (buffer.length === 0) {
    res.status(400).json({ error: 'invalid_input', message: 'Ảnh không đúng định dạng.' })
    return
  }
  if (buffer.length > MAX_AVATAR_BYTES) {
    res.status(413).json({
      error: 'too_large',
      message: 'Ảnh vượt quá 2 MB. Hãy chọn ảnh nhỏ hơn.',
    })
    return
  }

  const current = (await findUserById(req.user!.id))!
  const url = await saveAvatar(buffer, mime, req.user!.id)
  await sql
    .prepare('UPDATE users SET avatar_url = ?, avatar_tone = ? WHERE id = ?')
    .run(url, String(current.avatar_tone ?? 'brand'), req.user!.id)
  await deleteAvatar(current.avatar_url ? String(current.avatar_url) : undefined)
  res.json({ user: toPublicUser((await findUserById(req.user!.id))!) })
})

/** Xoá ảnh đã tải, quay lại dùng chữ cái đại diện. */
avatarRouter.delete('/', async (req: AuthedRequest, res) => {
  const current = (await findUserById(req.user!.id))!
  await deleteAvatar(current.avatar_url ? String(current.avatar_url) : undefined)
  await sql.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.user!.id)
  res.json({ user: toPublicUser((await findUserById(req.user!.id))!) })
})

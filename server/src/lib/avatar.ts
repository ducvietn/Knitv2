import { randomUUID } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const AVATAR_DIR = resolve(process.env.KNIT_AVATAR_DIR ?? './data/avatars')

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024

mkdirSync(AVATAR_DIR, { recursive: true })

export const avatarDir = AVATAR_DIR

export function isSupportedImageType(mime: string): boolean {
  return mime in EXTENSIONS
}

export function saveAvatar(buffer: Buffer, mime: string, userId: string): string {
  const ext = EXTENSIONS[mime]
  if (!ext) throw new Error('Định dạng ảnh không được hỗ trợ.')
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '')
  const fileName = `${safeId}-${randomUUID().slice(0, 8)}.${ext}`
  writeFileSync(resolve(AVATAR_DIR, fileName), buffer)
  return `/avatars/${fileName}`
}

export function deleteAvatar(url?: string): void {
  if (!url || !url.startsWith('/avatars/')) return
  const fileName = url.slice('/avatars/'.length)
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) return
  try {
    unlinkSync(resolve(AVATAR_DIR, fileName))
  } catch {
    // Ảnh đã bị xoá rồi — không sao.
  }
}

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

/**
 * Bucket Supabase Storage dùng cho avatar.
 *
 * Khi `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` được đặt, ảnh lưu trên
 * Storage thay vì filesystem — nhờ đó container không cần volume (Northflank
 * không hỗ trợ persistent volume cho combined service) và ảnh không mất
 * khi restart.
 */
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'avatars'

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '')
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY

export const avatarStorageEnabled = Boolean(supabaseUrl && supabaseKey)

export function isSupportedImageType(mime: string): boolean {
  return mime in EXTENSIONS
}

function extensionFor(mime: string): string {
  const ext = EXTENSIONS[mime]
  if (!ext) throw new Error('Định dạng ảnh không được hỗ trợ.')
  return ext
}

/**
 * Tải ảnh lên Supabase Storage.
 *
 * Dùng REST API trực tiếp (không thêm dependency `@supabase/supabase-js`)
 * để giữ image Docker nhỏ và tránh thêm bước build native.
 */
async function uploadToStorage(
  buffer: Buffer,
  mime: string,
  fileName: string,
): Promise<void> {
  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}/${encodeURIComponent(fileName)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: supabaseKey!,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body: new Uint8Array(buffer),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Supabase Storage upload failed (${response.status}): ${detail}`)
  }
}

export async function saveAvatar(
  buffer: Buffer,
  mime: string,
  userId: string,
): Promise<string> {
  const ext = extensionFor(mime)
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '')
  const fileName = `${safeId}-${randomUUID().slice(0, 8)}.${ext}`

  if (avatarStorageEnabled) {
    await uploadToStorage(buffer, mime, fileName)
    return `/avatars/${fileName}`
  }

  writeFileSync(resolve(AVATAR_DIR, fileName), buffer)
  return `/avatars/${fileName}`
}

/** Đọc ảnh từ Supabase Storage — trả `null` nếu không có. */
export async function readAvatarFromStorage(fileName: string): Promise<Buffer | null> {
  if (!avatarStorageEnabled) return null
  const url = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}/${encodeURIComponent(fileName)}`
  const response = await fetch(url, {
    headers: {
      apikey: supabaseKey!,
      Authorization: `Bearer ${supabaseKey}`,
    },
  })
  if (!response.ok) return null
  return Buffer.from(await response.arrayBuffer())
}

export async function deleteAvatar(url?: string): Promise<void> {
  if (!url || !url.startsWith('/avatars/')) return
  const fileName = url.slice('/avatars/'.length)
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) return

  if (avatarStorageEnabled) {
    try {
      await fetch(
        `${supabaseUrl}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}/${encodeURIComponent(fileName)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: supabaseKey!,
            Authorization: `Bearer ${supabaseKey}`,
          },
        },
      )
    } catch {
      // Ảnh đã bị xoá rồi — không sao.
    }
    return
  }

  try {
    unlinkSync(resolve(AVATAR_DIR, fileName))
  } catch {
    // Ảnh đã bị xoá rồi — không sao.
  }
}

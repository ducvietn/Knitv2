import { useRef, useState } from 'react'
import { AVATAR_TONES, type AvatarTone, type Author } from '../data/types'
import { useI18n } from '../lib/i18n'
import { toneClass } from './Avatar'
import { uploadAvatar, updateAvatarTone, removeAvatar } from '../store/knit'

const TONE_SWATCH: Record<AvatarTone, { bg: string; text: string }> = {
  brand: { bg: 'bg-brand-100', text: 'text-brand-700' },
  clay: { bg: 'bg-clay-100', text: 'text-clay-700' },
  verify: { bg: 'bg-verify-100', text: 'text-verify-700' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-800' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-700' },
}
const MAX_BYTES = 2 * 1024 * 1024

/**
 * Bảng chọn avatar.
 *
 * Hai lựa chọn: tải ảnh thật lên, hoặc chọn màu cho chữ cái đại diện —
 * không muốn đăng ảnh thì dùng chữ cái vẫn có avatar riêng.
 */
export function AvatarPicker({
  user,
  onClose,
}: {
  user: Author
  onClose: () => void
}) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [tone, setTone] = useState<AvatarTone>(user.avatarTone ?? 'brand')
  const [preview, setPreview] = useState<string | null>(user.avatarUrl ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickFile = async (file: File) => {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError(t('Chỉ nhận tệp ảnh.', 'Only image files are accepted.'))
      return
    }
    if (file.size > MAX_BYTES) {
      setError(t('Ảnh vượt quá 2 MB.', 'Image exceeds 2 MB.'))
      return
    }
    setBusy(true)
    try {
      const dataUrl = await readAsDataUrl(file)
      const next = await uploadAvatar(dataUrl)
      setPreview(next.avatarUrl ?? null)
      setTone(next.avatarTone ?? tone)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không tải được ảnh.', 'Could not upload.'))
    } finally {
      setBusy(false)
    }
  }

  const chooseTone = async (next: AvatarTone) => {
    setError(null)
    setBusy(true)
    try {
      const updated = await updateAvatarTone(next)
      setTone(updated.avatarTone ?? next)
      setPreview(updated.avatarUrl ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không lưu được.', 'Could not save.'))
    } finally {
      setBusy(false)
    }
  }

  const dropPhoto = async () => {
    setError(null)
    setBusy(true)
    try {
      const updated = await removeAvatar()
      setPreview(updated.avatarUrl ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không xoá được.', 'Could not remove.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Xem trước */}
      <div className="flex items-center gap-4">
        <span
          className={`inline-flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-2xl font-bold ring-1 ring-black/5 ${preview ? 'bg-paper-200' : toneClass(tone)}`}
        >
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            user.avatarSeed
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-muted">
            {t(
              'Ảnh hiển thị cạnh tên của bạn trong câu hỏi, câu trả lời và thông báo.',
              'Your photo appears next to your name on questions, answers and notifications.',
            )}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void pickFile(file)
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              {preview
                ? t('Đổi ảnh', 'Change photo')
                : t('Tải ảnh lên', 'Upload a photo')}
            </button>
            {preview && (
              <button
                type="button"
                disabled={busy}
                onClick={dropPhoto}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {t('Bỏ ảnh', 'Remove photo')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bảng màu */}
      <div>
        <p className="mb-2 text-2xs font-medium text-ink-muted">
          {t(
            'Hoặc chọn màu cho chữ cái đại diện',
            'Or pick a colour for your initials',
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_TONES.map((option) => {
            const active = option === tone && !preview
            return (
              <button
                key={option}
                type="button"
                disabled={busy}
                onClick={() => void chooseTone(option)}
                aria-pressed={active}
                title={t(`Màu ${option}`, `${option} colour`)}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-xs font-semibold transition ${TONE_SWATCH[option].bg} ${TONE_SWATCH[option].text} ${
                  active
                    ? 'ring-2 ring-brand-700 ring-offset-2'
                    : 'ring-1 ring-black/5 hover:ring-brand-300'
                } disabled:opacity-50`}
              >
                {user.avatarSeed}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-2xs text-ink-faint">
          {preview
            ? t(
                'Đang dùng ảnh bạn tải lên. Chọn một màu sẽ gỡ ảnh đó và dùng chữ cái đại diện.',
                'You are using your uploaded photo. Picking a colour removes it and uses your initials.',
              )
            : t(
                'Đang dùng chữ cái đại diện trên nền màu.',
                'You are using your initials on a coloured background.',
              )}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-2xs text-clay-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t border-paper-200 pt-4">
        <button type="button" onClick={onClose} className="btn-secondary">
          {t('Xong', 'Done')}
        </button>
      </div>
    </div>
  )
}

/** Đọc tệp thành data URL để gửi lên server. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Không đọc được tệp ảnh.'))
    reader.readAsDataURL(file)
  })
}

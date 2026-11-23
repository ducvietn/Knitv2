import type { ReactNode } from 'react'
import type { Author, AvatarTone } from '../data/types'
import { useI18n } from '../lib/i18n'

/**
 * Bảng màu nền cho avatar dựng sẵn.
 *
 * Thứ tự phải khớp với `AVATAR_TONES` trong `shared/types.ts` — server dùng
 * cùng danh sách để lưu `avatar_tone`.
 */
const TONE_CLASS: Record<AvatarTone, string> = {
  brand: 'bg-brand-100 text-brand-700',
  clay: 'bg-clay-100 text-clay-700',
  verify: 'bg-verify-100 text-verify-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-700',
}

/** Lớp màu của một avatar dựng sẵn — dùng chung giữa mọi nơi hiển thị. */
export const toneClass = (tone: AvatarTone) => TONE_CLASS[tone] ?? TONE_CLASS.brand

/** Màu suy ra khi người dùng chưa chọn — ổn định theo id. */
const TONE_FALLBACK: AvatarTone[] = ['brand', 'clay', 'verify', 'emerald', 'amber', 'rose']

/** Hash id thành màu ổn định — cùng người luôn có cùng màu. */
export const toneFromId = (id: string): AvatarTone => {
  const sum = [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return TONE_FALLBACK[sum % TONE_FALLBACK.length]
}

/**
 * Avatar.
 *
 * Mặc định dựng từ chữ cái đại diện trên nền màu — không cần ảnh thật, nên
 * mọi thứ vẫn chạy khi người dùng chưa đăng ảnh. Nếu người dùng đã tải ảnh
 * lên thì hiển thị ảnh đó.
 */
export function Avatar({
  author,
  size = 'md',
  showVerified = false,
  className = '',
}: {
  author: Author
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showVerified?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const dims = {
    xs: 'h-6 w-6 text-2xs',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-lg',
  }[size]

  // Người dùng có thể chọn màu; nếu không thì suy ra từ id để mỗi người
  // luôn có một màu nhất quán.
  const tone: AvatarTone = author.avatarTone ?? toneFromId(author.id)

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span
        aria-hidden
        className={`inline-flex items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-black/5 ${dims} ${
          author.avatarUrl ? 'bg-paper-200' : TONE_CLASS[tone]
        }`}
      >
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          author.avatarSeed
        )}
      </span>
      {showVerified && author.verified && (
        <span
          title={t('Tài khoản xác minh', 'Verified account')}
          className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-verify-600 text-white ring-2 ring-white"
        >
          <svg viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-current">
            <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
          </svg>
        </span>
      )}
      <span className="sr-only">
        {author.displayName}
        {author.verified ? `, ${t('đã xác minh', 'verified')}` : ''}
      </span>
    </span>
  )
}

/** Tên hiển thị kèm dấu tick xanh và vai trò. */
export function AuthorLine({
  author,
  showFaculty = false,
  className = '',
}: {
  author: Author
  showFaculty?: boolean
  className?: string
}) {
  const { t, bi } = useI18n()

  const roleLabel: Record<Author['role'], { vi: string; en: string }> = {
    student: { vi: 'Sinh viên', en: 'Student' },
    contributor: { vi: 'Cộng tác viên', en: 'Contributor' },
    staff: { vi: 'Cán bộ', en: 'Staff' },
    admin: { vi: 'Ban quản trị', en: 'Moderator' },
  }

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`}>
      <span className="truncate font-medium text-ink">{author.displayName}</span>
      {author.verified && (
        <span
          title={t('Đã xác minh', 'Verified')}
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-verify-600 text-white"
        >
          <svg viewBox="0 0 20 20" className="h-2 w-2 fill-current">
            <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
          </svg>
        </span>
      )}
      <span className="text-ink-faint">·</span>
      <span className="text-ink-muted">{bi(author.facultyVi, author.facultyEn)}</span>
      <span className="text-ink-faint">·</span>
      <span className="text-ink-muted">{author.cohort}</span>
      <span className="chip">{roleLabel[author.role].vi} / {roleLabel[author.role].en}</span>
      {showFaculty && null}
    </span>
  )
}

/** Nhãn vai trò gọn, dùng trong danh sách dày. */
export function RoleBadge({ role }: { role: Author['role'] }) {
  const { t } = useI18n()
  const map: Record<Author['role'], { vi: string; en: string; cls: string }> = {
    student: { vi: 'SV', en: 'ST', cls: 'chip' },
    contributor: { vi: 'CTV', en: 'CTB', cls: 'chip chip-brand' },
    staff: { vi: 'Cán bộ', en: 'Staff', cls: 'chip chip-clay' },
    admin: { vi: 'BQT', en: 'MOD', cls: 'chip chip-brand' },
  }
  const m = map[role]
  return (
    <span className={m.cls} title={t(m.vi, m.en)}>
      {t(m.vi, m.en)}
    </span>
  )
}

export function Chip({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode
  tone?: 'default' | 'brand' | 'clay'
  className?: string
}) {
  const cls = tone === 'brand' ? 'chip-brand' : tone === 'clay' ? 'chip-clay' : 'chip'
  return <span className={`${cls} ${className}`}>{children}</span>
}

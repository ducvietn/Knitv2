import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { logout, state, useKnit } from '../store/knit'
import { Avatar } from './Avatar'

/**
 * Menu tài khoản ở góc trên bên phải: hồ sơ, quản trị (nếu có quyền),
 * và đăng xuất.
 */
export function UserMenu() {
  const { t } = useI18n()
  useKnit()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const user = state.currentUser

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => {
          const evt = new CustomEvent('knit:open-auth')
          window.dispatchEvent(evt)
        }}
        className="btn-secondary hidden px-3 py-1.5 text-xs sm:inline-flex"
      >
        {t('Đăng nhập', 'Sign in')}
      </button>
    )
  }

  const isModerator = user.role === 'admin' || user.role === 'staff'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-paper-200"
        aria-label={t('Tài khoản', 'Account')}
      >
        <Avatar author={user} size="xs" showVerified />
        <span className="hidden text-xs font-medium text-ink sm:inline">{user.displayName}</span>
        <svg viewBox="0 0 20 20" className="hidden h-3.5 w-3.5 fill-ink-faint sm:block">
          <path d="M5.5 7.5 10 12l4.5-4.5H5.5Z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 animate-fade-up overflow-hidden rounded-xl border border-paper-300 bg-white shadow-lift"
        >
          <div className="border-b border-paper-200 px-3.5 py-3">
            <p className="text-xs font-semibold text-ink">{user.displayName}</p>
            <p className="mt-0.5 truncate text-2xs text-ink-faint">{user.facultyVi}</p>
          </div>

          <div className="py-1">
            <Link
              to="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-xs text-ink-muted transition hover:bg-paper-50 hover:text-ink"
            >
              {t('Trang cá nhân', 'Profile')}
            </Link>

            {isModerator && (
              <Link
                to="/admin"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block px-3.5 py-2 text-xs text-ink-muted transition hover:bg-paper-50 hover:text-ink"
              >
                {t('Quản trị nội dung', 'Content moderation')}
              </Link>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                logout()
                setOpen(false)
                navigate('/')
              }}
              className="block w-full px-3.5 py-2 text-left text-xs text-ink-muted transition hover:bg-paper-50 hover:text-clay-700"
            >
              {t('Đăng xuất', 'Sign out')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

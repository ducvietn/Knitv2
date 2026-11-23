import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { markNotificationRead, state } from '../store/knit'
import { useI18n, formatDateTime } from '../lib/i18n'

/**
 * Ngăn thông báo trượt từ bên phải. Đóng bằng Escape hoặc bấm ra ngoài.
 */
export function NotificationsPanel({
  open,
  onClose,
  onMarkAllRead,
  unread,
}: {
  open: boolean
  onClose: () => void
  onMarkAllRead: () => void
  unread: number
}) {
  const { t, bi, lang } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const kindIcon: Record<string, string> = {
    answer: 'M17 8.5l4 4 8-8',
    reply: 'M4 5h12v8H8l-4 4V5Z',
    follow: 'M10 14s6-3.5 6-7a6 6 0 10-12 0c0 3.5 6 7 6 7Z',
    report: 'M10 3l7 13H3L10 3Zm0 5v4m0 2v.5',
    system: 'M10 3a7 7 0 100 14 7 7 0 000-14Zm0 4v4m0 2v.5',
  }

  const kindTone: Record<string, string> = {
    answer: 'bg-brand-100 text-brand-700',
    reply: 'bg-clay-100 text-clay-700',
    follow: 'bg-emerald-100 text-emerald-700',
    report: 'bg-rose-100 text-rose-700',
    system: 'bg-paper-200 text-ink-muted',
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 animate-fade-in bg-brand-900/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={t('Thông báo', 'Notifications')}
        className="absolute right-0 top-0 flex h-full w-full max-w-sm animate-slide-in flex-col border-l border-paper-300 bg-paper-50 shadow-lift"
      >
        <header className="flex items-center justify-between gap-3 border-b border-paper-300 px-4 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {t('Thông báo', 'Notifications')}
            </h2>
            {unread > 0 && (
              <p className="mt-0.5 text-2xs text-ink-faint">
                {unread} {t('chưa đọc', 'unread')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="btn-ghost px-2.5 py-1 text-2xs"
              >
                {t('Đọc tất cả', 'Mark all read')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-faint transition hover:bg-paper-200 hover:text-ink"
              aria-label={t('Đóng', 'Close')}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M6.4 5 5 6.4 8.6 10 5 13.6 6.4 15 10 11.4 13.6 15 15 13.6 11.4 10 15 6.4 13.6 5 10 8.6 6.4 5Z" />
              </svg>
            </button>
          </div>
        </header>

        <ul className="flex-1 overflow-y-auto scrollbar-slim">
          {state.notifications.map((n) => (
            <li
              key={n.id}
              className={`border-b border-paper-200 px-4 py-3 transition hover:bg-white ${
                n.read ? '' : 'bg-brand-50/60'
              }`}
            >
              <div className="flex gap-3">
                <span
                  className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    kindTone[n.kind] ?? kindTone.system
                  }`}
                >
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5 fill-none stroke-current stroke-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={kindIcon[n.kind] ?? kindIcon.system} />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-snug text-ink">
                    {bi(n.title, n.titleEn)}
                    {!n.read && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-clay-500 align-middle" />
                    )}
                  </p>
                  <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
                    {bi(n.body, n.bodyEn)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3">
                    {n.questionId && (
                      <Link
                        to={`/question/${n.questionId}`}
                        onClick={() => {
                          if (!n.read) markNotificationRead(n.id)
                          onClose()
                        }}
                        className="text-2xs font-medium text-brand-700 hover:underline"
                      >
                        {t('Xem câu hỏi', 'View question')} →
                      </Link>
                    )}
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id)}
                        className="text-2xs font-medium text-ink-faint transition hover:text-ink"
                      >
                        {t('Đánh dấu đã đọc', 'Mark as read')}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-2xs text-ink-faint">
                    {formatDateTime(n.at, lang)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {state.notifications.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-ink-muted">
            {t('Chưa có thông báo nào.', 'No notifications yet.')}
          </p>
        )}
      </aside>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { TOPICS } from '../data/topics'
import { CAMPUS, SOCIAL_CHANNELS } from '../data/mock'
import {
  markAllNotificationsRead,
  state,
  subscribe,
  unreadNotifications,
} from '../store/knit'
import { useI18n } from '../lib/i18n'
import { NotificationsPanel } from './NotificationsPanel'
import { AuthDialog } from './AuthDialog'
import { UserMenu } from './UserMenu'

export function AppLayout() {
  const { t, lang, setLang } = useI18n()
  const location = useLocation()
  const [notifOpen, setNotifOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [, force] = useState(0)

  useEffect(() => subscribe(() => force((n) => n + 1)), [])
  useEffect(() => {
    setMenuOpen(false)
    setNotifOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  // Nút "Đăng nhập" trong menu tài khoản phát sự kiện để mở hộp thoại.
  useEffect(() => {
    const open = () => setAuthOpen(true)
    window.addEventListener('knit:open-auth', open)
    return () => window.removeEventListener('knit:open-auth', open)
  }, [])

  const unread = unreadNotifications()

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `relative px-3 py-2 text-sm font-medium transition ${
      isActive ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
    }`

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        {t('Bỏ qua tới nội dung', 'Skip to content')}
      </a>

      {/* Thanh trên cùng: thông tin chính thức của Trường */}
      <div className="hidden border-b border-brand-800 bg-brand-900 text-brand-100 md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5 text-2xs">
          <p className="flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current opacity-70">
              <path d="M10 2a6 6 0 0 0-6 6c0 4.2 6 10 6 10s6-5.8 6-10a6 6 0 0 0-6-6Zm0 8.5A2.5 2.5 0 1 1 10 5a2.5 2.5 0 0 1 0 5.5Z" />
            </svg>
            {CAMPUS.addressVi} · {CAMPUS.tel}
          </p>
          <p className="opacity-70">{CAMPUS.nameVi}, {CAMPUS.orgVi}</p>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-paper-300 bg-paper-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 font-display text-sm font-bold text-white shadow-sm">
              K
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper-50 bg-clay-400" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-bold tracking-tight text-brand-900">
                KNIT
              </span>
              <span className="mt-0.5 hidden text-2xs text-ink-faint sm:block">
                {t('Dành cho sinh viên ULIS', 'For ULIS students')}
              </span>
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
            <NavLink to="/" end className={navLink}>
              {t('Câu hỏi', 'Questions')}
            </NavLink>
            {TOPICS.map((topic) => (
              <NavLink
                key={topic.id}
                to={`/?topic=${topic.id}`}
                className={({ isActive }) =>
                  `${navLink({ isActive })} ${
                    isActive && location.search.includes(topic.id)
                      ? 'text-brand-700'
                      : ''
                  }`
                }
              >
                {t(topic.labelVi, topic.labelEn)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link to="/ask" className="btn-primary hidden sm:inline-flex">
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 0 1 0-2h5V4a1 1 0 0 1 1-1Z" />
              </svg>
              {t('Đặt câu hỏi', 'Ask a question')}
            </Link>

            <button
              type="button"
              onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
              className="rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 font-mono text-2xs font-semibold uppercase tracking-wide text-ink-muted transition hover:border-brand-300 hover:text-brand-700"
              aria-label={t('Đổi ngôn ngữ', 'Switch language')}
            >
              {lang === 'vi' ? 'EN' : 'VI'}
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative rounded-lg p-2 text-ink-muted transition hover:bg-paper-200 hover:text-ink"
              aria-label={t('Thông báo', 'Notifications')}
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                <path d="M10 2a5 5 0 0 0-5 5v3.6L3.6 13a.5.5 0 0 0 .5.7h11.8a.5.5 0 0 0 .5-.7L15 10.6V7a5 5 0 0 0-5-5Zm0 16a2.5 2.5 0 0 0 2.4-1.8H7.6A2.5 2.5 0 0 0 10 18Z" />
              </svg>
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay-500 px-1 font-mono text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </button>

            <UserMenu />

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-ink-muted transition hover:bg-paper-200 lg:hidden"
              aria-label={t('Menu', 'Menu')}
              aria-expanded={menuOpen}
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                <path d="M3 5h14v2H3V5Zm0 4h14v2H3V9Zm0 4h14v2H3v-2Z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Menu di động */}
        {menuOpen && (
          <nav className="animate-fade-in border-t border-paper-200 bg-paper-50 px-4 py-3 lg:hidden">
            <div className="grid grid-cols-2 gap-1.5">
              <Link to="/" className="btn-secondary justify-start">
                {t('Tất cả câu hỏi', 'All questions')}
              </Link>
              {TOPICS.map((topic) => (
                <Link
                  key={topic.id}
                  to={`/?topic=${topic.id}`}
                  className="btn-secondary justify-start"
                >
                  {t(topic.labelVi, topic.labelEn)}
                </Link>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <Link to="/ask" className="btn-primary">
                {t('Đặt câu hỏi', 'Ask a question')}
              </Link>
              <Link to="/profile" className="btn-secondary">
                {t('Trang cá nhân', 'Profile')}
              </Link>
            </div>
            {(state.currentUser?.role === 'admin' || state.currentUser?.role === 'staff') && (
              <div className="mt-1.5">
                <Link to="/admin" className="btn-secondary">
                  {t('Quản trị nội dung', 'Content moderation')}
                </Link>
              </div>
            )}
            {!state.currentUser && (
              <button
                type="button"
                onClick={() => {
                  setAuthOpen(true)
                  setMenuOpen(false)
                }}
                className="btn-secondary mt-1.5 w-full"
              >
                {t('Đăng nhập', 'Sign in')}
              </button>
            )}
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-paper-300 bg-paper-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 font-display text-sm font-bold text-white">
                K
              </span>
              <span className="font-display text-base font-bold text-brand-900">KNIT</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              {t(
                'Nền tảng hỏi đáp dành cho sinh viên ULIS — kèm nguồn chính thức.',
                'A Q&A platform for ULIS students — with official sources.',
              )}
            </p>
            <p className="mt-3 font-mono text-2xs text-ink-faint">{CAMPUS.email}</p>
          </div>

          <div>
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Chủ đề', 'Topics')}
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs">
              {TOPICS.map((topic) => (
                <li key={topic.id}>
                  <Link
                    to={`/?topic=${topic.id}`}
                    className="text-ink-muted transition hover:text-brand-700"
                  >
                    {t(topic.labelVi, topic.labelEn)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Cổng chính thức', 'Official portals')}
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs">
              <li>
                <a
                  href="https://ulis.vnu.edu.vn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-muted transition hover:text-brand-700"
                >
                  ulis.vnu.edu.vn
                </a>
              </li>
              <li>
                <a
                  href="https://student.ulis.vnu.edu.vn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-muted transition hover:text-brand-700"
                >
                  {t('Phòng Đào tạo và Người học', 'Academic Affairs & Students')}
                </a>
              </li>
              <li>
                <a
                  href="https://uliser.ulis.vnu.edu.vn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-muted transition hover:text-brand-700"
                >
                  {t('Hành chính một cửa', 'One-stop administration')}
                </a>
              </li>
              <li>
                <a
                  href="https://lib.ulis.vnu.edu.vn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-muted transition hover:text-brand-700"
                >
                  {t('Thư viện điện tử', 'Digital library')}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Kênh chính thức', 'Official channels')}
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs">
              {SOCIAL_CHANNELS.slice(0, 5).map((ch) => (
                <li key={ch.url}>
                  <a
                    href={ch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-muted transition hover:text-brand-700"
                  >
                    {t(ch.vi, ch.en)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-paper-200 px-4 py-4">
          <p className="mx-auto max-w-6xl text-2xs leading-relaxed text-ink-faint">
            {t(
              'KNIT là dự án thử nghiệm của sinh viên ULIS. Nội dung trong bản dựng này là dữ liệu mô phỏng; mọi liên kết nguồn chính thức đã được kiểm tra trực tiếp trên website của Trường và ĐHQGHN.',
              'KNIT is a ULIS student project. Content in this build is simulated; every official link was verified directly on the university and VNU websites.',
            )}
          </p>
        </div>
      </footer>

      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onMarkAllRead={() => markAllNotificationsRead()}
        unread={unread}
      />

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}

export { state }

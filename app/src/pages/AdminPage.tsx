import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useI18n, formatCount, formatDateTime } from '../lib/i18n'
import { state, useKnit } from '../store/knit'
import { Avatar } from '../components/Avatar'
import type { PublicUser, Report } from '../data/types'

interface Stats {
  users: number
  questions: number
  answers: number
  answeredQuestions: number
  openReports: number
  variants: number
}

const REASONS: Record<Report['reason'], { vi: string; en: string }> = {
  outdated: { vi: 'Thông tin lỗi thời', en: 'Outdated information' },
  inaccurate: { vi: 'Thông tin không chính xác', en: 'Inaccurate information' },
  insensitive: { vi: 'Nội dung không phù hợp', en: 'Inappropriate content' },
  other: { vi: 'Lý do khác', en: 'Other reason' },
}

/**
 * Trang quản trị nội dung cho cán bộ và ban quản trị:
 * duyệt báo cáo, cấp tick xanh, đổi vai trò tài khoản.
 */
export function AdminPage() {
  const { t, bi, lang } = useI18n()
  useKnit()

  const [stats, setStats] = useState<Stats | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [users, setUsers] = useState<PublicUser[]>([])
  const [tab, setTab] = useState<'reports' | 'users'>('reports')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isModerator =
    state.currentUser?.role === 'admin' || state.currentUser?.role === 'staff'
  /** Chỉ quản trị viên được đổi vai trò và cấp tick xanh. */
  const canManageUsers = state.currentUser?.role === 'admin'

  useEffect(() => {
    if (!isModerator) return
    load()
  }, [isModerator, statusFilter])

  const load = async () => {
    try {
      const [s, r, u] = await Promise.all([
        api.get<Stats>('/admin/stats'),
        api.get<{ reports: Report[] }>(`/reports${statusFilter ? `?status=${statusFilter}` : ''}`),
        api.get<{ users: PublicUser[] }>('/admin/users'),
      ])
      setStats(s)
      setReports(r.reports)
      setUsers(u.users)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không tải được dữ liệu.', 'Could not load data.'))
    }
  }

  const setReportStatus = async (id: string, status: Report['status']) => {
    try {
      await api.patch(`/reports/${id}/status`, { status })
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
      setNotice(t('Đã cập nhật báo cáo.', 'Report updated.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không cập nhật được.', 'Could not update.'))
    }
  }

  const updateUser = async (id: string, patch: { role?: string; verified?: boolean }) => {
    try {
      await api.patch(`/admin/users/${id}`, patch)
      const u = await api.get<{ users: PublicUser[] }>('/admin/users')
      setUsers(u.users)
      setNotice(t('Đã cập nhật tài khoản.', 'Account updated.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không cập nhật được.', 'Could not update.'))
    }
  }

  if (!isModerator) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-lg font-semibold text-ink">
          {t('Khu vực dành cho cán bộ', 'Staff area')}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {t(
            'Bạn cần tài khoản cán bộ hoặc quản trị viên để vào đây.',
            'You need a staff or admin account to enter here.',
          )}
        </p>
        <Link to="/" className="btn-primary mt-6">
          {t('Về trang câu hỏi', 'Back to questions')}
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-7">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          {t('Quản trị nội dung', 'Content moderation')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          {t(
            'Báo cáo thông tin lỗi thời, cấp tick xanh cho tài khoản đại diện và điều chỉnh vai trò.',
            'Review outdated-information reports, verify staff accounts and adjust roles.',
          )}
        </p>
      </header>

      {stats && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { l: t('Tài khoản', 'Accounts'), v: stats.users },
            { l: t('Câu hỏi', 'Questions'), v: stats.questions },
            { l: t('Câu trả lời', 'Answers'), v: stats.answers },
            { l: t('Câu đã có trả lời', 'Answered'), v: stats.answeredQuestions },
            { l: t('Biến thể', 'Variants'), v: stats.variants },
            { l: t('Báo cáo mở', 'Open reports'), v: stats.openReports },
          ].map((item) => (
            <div key={item.l} className="card px-4 py-3">
              <dt className="text-2xs uppercase tracking-wide text-ink-faint">{item.l}</dt>
              <dd className="mt-1 font-mono text-xl font-bold text-brand-800">
                {formatCount(item.v, lang)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {notice && (
        <p className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-xs text-brand-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg border border-clay-200 bg-clay-50 px-3.5 py-2.5 text-xs text-clay-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-1.5">
        <button
          type="button"
          onClick={() => setTab('reports')}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
            tab === 'reports'
              ? 'border-brand-700 bg-brand-700 text-white'
              : 'border-paper-300 bg-white text-ink-muted hover:border-brand-300'
          }`}
        >
          {t('Báo cáo', 'Reports')}
        </button>
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
            tab === 'users'
              ? 'border-brand-700 bg-brand-700 text-white'
              : 'border-paper-300 bg-white text-ink-muted hover:border-brand-300'
          }`}
        >
          {t('Tài khoản', 'Accounts')}
        </button>
      </div>

      {tab === 'reports' && (
        <section className="card mt-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: '', vi: 'Tất cả', en: 'All' },
              { id: 'open', vi: 'Mới', en: 'Open' },
              { id: 'reviewing', vi: 'Đang xem', en: 'Reviewing' },
              { id: 'resolved', vi: 'Đã xử lý', en: 'Resolved' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`rounded-full border px-3 py-1 text-2xs font-medium transition ${
                  statusFilter === f.id
                    ? 'border-brand-700 bg-brand-50 text-brand-700'
                    : 'border-paper-300 bg-white text-ink-muted hover:border-brand-300'
                }`}
              >
                {t(f.vi, f.en)}
              </button>
            ))}
          </div>

          {reports.length === 0 ? (
            <p className="mt-5 text-xs text-ink-muted">
              {t('Không có báo cáo nào.', 'No reports.')}
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-paper-100">
              {reports.map((r) => (
                <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip">{t(REASONS[r.reason].vi, REASONS[r.reason].en)}</span>
                    <span
                      className={`chip ${
                        r.status === 'resolved'
                          ? 'chip-brand'
                          : r.status === 'reviewing'
                            ? 'chip-clay'
                            : ''
                      }`}
                    >
                      {r.status === 'open'
                        ? t('Mới', 'Open')
                        : r.status === 'reviewing'
                          ? t('Đang xem', 'Reviewing')
                          : t('Đã xử lý', 'Resolved')}
                    </span>
                    <span className="font-mono text-2xs text-ink-faint">
                      {formatDateTime(r.createdAt, lang)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink">{r.detail}</p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Link
                      to={`/question/${r.questionId}`}
                      className="text-2xs font-medium text-brand-700 hover:underline"
                    >
                      {t('Mở câu hỏi', 'Open question')} →
                    </Link>
                    {r.status !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => setReportStatus(r.id, 'resolved')}
                        className="btn-secondary px-2.5 py-1 text-2xs"
                      >
                        {t('Đánh dấu đã xử lý', 'Mark resolved')}
                      </button>
                    )}
                    {r.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => setReportStatus(r.id, 'reviewing')}
                        className="btn-secondary px-2.5 py-1 text-2xs"
                      >
                        {t('Đang xem', 'Reviewing')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'users' && (
        <section className="card mt-4 p-5">
          {users.length === 0 ? (
            <p className="text-xs text-ink-muted">{t('Chưa có tài khoản.', 'No accounts yet.')}</p>
          ) : (
            <ul className="divide-y divide-paper-100">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                  <Avatar author={u} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {u.displayName}
                      {u.verified && (
                        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-verify-500 text-white">
                          <svg viewBox="0 0 20 20" className="h-2 w-2 fill-current">
                            <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                          </svg>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-2xs text-ink-faint">
                      {bi(u.facultyVi, u.facultyEn)} · {u.cohort} · {u.id}
                    </p>
                  </div>

                  {canManageUsers ? (
                    <>
                      <select
                        value={u.role}
                        onChange={(e) => updateUser(u.id, { role: e.target.value })}
                        className="field w-auto py-1 text-2xs"
                        aria-label={t('Vai trò', 'Role')}
                      >
                        <option value="student">{t('Sinh viên', 'Student')}</option>
                        <option value="contributor">{t('Cộng tác viên', 'Contributor')}</option>
                        <option value="staff">{t('Cán bộ', 'Staff')}</option>
                        <option value="admin">{t('Quản trị viên', 'Admin')}</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => updateUser(u.id, { verified: !u.verified })}
                        className={`btn px-2.5 py-1 text-2xs ${
                          u.verified
                            ? 'border border-brand-300 bg-brand-50 text-brand-700'
                            : 'btn-secondary'
                        }`}
                      >
                        {u.verified ? t('Đã xác minh', 'Verified') : t('Chưa xác minh', 'Not verified')}
                      </button>
                    </>
                  ) : (
                    <span className="chip">{u.role}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

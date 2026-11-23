import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AUTHORS, CAMPUS, FACULTIES, OFFICES } from '../data/mock'
import { TOPICS } from '../data/topics'
import { changePassword, state, updateProfile, useKnit } from '../store/knit'
import { useI18n, formatCount, formatDate } from '../lib/i18n'
import { Avatar, toneClass } from '../components/Avatar'
import { AvatarPicker } from '../components/AvatarPicker'
import { Modal } from '../components/Modal'

export function ProfilePage() {
  const { t, bi, lang } = useI18n()
  useKnit()
  const me = state.currentUser ?? AUTHORS[0]

  const [editOpen, setEditOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [displayName, setDisplayName] = useState(me.displayName)
  const [facultyVi, setFacultyVi] = useState(me.facultyVi)
  const [cohort, setCohort] = useState(me.cohort)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDisplayName(me.displayName)
    setFacultyVi(me.facultyVi)
    setCohort(me.cohort)
  }, [me.displayName, me.facultyVi, me.cohort])

  const myQuestions = state.questions.filter((q) => q.author.id === me.id)
  const myAnswers = state.answers.filter((a) => a.author.id === me.id)
  const followed = state.questions.filter((q) => state.following.includes(q.id))
  const liked = state.answers.filter((a) => state.helpful.includes(a.id))

  const saveProfile = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const facultyMeta = FACULTIES.find((f) => f.vi === facultyVi)
      await updateProfile({
        displayName: displayName.trim(),
        facultyVi: facultyVi.trim(),
        facultyEn: facultyMeta?.en ?? facultyVi.trim(),
        cohort: cohort.trim(),
      })
      setEditOpen(false)
      setMessage(t('Đã cập nhật hồ sơ.', 'Profile updated.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không lưu được.', 'Could not save.'))
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setMessage(t('Đã đổi mật khẩu.', 'Password changed.'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không đổi được mật khẩu.', 'Could not change password.'))
    } finally {
      setBusy(false)
    }
  }

  const isSignedIn = !!state.currentUser

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Hồ sơ */}
      <section className="card overflow-hidden">
        <div className="relative bg-brand-900 px-5 py-8 sm:px-8 sm:py-10">
          <div className="grain absolute inset-0 opacity-70" aria-hidden />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 85% 20%, rgba(214,174,133,0.45), transparent 45%)',
            }}
            aria-hidden
          />
          <div className="relative flex flex-wrap items-center gap-5">
            <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/15 font-display text-xl font-bold text-white ring-1 ring-white/25 backdrop-blur">
              {me.avatarUrl ? (
                <img src={me.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span
                  className={`inline-flex h-full w-full items-center justify-center ${toneClass(
                    me.avatarTone ?? 'brand',
                  )}`}
                >
                  {me.avatarSeed}
                </span>
              )}
            </span>
            {isSignedIn && (
              <button
                type="button"
                onClick={() => {
                  setAvatarOpen(true)
                  setError(null)
                }}
                className="-ml-9 self-start rounded-full bg-white/90 px-2.5 py-1 text-2xs font-semibold text-brand-800 shadow-sm transition hover:bg-white"
              >
                {t('Đổi ảnh', 'Change photo')}
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 font-display text-xl font-bold text-white">
                {me.displayName}
                {me.verified && (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-verify-500 text-white">
                    <svg viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-current">
                      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                    </svg>
                  </span>
                )}
              </h1>
              <p className="mt-1 text-xs text-brand-100">
                {bi(me.facultyVi, me.facultyEn)} · {me.cohort}
              </p>
              <p className="mt-0.5 text-2xs text-brand-200">
                {me.role === 'admin'
                  ? t('Ban quản trị nội dung', 'Content moderator')
                  : me.role === 'staff'
                    ? t('Cán bộ — tài khoản xác minh', 'Staff — verified account')
                    : me.role === 'contributor'
                      ? t('Cộng tác viên', 'Contributor')
                      : t('Sinh viên', 'Student')}
              </p>
            </div>
            {isSignedIn && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditOpen(true)
                    setError(null)
                  }}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {t('Sửa hồ sơ', 'Edit profile')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordOpen(true)
                    setError(null)
                  }}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {t('Đổi mật khẩu', 'Change password')}
                </button>
              </div>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 divide-paper-200 sm:grid-cols-4 sm:divide-x">
          {[
            { l: t('Câu hỏi đã đặt', 'Questions asked'), v: myQuestions.length },
            { l: t('Câu trả lời', 'Answers'), v: myAnswers.length },
            { l: t('Đang theo dõi', 'Following'), v: followed.length },
            { l: t('Đã thấy hữu ích', 'Marked helpful'), v: liked.length },
          ].map((item) => (
            <div key={item.l} className="px-5 py-4">
              <dt className="text-2xs uppercase tracking-wide text-ink-faint">{item.l}</dt>
              <dd className="mt-1 font-mono text-xl font-bold text-brand-800">
                {formatCount(item.v, lang)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {message && (
        <p className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-xs text-brand-800">
          {message}
        </p>
      )}

      {!isSignedIn && (
        <p className="mt-4 rounded-lg border border-clay-200 bg-clay-50 px-3.5 py-2.5 text-xs text-clay-700">
          {t(
            'Bạn đang xem hồ sơ mẫu. Đăng nhập để theo dõi câu hỏi của riêng mình.',
            'You are viewing a sample profile. Sign in to track your own questions.',
          )}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Câu hỏi của tôi */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">
              {t('Câu hỏi của tôi', 'My questions')}
            </h2>
            {myQuestions.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">
                {t('Bạn chưa đặt câu hỏi nào.', 'You have not asked anything yet.')}{' '}
                <Link to="/ask" className="font-semibold text-brand-700 hover:underline">
                  {t('Đặt câu hỏi đầu tiên', 'Ask your first question')} →
                </Link>
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-paper-100">
                {myQuestions.map((q) => (
                  <li key={q.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      to={`/question/${q.id}`}
                      className="block text-sm font-medium leading-snug text-ink transition hover:text-brand-700"
                    >
                      {bi(q.title, q.titleEn)}
                    </Link>
                    <p className="mt-1 text-2xs text-ink-faint">
                      {formatDate(q.createdAt, lang)} · {q.answerCount}{' '}
                      {t('câu trả lời', 'answers')} · {q.alsoNeed} {t('cần biết', 'need this')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Câu trả lời của tôi */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">
              {t('Câu trả lời của tôi', 'My answers')}
            </h2>
            {myAnswers.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">
                {t('Bạn chưa trả lời câu hỏi nào.', 'You have not answered anything yet.')}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-paper-100">
                {myAnswers.map((a) => {
                  const q = state.questions.find((x) => x.id === a.questionId)
                  return (
                    <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                      {q && (
                        <Link
                          to={`/question/${q.id}`}
                          className="block text-sm font-medium leading-snug text-ink transition hover:text-brand-700"
                        >
                          {bi(q.title, q.titleEn)}
                        </Link>
                      )}
                      <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-ink-muted">
                        {a.body}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-ink-faint">
                        <span className="font-mono">
                          {a.helpful} {t('hữu ích', 'helpful')}
                        </span>
                        {a.accepted && (
                          <span className="chip chip-brand">{t('Đã giải quyết', 'Accepted')}</span>
                        )}
                        {a.variant && (
                          <span className="chip chip-clay">{t('Biến thể', 'Variant')}</span>
                        )}
                        {a.sources.length > 0 && (
                          <span className="chip">
                            {a.sources.length} {t('nguồn', 'sources')}
                          </span>
                        )}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Câu hỏi đang theo dõi */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">
              {t('Câu hỏi đang theo dõi', 'Followed questions')}
            </h2>
            {followed.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">
                {t('Bạn chưa theo dõi câu hỏi nào.', 'You are not following any question yet.')}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-paper-100">
                {followed.map((q) => (
                  <li key={q.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      to={`/question/${q.id}`}
                      className="block text-sm font-medium leading-snug text-ink transition hover:text-brand-700"
                    >
                      {bi(q.title, q.titleEn)}
                    </Link>
                    <p className="mt-1 text-2xs text-ink-faint">
                      {q.answerCount} {t('câu trả lời', 'answers')} · {q.alsoNeed}{' '}
                      {t('cần biết', 'need this')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Chủ đề theo dõi */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-ink">
              {t('Chủ đề đang theo dõi', 'Followed topics')}
            </h2>
            {state.followingTopics.length === 0 ? (
              <p className="mt-3 text-xs text-ink-muted">
                {t('Bạn chưa theo dõi chủ đề nào.', 'You are not following any topic yet.')}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {state.followingTopics.map((tp) => {
                  const meta = TOPICS.find((x) => x.id === tp)!
                  return (
                    <Link
                      key={tp}
                      to={`/?topic=${tp}`}
                      className="chip chip-brand transition hover:bg-brand-100"
                    >
                      {bi(meta.labelVi, meta.labelEn)}
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* Cột phụ */}
        <aside className="space-y-5">
          <section className="card p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Trường của bạn', 'Your school')}
            </h2>
            <p className="mt-2.5 text-xs font-semibold leading-snug text-ink">{CAMPUS.nameVi}</p>
            <p className="text-xs text-ink-muted">{CAMPUS.orgVi}</p>
            <p className="mt-2 font-mono text-2xs leading-relaxed text-ink-faint">
              {CAMPUS.addressVi}
              <br />
              {CAMPUS.tel}
              <br />
              {CAMPUS.email}
            </p>
            <a
              href="https://ulis.vnu.edu.vn/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary mt-3 w-full text-xs"
            >
              {t('Mở website Trường', 'Open university site')}
            </a>
          </section>

          <section className="card p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Các khoa của Trường', 'University faculties')}
            </h2>
            <ul className="mt-3 space-y-1.5">
              {FACULTIES.map((f) => (
                <li key={f.url}>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-2xs text-ink-muted transition hover:text-brand-700"
                  >
                    {bi(f.vi, f.en)}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Đầu mối liên hệ', 'Contact offices')}
            </h2>
            <ul className="mt-3 space-y-2">
              {OFFICES.map((o) => (
                <li key={o.url}>
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block transition hover:text-brand-700"
                  >
                    <span className="block text-xs font-medium leading-snug text-ink">
                      {bi(o.vi, o.en)}
                    </span>
                    <span className="mt-0.5 block font-mono text-2xs text-ink-faint">
                      {o.email}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Người trả lời tích cực', 'Active contributors')}
            </h2>
            <ul className="mt-3 space-y-2.5">
              {AUTHORS.slice(0, 4).map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <Avatar author={a} size="xs" showVerified />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink">{a.displayName}</span>
                    <span className="mt-0.5 block text-2xs leading-snug text-ink-faint">
                      {bi(a.facultyVi, a.facultyEn)} · {a.cohort}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* Đổi avatar */}
      <Modal
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        title={t('Đổi ảnh đại diện', 'Change avatar')}
        description={t(
          'Tải ảnh của bạn lên, hoặc chọn màu cho chữ cái đại diện nếu bạn không muốn đăng ảnh.',
          'Upload a photo, or pick a colour for your initials if you would rather not post a picture.',
        )}
        size="sm"
      >
        <AvatarPicker user={me} onClose={() => setAvatarOpen(false)} />
      </Modal>

      {/* Sửa hồ sơ */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('Sửa hồ sơ', 'Edit profile')}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary">
              {t('Huỷ', 'Cancel')}
            </button>
            <button type="button" onClick={saveProfile} disabled={busy} className="btn-primary">
              {t('Lưu', 'Save')}
            </button>
          </>
        }
      >
        <div className="space-y-3.5">
          <label className="block">
            <span className="mb-1 block text-2xs font-medium text-ink-muted">
              {t('Họ và tên hiển thị', 'Display name')}
            </span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              className="field"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs font-medium text-ink-muted">{t('Khoa', 'Faculty')}</span>
            <select
              value={facultyVi}
              onChange={(e) => setFacultyVi(e.target.value)}
              className="field"
            >
              {FACULTIES.map((f) => (
                <option key={f.url} value={f.vi}>
                  {f.vi}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs font-medium text-ink-muted">{t('Khóa', 'Cohort')}</span>
            <input value={cohort} onChange={(e) => setCohort(e.target.value)} className="field" />
          </label>
          {error && (
            <p className="rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-2xs text-clay-700">
              {error}
            </p>
          )}
        </div>
      </Modal>

      {/* Đổi mật khẩu */}
      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title={t('Đổi mật khẩu', 'Change password')}
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setPasswordOpen(false)} className="btn-secondary">
              {t('Huỷ', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={savePassword}
              disabled={busy || !currentPassword || newPassword.length < 8}
              className="btn-primary disabled:opacity-60"
            >
              {t('Đổi mật khẩu', 'Change password')}
            </button>
          </>
        }
      >
        <div className="space-y-3.5">
          <label className="block">
            <span className="mb-1 block text-2xs font-medium text-ink-muted">
              {t('Mật khẩu hiện tại', 'Current password')}
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="field"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs font-medium text-ink-muted">
              {t('Mật khẩu mới', 'New password')}
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="field"
            />
            <span className="mt-1 block text-2xs text-ink-faint">
              {t('Tối thiểu 8 ký tự.', 'At least 8 characters.')}
            </span>
          </label>
          {error && (
            <p className="rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-2xs text-clay-700">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}

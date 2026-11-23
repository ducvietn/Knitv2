import { useState } from 'react'
import { Modal } from './Modal'
import { useI18n } from '../lib/i18n'
import { login, register } from '../store/knit'
import { FACULTIES } from '../data/mock'

/**
 * Hộp thoại đăng nhập / đăng ký.
 *
 * Tài khoản dùng thử trong bản demo: `a2@ulis.vnu.edu.vn` / `knit1234`.
 */
export function AuthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('a2@ulis.vnu.edu.vn')
  const [password, setPassword] = useState('knit1234')
  const [displayName, setDisplayName] = useState('')
  const [faculty, setFaculty] = useState<string>(FACULTIES[0]?.vi ?? '')
  const [cohort, setCohort] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const facultyMeta = FACULTIES.find((f) => f.vi === faculty)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        await register({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          facultyVi: faculty,
          facultyEn: facultyMeta?.en ?? faculty,
          cohort: cohort.trim() || 'K26',
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thực hiện. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'login' ? t('Đăng nhập', 'Sign in') : t('Đăng ký', 'Create account')}
      description={t(
        'Tài khoản giúp bạn theo dõi câu hỏi của mình và nhận thông báo khi có câu trả lời.',
        'An account lets you follow your questions and get notified when they are answered.',
      )}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && (
          <>
            <label className="block">
              <span className="mb-1 block text-2xs font-medium text-ink-muted">
                {t('Họ và tên hiển thị', 'Display name')}
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                minLength={2}
                className="field"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-2xs font-medium text-ink-muted">
                  {t('Khoa', 'Faculty')}
                </span>
                <select
                  value={faculty}
                  onChange={(e) => setFaculty(e.target.value)}
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
                <span className="mb-1 block text-2xs font-medium text-ink-muted">
                  {t('Khóa', 'Cohort')}
                </span>
                <input
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                  placeholder="K26"
                  className="field"
                />
              </label>
            </div>
          </>
        )}

        <label className="block">
          <span className="mb-1 block text-2xs font-medium text-ink-muted">
            {t('Email', 'Email')}
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="field"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-2xs font-medium text-ink-muted">
            {t('Mật khẩu', 'Password')}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="field"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-2xs text-clay-700">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full disabled:opacity-60">
          {busy
            ? t('Đang xử lý…', 'Working…')
            : mode === 'login'
              ? t('Đăng nhập', 'Sign in')
              : t('Tạo tài khoản', 'Create account')}
        </button>

        <p className="text-center text-2xs text-ink-muted">
          {mode === 'login' ? (
            <>
              {t('Chưa có tài khoản?', 'No account yet?')}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register')
                  setError(null)
                }}
                className="font-semibold text-brand-700 hover:underline"
              >
                {t('Đăng ký', 'Sign up')}
              </button>
            </>
          ) : (
            <>
              {t('Đã có tài khoản?', 'Already registered?')}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError(null)
                }}
                className="font-semibold text-brand-700 hover:underline"
              >
                {t('Đăng nhập', 'Sign in')}
              </button>
            </>
          )}
        </p>
      </form>
    </Modal>
  )
}

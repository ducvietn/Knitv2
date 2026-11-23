import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="font-mono text-6xl font-bold text-paper-300">404</p>
      <h1 className="mt-4 font-display text-xl font-semibold text-ink">
        {t('Không tìm thấy trang', 'Page not found')}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {t(
          'Đường dẫn có thể đã đổi, hoặc trang không tồn tại.',
          'The link may have changed, or the page does not exist.',
        )}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Link to="/" className="btn-primary">
          {t('Về trang chủ', 'Go home')}
        </Link>
        <Link to="/ask" className="btn-secondary">
          {t('Đặt câu hỏi', 'Ask a question')}
        </Link>
      </div>
    </div>
  )
}
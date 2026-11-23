import { OFFICIAL_PORTALS } from '../data/mock'
import { useI18n } from '../lib/i18n'

/**
 * Danh sách cổng chính thức của ULIS. Đây là "bản đồ" để sinh viên biết
 * phải tới đâu khi KNIT chưa có câu trả lời — và mọi đường dẫn ở đây đều
 * được kiểm tra tồn tại trực tiếp trên website của Trường.
 */
export function OfficialPortals() {
  const { t } = useI18n()

  return (
    <section className="card overflow-hidden">
      <header className="border-b border-paper-200 bg-brand-50 px-4 py-3">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-brand-800">
          {t('Cổng chính thức của Trường', 'Official university portals')}
        </h2>
        <p className="mt-1 text-2xs leading-relaxed text-brand-700/80">
          {t(
            'Khi KNIT chưa có câu trả lời, hãy tới đúng chỗ này.',
            'When KNIT has no answer yet, go to the right desk.',
          )}
        </p>
      </header>
      <ul className="divide-y divide-paper-100">
        {OFFICIAL_PORTALS.map((portal) => (
          <li key={portal.id}>
            <a
              href={portal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/portal flex items-start gap-2.5 px-4 py-2.5 transition hover:bg-paper-50"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-paper-200 font-mono text-2xs font-bold text-ink-muted transition group-hover/portal:bg-brand-100 group-hover/portal:text-brand-700">
                {portal.id.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium leading-snug text-ink group-hover/portal:text-brand-700">
                  {t(portal.labelVi, portal.labelEn)}
                </span>
                <span className="mt-0.5 block text-2xs leading-snug text-ink-faint">
                  {t(portal.noteVi, portal.noteEn)}
                </span>
              </span>
              <svg
                viewBox="0 0 20 20"
                className="mt-1 h-3 w-3 shrink-0 fill-ink-faint transition group-hover/portal:fill-brand-600"
              >
                <path d="M11 3h6v6h-2V6.4l-7.3 7.3-1.4-1.4L13.6 5H11V3ZM5 5h4v2H6v8h8v-3h2v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
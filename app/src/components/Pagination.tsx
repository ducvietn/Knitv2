import { useI18n } from '../lib/i18n'

/**
 * Thanh phân trang cho danh sách câu hỏi.
 *
 * Mỗi trang chỉ hiện khoảng 6 câu — danh sách KNIT đang có hơn 40 câu, hiện
 * tất cả một lượt làm trang nặng nên và khó cuộn trên điện thoại.
 *
 * Trạng thái trang nằm trong URL (`?page=2`) nên người dùng có thể chia sẻ
 * link tới đúng trang, và nút Back của trình duyệt hoạt động đúng.
 */
export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  /** Trang hiện tại (1-based). */
  page: number
  /** Tổng số trang. */
  pageCount: number
  /** Gọi khi người dùng chuyển trang. */
  onChange: (page: number) => void
}) {
  const { t } = useI18n()

  // Ít hơn 2 trang thì không cần thanh phân trang.
  if (pageCount <= 1) return null

  /**
   * Danh sách số trang cần hiện.
   *
   * Luôn giữ trang đầu, trang cuối và các trang lân cận trang hiện tại — các
   * trang xa được gom lại bằng dấu "…" để thanh không bị dài vô hạn.
   */
  const pages: (number | 'gap')[] = []
  const windowSize = 1

  for (let p = 1; p <= pageCount; p++) {
    const isNear = Math.abs(p - page) <= windowSize
    const isEdge = p === 1 || p === pageCount

    if (isNear || isEdge) {
      pages.push(p)
      continue
    }

    // Chỉ thêm dấu "…" một lần, không lặp lại.
    const last = pages[pages.length - 1]
    if (last !== 'gap' && typeof last === 'number' && p - last > 1) pages.push('gap')
  }

  const go = (p: number) => {
    if (p === page || p < 1 || p > pageCount) return
    onChange(p)
  }

  return (
    <nav
      className="mt-6 flex items-center justify-between gap-3 border-t border-paper-200 pt-5"
      aria-label={t('Phân trang', 'Pagination')}
    >
      <p className="text-2xs text-ink-faint">
        {t('Trang', 'Page')} <span className="font-mono font-semibold">{page}</span> /{' '}
        <span className="font-mono font-semibold">{pageCount}</span>
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page === 1}
          className="btn-ghost px-2.5 py-1.5 text-2xs disabled:pointer-events-none disabled:opacity-40"
          aria-label={t('Trang trước', 'Previous page')}
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
            <path d="M12.5 4 7 10l5.5 6 1.2-1.1L9.4 10l4.3-4.9L12.5 4Z" />
          </svg>
        </button>

        {pages.map((p, index) =>
          p === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-2xs text-ink-faint">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => go(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[1.75rem] rounded-lg border px-2 py-1.5 text-2xs font-semibold transition ${
                p === page
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-paper-300 bg-white text-ink-muted hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page === pageCount}
          className="btn-ghost px-2.5 py-1.5 text-2xs disabled:pointer-events-none disabled:opacity-40"
          aria-label={t('Trang sau', 'Next page')}
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
            <path d="M7.5 4 13 10l-5.5 6-1.2-1.1L10.6 10 6.3 5.1 7.5 4Z" />
          </svg>
        </button>
      </div>
    </nav>
  )
}

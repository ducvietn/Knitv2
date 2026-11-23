import type { Source } from '../data/types'
import { useI18n } from '../lib/i18n'

/**
 * Hiển thị nguồn chính thức. Đây là phần cốt lõi của KNIT: mọi thông tin về
 * quy định của Trường phải dẫn được về một đường dẫn thật, không phải trích
 * dẫn miệng. Link luôn mở tab mới vì nhiều cổng của Trường dùng đăng nhập.
 */
export function SourceList({
  sources,
  compact = false,
}: {
  sources: Source[]
  compact?: boolean
}) {
  const { t } = useI18n()

  if (!sources.length) {
    return (
      <p className="text-2xs italic text-ink-faint">
        {t(
          'Câu trả lời này chưa dẫn nguồn chính thức.',
          'This answer has no official source yet.',
        )}
      </p>
    )
  }

  return (
    <ul className={compact ? 'space-y-1' : 'space-y-2'}>
      {sources.map((source) => (
        <li key={source.url}>
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`group/source flex items-start gap-2 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2 transition hover:border-brand-300 hover:bg-brand-50 ${
              compact ? 'text-2xs' : 'text-xs'
            }`}
          >
            <svg
              viewBox="0 0 20 20"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-none stroke-brand-500 stroke-2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.2 1.2" />
              <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.2-1.2" />
            </svg>
            <span className="min-w-0">
              <span className="block font-medium leading-snug text-ink group-hover/source:text-brand-700">
                {source.title}
              </span>
              <span className="mt-0.5 block truncate font-mono text-2xs text-ink-faint">
                {source.publisher}
              </span>
            </span>
            <svg
              viewBox="0 0 20 20"
              className="ml-auto mt-0.5 h-3 w-3 shrink-0 fill-ink-faint transition group-hover/source:fill-brand-600"
            >
              <path d="M11 3h6v6h-2V6.4l-7.3 7.3-1.4-1.4L13.6 5H11V3ZM5 5h4v2H6v8h8v-3h2v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Tiêu đề nhóm nguồn, dùng trong trang chi tiết câu hỏi. */
export function SourceBlock({ sources }: { sources: Source[] }) {
  const { t } = useI18n()
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
        <svg
          viewBox="0 0 20 20"
          className="h-3.5 w-3.5 fill-none stroke-current stroke-2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.2 1.2" />
          <path d="M11.5 8.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.2-1.2" />
        </svg>
        {t('Nguồn chính thức', 'Official sources')}
      </h3>
      <SourceList sources={sources} />
    </section>
  )
}
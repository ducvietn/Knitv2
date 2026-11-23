import { Link } from 'react-router-dom'
import type { Question } from '../data/types'
import { TOPIC_MAP } from '../data/topics'
import { useI18n, formatCount, relativeTime } from '../lib/i18n'
import { Avatar } from './Avatar'

/**
 * Thẻ câu hỏi trong danh sách. Mọi trạng thái quan trọng đều hiện ngay trên
 * mặt thẻ: đã có câu trả lời chưa, bao nhiêu người cũng cần biết, có biến
 * thể "trường hợp của mình khác" hay không.
 */
export function QuestionCard({
  question,
  onToggleAlsoNeed,
  isAlsoNeedMarked,
}: {
  question: Question
  onToggleAlsoNeed?: (id: string) => void
  isAlsoNeedMarked?: boolean
}) {
  const { t, bi, lang } = useI18n()
  const topic = TOPIC_MAP[question.topic]
  const author = question.anonymous ? null : question.author

  return (
    <article className="card card-hover group relative flex gap-3 p-4 sm:gap-4 sm:p-5">
      {/* Chỉ số bên trái — như số thứ tự trong sổ đăng ký */}
      <div className="hidden w-12 shrink-0 flex-col items-center gap-1 pt-0.5 text-center sm:flex">
        <span
          className={`font-mono text-xs font-semibold ${
            question.answered ? 'text-brand-600' : 'text-ink-faint'
          }`}
        >
          {question.answerCount}
        </span>
        <span className="text-2xs uppercase tracking-wide text-ink-faint">
          {t('trả lời', 'answers')}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="chip chip-brand">
            <span className="font-mono font-semibold">{topic.mark}</span>
            {bi(topic.labelVi, topic.labelEn)}
          </span>
          {question.answered && (
            <span className="chip chip-brand">
              <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
              </svg>
              {t('Đã giải quyết', 'Resolved')}
            </span>
          )}
          {question.hasVariants && (
            <span className="chip chip-clay">
              {t('Trường hợp khác', 'Other cases')}
            </span>
          )}
          {question.anonymous && (
            <span className="chip">
              {t('Ẩn danh', 'Anonymous')}
            </span>
          )}
        </div>

        <h3 className="text-[15px] font-semibold leading-snug text-ink sm:text-base">
          <Link
            to={`/question/${question.id}`}
            className="transition after:absolute after:inset-0 group-hover:text-brand-700"
          >
            {bi(question.title, question.titleEn)}
          </Link>
        </h3>

        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-muted">
          {bi(question.body, question.bodyEn)}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-2xs text-ink-faint">
          {author ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar author={author} size="xs" />
              <span className="font-medium text-ink-muted">{author.displayName}</span>
              {author.verified && (
                <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-verify-600 text-white">
                  <svg viewBox="0 0 20 20" className="h-1.5 w-1.5 fill-current">
                    <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                  </svg>
                </span>
              )}
            </span>
          ) : (
            <span className="italic">{t('Ẩn danh', 'Anonymous')}</span>
          )}
          <span aria-hidden>·</span>
          <span>{relativeTime(question.createdAt, lang)}</span>
          <span aria-hidden>·</span>
          <span>
            {formatCount(question.views, lang)} {t('lượt xem', 'views')}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {question.tags.map((tag) => (
            <span key={tag} className="chip">
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Cột số liệu bên phải */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-3">
        {onToggleAlsoNeed && (
          <button
            type="button"
            onClick={() => onToggleAlsoNeed(question.id)}
            aria-pressed={isAlsoNeedMarked}
            className={`group/btn flex w-20 flex-col items-center rounded-lg border px-2 py-2 transition ${
              isAlsoNeedMarked
                ? 'border-clay-300 bg-clay-50 text-clay-700'
                : 'border-paper-300 bg-paper-50 text-ink-muted hover:border-clay-300 hover:bg-clay-50 hover:text-clay-700'
            }`}
            title={t('Mình cũng cần biết', 'I also need to know')}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-none stroke-current stroke-2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="mt-0.5 font-mono text-sm font-semibold leading-none">
              {formatCount(question.alsoNeed, lang)}
            </span>
            <span className="mt-0.5 text-2xs leading-tight">
              {t('cần biết', 'need this')}
            </span>
          </button>
        )}
      </div>
    </article>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TOPIC_MAP } from '../data/topics'
import {
  acceptAnswer,
  answersFor,
  deleteAnswer,
  deleteQuestion,
  findQuestion,
  loadQuestion,
  markAlsoNeed,
  reportContent,
  state,
  toggleFollowQuestion,
  toggleHelpful,
  useKnit,
} from '../store/knit'
import { useI18n, formatCount, relativeTime } from '../lib/i18n'
import { Avatar } from '../components/Avatar'
import { SourceBlock, SourceList } from '../components/SourceList'
import { Modal } from '../components/Modal'
import { OfficialPortals } from '../components/OfficialPortals'
import { AnswerComposer } from '../components/AnswerComposer'
import { EditQuestionDialog } from '../components/EditQuestionDialog'
import { EditAnswerDialog } from '../components/EditAnswerDialog'

export function QuestionPage() {
  const { id = '' } = useParams()
  const { t, bi, lang } = useI18n()
  useKnit()

  const question = findQuestion(id)
  const answers = answersFor(id)

  const [reportOpen, setReportOpen] = useState(false)
  const [editQuestionOpen, setEditQuestionOpen] = useState(false)
  const [editAnswerId, setEditAnswerId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState<'outdated' | 'inaccurate' | 'insensitive' | 'other'>('outdated')
  const [reportDetail, setReportDetail] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Nạp câu hỏi và câu trả lời từ server.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    loadQuestion(id)
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const variants = useMemo(
    () => answers.filter((a) => a.variant),
    [answers],
  )
  const mainAnswers = useMemo(
    () => answers.filter((a) => !a.variant),
    [answers],
  )

  if (loading && !question) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <p className="font-mono text-2xs uppercase tracking-widest text-ink-faint">
          {t('Đang tải…', 'Loading…')}
        </p>
      </div>
    )
  }

  if (notFound && !question) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <p className="font-mono text-5xl font-bold text-paper-300">404</p>
        <h1 className="mt-4 text-lg font-semibold text-ink">
          {t('Không tìm thấy câu hỏi', 'Question not found')}
        </h1>
        <Link to="/" className="btn-primary mt-6">
          {t('Về trang câu hỏi', 'Back to questions')}
        </Link>
      </div>
    )
  }

  if (!question) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <p className="font-mono text-5xl font-bold text-paper-300">404</p>
        <h1 className="mt-4 text-lg font-semibold text-ink">
          {t('Không tìm thấy câu hỏi', 'Question not found')}
        </h1>
        <Link to="/" className="btn-primary mt-6">
          {t('Về trang câu hỏi', 'Back to questions')}
        </Link>
      </div>
    )
  }

  const topic = TOPIC_MAP[question.topic]
  const isAlsoNeed = state.alsoNeed.includes(question.id)
  const isAuthor = state.currentUser?.id === question.author.id
  const isModerator = state.currentUser?.role === 'admin' || state.currentUser?.role === 'staff'
  const editAnswer = answers.find((a) => a.id === editAnswerId)

  const submitReport = async () => {
    await reportContent({
      questionId: question.id,
      reason: reportReason,
      detail: reportDetail.trim(),
    })
    setReportOpen(false)
    setReportDetail('')
  }

  const reasons: { id: typeof reportReason; vi: string; en: string }[] = [
    { id: 'outdated', vi: 'Thông tin lỗi thời', en: 'Outdated information' },
    { id: 'inaccurate', vi: 'Thông tin không chính xác', en: 'Inaccurate information' },
    { id: 'insensitive', vi: 'Nội dung không phù hợp', en: 'Inappropriate content' },
    { id: 'other', vi: 'Lý do khác', en: 'Other reason' },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-5 flex items-center gap-2 text-xs text-ink-faint">
        <Link to="/" className="transition hover:text-brand-700">
          {t('Câu hỏi', 'Questions')}
        </Link>
        <span aria-hidden>/</span>
        <Link
          to={`/?topic=${question.topic}`}
          className="transition hover:text-brand-700"
        >
          {bi(topic.labelVi, topic.labelEn)}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {/* Câu hỏi */}
          <article className="card p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Link
                to={`/?topic=${question.topic}`}
                className="chip chip-brand transition hover:bg-brand-100"
              >
                <span className="font-mono font-semibold">{topic.mark}</span>
                {bi(topic.labelVi, topic.labelEn)}
              </Link>
              {question.answered && (
                <span className="chip chip-brand">
                  <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                    <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                  </svg>
                  {t('Đã giải quyết', 'Resolved')}
                </span>
              )}
              {question.anonymous && <span className="chip">{t('Ẩn danh', 'Anonymous')}</span>}
            </div>

            <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-ink sm:text-2xl">
              {bi(question.title, question.titleEn)}
            </h1>

            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {bi(question.body, question.bodyEn)}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {question.tags.map((tag) => (
                <span key={tag} className="chip">
                  #{tag}
                </span>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-paper-200 pt-4">
              <div className="flex items-center gap-2.5">
                {question.anonymous ? (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-paper-200 font-mono text-2xs font-semibold text-ink-faint">
                    ?
                  </span>
                ) : (
                  <Avatar author={question.author} size="sm" showVerified />
                )}
                <div className="text-2xs leading-tight">
                  {question.anonymous ? (
                    <span className="font-medium text-ink-muted">
                      {t('Người hỏi ẩn danh', 'Asked anonymously')}
                    </span>
                  ) : (
                    <>
                      <p className="font-semibold text-ink">{question.author.displayName}</p>
                      <p className="text-ink-faint">
                        {bi(question.author.facultyVi, question.author.facultyEn)} ·{' '}
                        {question.author.cohort}
                      </p>
                    </>
                  )}
                  <p className="mt-0.5 text-ink-faint">
                    {relativeTime(question.createdAt, lang)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleFollowQuestion(question.id)}
                  className={`btn px-3 py-1.5 text-xs ${
                    question.followed
                      ? 'border border-brand-300 bg-brand-50 text-brand-700'
                      : 'btn-secondary'
                  }`}
                >
                  {question.followed ? t('Đang theo dõi', 'Following') : t('Theo dõi', 'Follow')}
                </button>
                <button
                  type="button"
                  onClick={() => markAlsoNeed(question.id)}
                  aria-pressed={isAlsoNeed}
                  className={`btn px-3 py-1.5 text-xs ${
                    isAlsoNeed
                      ? 'border border-clay-300 bg-clay-50 text-clay-700'
                      : 'btn-secondary'
                  }`}
                >
                  {t('Mình cũng cần biết', 'I also need this')}{' '}
                  <span className="font-mono font-semibold">{question.alsoNeed}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="btn-ghost px-2.5 py-1.5 text-xs"
                  aria-label={t('Báo cáo', 'Report')}
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                    <path d="M10 3 2 18h16L10 3Zm0 5.5v4m0 2v.5" />
                  </svg>
                </button>
                {(isAuthor || isModerator) && (
                  <button
                    type="button"
                    onClick={() => setEditQuestionOpen(true)}
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                    aria-label={t('Sửa câu hỏi', 'Edit question')}
                  >
                    {t('Sửa', 'Edit')}
                  </button>
                )}
                {(isAuthor || isModerator) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            'Xoá câu hỏi này cùng toàn bộ câu trả lời?',
                            'Delete this question and all its answers?',
                          ),
                        )
                      ) {
                        deleteQuestion(question.id)
                      }
                    }}
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                    aria-label={t('Xoá câu hỏi', 'Delete question')}
                  >
                    {t('Xoá', 'Delete')}
                  </button>
                )}
              </div>
            </div>
          </article>

          {/* Trả lời */}
          <section className="mt-6">
            <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-ink">
              {t('Câu trả lời', 'Answers')}
              <span className="font-mono text-xs font-normal text-ink-faint">
                {mainAnswers.length}
              </span>
            </h2>

            {mainAnswers.length === 0 && (
              <div className="card px-5 py-10 text-center">
                <p className="text-sm font-medium text-ink">
                  {t('Chưa có câu trả lời nào', 'No answers yet')}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {t(
                    'Hãy là người đầu tiên trả lời, và nhớ kèm nguồn chính thức.',
                    'Be the first to answer, and remember to cite an official source.',
                  )}
                </p>
              </div>
            )}

            <div className="space-y-3">
              {mainAnswers.map((answer) => {
                const liked = state.helpful.includes(answer.id)
                return (
                  <article
                    key={answer.id}
                    className={`card p-4 sm:p-5 ${
                      answer.accepted ? 'border-brand-300 ring-1 ring-brand-100' : ''
                    }`}
                  >
                    {answer.accepted && (
                      <div className="mb-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-2xs font-medium text-brand-800">
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                          <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                        </svg>
                        {t('Câu trả lời đã giải quyết câu hỏi', 'Accepted answer')}
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <Avatar author={answer.author} size="sm" showVerified />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs">
                          <span className="font-semibold text-ink">{answer.author.displayName}</span>
                          {answer.author.verified && (
                            <span className="inline-flex h-3 w-3 items-center justify-center rounded-full bg-verify-600 text-white">
                              <svg viewBox="0 0 20 20" className="h-1.5 w-1.5 fill-current">
                                <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                              </svg>
                            </span>
                          )}
                          <span className="text-ink-faint">
                            {bi(answer.author.facultyVi, answer.author.facultyEn)} ·{' '}
                            {answer.author.cohort}
                          </span>
                          <span className="text-ink-faint">·</span>
                          <span className="text-ink-faint">
                            {relativeTime(answer.createdAt, lang)}
                          </span>
                        </div>

                        <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink">
                          {bi(answer.body, answer.bodyEn)}
                        </p>

                        {answer.referral && (
                          <div className="mt-3 rounded-lg border border-clay-200 bg-clay-50 px-3.5 py-3">
                            <p className="text-2xs font-semibold uppercase tracking-wide text-clay-700">
                              {t('Đầu mối cần liên hệ', 'Referral office')}
                            </p>
                            <p className="mt-1 text-xs font-medium text-ink">
                              {bi(answer.referral.office, answer.referral.officeEn)}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                              {bi(answer.referral.note, answer.referral.noteEn)}
                            </p>
                          </div>
                        )}

                        {answer.sources.length > 0 && (
                          <div className="mt-3.5">
                            <SourceList sources={answer.sources} compact />
                          </div>
                        )}

                        <div className="mt-3.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleHelpful(answer.id)}
                            aria-pressed={liked}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-medium transition ${
                              liked
                                ? 'border-clay-300 bg-clay-50 text-clay-700'
                                : 'border-paper-300 bg-white text-ink-muted hover:border-clay-300 hover:text-clay-700'
                            }`}
                          >
                            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                              <path d="M10 17.5 3.6 11a3.4 3.4 0 0 1 4.8-4.8l1.6 1.6 1.6-1.6A3.4 3.4 0 1 1 16.4 11L10 17.5Z" />
                            </svg>
                            {t('Hữu ích', 'Helpful')} ·{' '}
                            <span className="font-mono font-semibold">{answer.helpful}</span>
                          </button>

                          {/* Đánh dấu đã giải quyết — người hỏi hoặc quản trị viên */}
                          {(isAuthor || isModerator) && !answer.accepted && (
                            <button
                              type="button"
                              onClick={() => acceptAnswer(answer.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 text-2xs font-medium text-ink-muted transition hover:border-brand-300 hover:text-brand-700"
                            >
                              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                                <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
                              </svg>
                              {t('Đánh dấu đã giải quyết', 'Mark as resolved')}
                            </button>
                          )}

                          {/* Sửa câu trả lời của chính mình hoặc cán bộ kiểm duyệt */}
                          {(answer.author.id === state.currentUser?.id || isModerator) && (
                            <button
                              type="button"
                              onClick={() => setEditAnswerId(answer.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 text-2xs font-medium text-ink-muted transition hover:border-brand-300 hover:text-brand-700"
                            >
                              {t('Sửa', 'Edit')}
                            </button>
                          )}

                          {/* Xoá câu trả lời của chính mình */}
                          {(answer.author.id === state.currentUser?.id || isModerator) && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(t('Xoá câu trả lời này?', 'Delete this answer?'))) {
                                  deleteAnswer(answer.id)
                                }
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 text-2xs font-medium text-ink-muted transition hover:border-clay-300 hover:text-clay-700"
                            >
                              {t('Xoá', 'Delete')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {/* Biến thể "Trường hợp của mình khác" */}
          {variants.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 fill-none stroke-clay-500 stroke-2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 6h12M4 10h8M4 14h6" />
                </svg>
                {t('Trường hợp của mình khác', 'My case is different')}
              </h2>
              <p className="mb-3 text-xs leading-relaxed text-ink-muted">
                {t(
                  'Cùng một câu hỏi, hoàn cảnh khác. Các trả lời dưới đây không thay thế câu trả lời chính.',
                  'Same question, different circumstances. These answers do not replace the main one.',
                )}
              </p>

              <div className="space-y-3">
                {variants.map((answer) => (
                  <article
                    key={answer.id}
                    className="rounded-card border border-clay-200 bg-clay-50/50 p-4 sm:p-5"
                  >
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-clay-200 bg-white px-3 py-2">
                      <svg
                        viewBox="0 0 20 20"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-none stroke-clay-500 stroke-2"
                        strokeLinecap="round"
                      >
                        <circle cx="10" cy="10" r="7.5" />
                        <path d="M10 9v5m0-8v.5" />
                      </svg>
                      <div className="min-w-0">
                        <p className="text-2xs font-semibold uppercase tracking-wide text-clay-700">
                          {t('Bối cảnh', 'Context')}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                          {bi(answer.variant!.context, answer.variant!.contextEn)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      {answer.variant!.anonymous ? (
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-200 font-mono text-2xs font-semibold text-ink-faint">
                          ?
                        </span>
                      ) : (
                        <Avatar author={answer.author} size="sm" showVerified />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-2xs text-ink-faint">
                          {answer.variant!.anonymous
                            ? t('Ẩn danh', 'Anonymous')
                            : `${answer.author.displayName} · ${bi(
                                answer.author.facultyVi,
                                answer.author.facultyEn,
                              )}`}{' '}
                          · {relativeTime(answer.createdAt, lang)}
                        </p>
                        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
                          {bi(answer.body, answer.bodyEn)}
                        </p>
                        {answer.sources.length > 0 && (
                          <div className="mt-3">
                            <SourceList sources={answer.sources} compact />
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Viết trả lời */}
          <AnswerComposer questionId={question.id} />
        </div>

        {/* Cột phụ */}
        <aside className="space-y-5">
          <section className="card p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Tóm tắt', 'At a glance')}
            </h2>
            <dl className="mt-3 space-y-2.5 text-xs">
              {[
                {
                  l: t('Câu trả lời', 'Answers'),
                  v: formatCount(question.answerCount, lang),
                },
                {
                  l: t('Người cũng cần biết', 'Also need this'),
                  v: formatCount(question.alsoNeed, lang),
                },
                {
                  l: t('Lượt xem', 'Views'),
                  v: formatCount(question.views, lang),
                },
                {
                  l: t('Trường hợp khác', 'Other cases'),
                  v: formatCount(variants.length, lang),
                },
              ].map((row) => (
                <div key={row.l} className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">{row.l}</dt>
                  <dd className="font-mono font-semibold text-ink">{row.v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <OfficialPortals />

          <section className="card p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Nguồn của câu hỏi', 'Sources on this page')}
            </h2>
            <div className="mt-3">
              <SourceBlock sources={dedupeSources(answers)} />
            </div>
          </section>
        </aside>
      </div>

      {/* Sửa câu hỏi */}
      <EditQuestionDialog
        question={question}
        open={editQuestionOpen}
        onClose={() => setEditQuestionOpen(false)}
      />

      {/* Sửa câu trả lời */}
      {editAnswer && (
        <EditAnswerDialog
          answer={editAnswer}
          open={editAnswerId !== null}
          onClose={() => setEditAnswerId(null)}
        />
      )}

      {/* Báo cáo */}
      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={t('Báo cáo câu hỏi này', 'Report this question')}
        description={t(
          'Báo để cộng tác viên kiểm duyệt xem lại. Thông tin lỗi thời thường được cập nhật trong vài ngày.',
          'A moderator will review it. Outdated answers are usually updated within a few days.',
        )}
        footer={
          <>
            <button type="button" onClick={() => setReportOpen(false)} className="btn-secondary">
              {t('Huỷ', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={submitReport}
              disabled={!reportDetail.trim()}
              className="btn-primary"
            >
              {t('Gửi báo cáo', 'Send report')}
            </button>
          </>
        }
      >
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-ink">
            {t('Lý do', 'Reason')}
          </legend>
          <div className="space-y-1.5">
            {reasons.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-paper-200 px-3 py-2 transition hover:border-brand-300 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.id}
                  checked={reportReason === r.id}
                  onChange={() => setReportReason(r.id)}
                  className="h-4 w-4 border-paper-400 text-brand-700 focus:ring-brand-500"
                />
                <span className="text-xs text-ink">{t(r.vi, r.en)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold text-ink">
            {t('Chi tiết', 'Details')}
          </span>
          <textarea
            value={reportDetail}
            onChange={(e) => setReportDetail(e.target.value)}
            rows={3}
            placeholder={t(
              'Điều gì đã lỗi thời hoặc không chính xác?',
              'What is outdated or incorrect?',
            )}
            className="field resize-y"
          />
        </label>
      </Modal>
    </div>
  )
}

/** Gom các nguồn từ mọi câu trả lời, bỏ trùng theo URL. */
function dedupeSources(answers: ReturnType<typeof answersFor>) {
  const map = new Map<string, (typeof answers)[number]['sources'][number]>()
  for (const answer of answers) {
    for (const source of answer.sources) {
      if (!map.has(source.url)) map.set(source.url, source)
    }
  }
  return Array.from(map.values())
}
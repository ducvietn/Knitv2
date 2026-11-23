import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { TOPICS } from '../data/topics'
import { postQuestion, refreshQuestions, similarQuestions, state, useKnit } from '../store/knit'
import { useI18n } from '../lib/i18n'
import { OFFICIAL_PORTALS } from '../data/mock'

export function AskPage() {
  const { t, bi } = useI18n()
  useKnit()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [topic, setTopic] = useState<string>('')
  const [tags, setTags] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceTitle, setSourceTitle] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof similarQuestions>>>([])

  // Gợi ý cập nhật tức thì khi tiêu đề thay đổi — cơ chế cốt lõi của KNIT.
  useEffect(() => {
    const draft = `${title} ${body}`
    const timer = window.setTimeout(() => {
      similarQuestions(draft).then(setSuggestions)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [title, body])

  // Danh sách câu hỏi trong cộng đồng (cho bộ đếm và để chấm điểm gợi ý).
  useEffect(() => {
    refreshQuestions().catch(() => undefined)
  }, [])

  const titleValid = title.trim().length >= 10
  const bodyValid = body.trim().length >= 20
  const topicValid = !!topic

  const canSubmit = titleValid && bodyValid && topicValid

  const submit = async () => {
    setTouched(true)
    if (!canSubmit || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const question = await postQuestion({
        title: title.trim(),
        body: body.trim(),
        topic: topic as (typeof TOPICS)[number]['id'],
        anonymous,
        tags: tags
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        ...(sourceUrl.trim()
          ? { source: { title: sourceTitle.trim() || 'Nguồn chính thức', url: sourceUrl.trim() } }
          : {}),
      })
      navigate(`/question/${question.id}`)
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Không thể đăng câu hỏi. Vui lòng thử lại.',
      )
      setSubmitting(false)
    }
  }

  const fieldError = (show: boolean, message: string) =>
    show ? <p className="mt-1.5 text-2xs text-clay-600">{message}</p> : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {t('Đặt câu hỏi', 'Ask a question')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          {t(
            'Viết rõ bạn đang gặp gì. KNIT sẽ kiểm tra câu hỏi trùng lặp ngay khi bạn gõ — và mọi câu trả lời về quy định của Trường đều cần kèm nguồn chính thức.',
            'Describe what you are up against. KNIT checks for duplicates as you type — and any answer about a university rule must cite an official source.',
          )}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          {/* Tiêu đề + gợi ý */}
          <section className="card p-5">
            <label className="block">
              <span className="text-xs font-semibold text-ink">
                {t('Tiêu đề câu hỏi', 'Question title')}
                <span className="ml-1 font-normal text-ink-faint">
                  {t('— nên là một câu hỏi cụ thể', '— one clear question')}
                </span>
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={t(
                  'Ví dụ: Đăng ký học phần bị trùng lịch thì có được ưu tiên không?',
                  'e.g. If I get a schedule clash when registering, do I get priority?',
                )}
                className="field mt-1.5"
                aria-invalid={touched && !titleValid}
              />
              {fieldError(
                touched && !titleValid,
                t('Cần ít nhất 10 ký tự.', 'At least 10 characters.'),
              )}
            </label>

            {/* Gợi ý câu hỏi tương tự */}
            {suggestions.length > 0 && (
              <div className="mt-4 animate-fade-up overflow-hidden rounded-lg border border-clay-200 bg-clay-50">
                <p className="flex items-center gap-2 border-b border-clay-200 bg-white px-3.5 py-2 text-2xs font-semibold uppercase tracking-wider text-clay-700">
                  <svg
                    viewBox="0 0 20 20"
                    className="h-3.5 w-3.5 fill-none stroke-current stroke-2"
                    strokeLinecap="round"
                  >
                    <circle cx="10" cy="10" r="7.5" />
                    <path d="M10 9v5m0-8v.5" />
                  </svg>
                  {t(
                    'Câu hỏi này có thể đã có câu trả lời',
                    'This may already be answered',
                  )}
                </p>
                <ul className="divide-y divide-clay-100">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <Link
                        to={`/question/${s.id}`}
                        className="flex items-start gap-3 bg-white/70 px-3.5 py-2.5 transition hover:bg-white"
                      >
                        <span className="mt-0.5 shrink-0 rounded bg-brand-100 px-1.5 py-0.5 font-mono text-2xs font-semibold text-brand-700">
                          {s.answerCount}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium leading-snug text-ink">
                            {bi(s.title, s.titleEn)}
                          </span>
                          <span className="mt-0.5 block text-2xs text-ink-faint">
                            {s.answerCount > 0
                              ? t('đã có câu trả lời', 'already answered')
                              : t('chưa có câu trả lời', 'not answered yet')}
                            {' · '}
                            {s.alsoNeed} {t('cần biết', 'need this')}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-clay-200 px-3.5 py-2 text-2xs text-clay-700">
                  {t(
                    'Nếu đúng câu hỏi của bạn, hãy mở nó thay vì đặt câu mới.',
                    'If one of these is your question, open it instead of posting a new one.',
                  )}
                </p>
              </div>
            )}

            <label className="mt-5 block">
              <span className="text-xs font-semibold text-ink">
                {t('Chi tiết', 'Details')}
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => setTouched(true)}
                rows={5}
                placeholder={t(
                  'Bạn đang ở tình huống nào, đã thử gì, và cần biết điều gì?',
                  'What is your situation, what have you tried, and what do you need to know?',
                )}
                className="field mt-1.5 resize-y"
                aria-invalid={touched && !bodyValid}
              />
              {fieldError(
                touched && !bodyValid,
                t('Cần ít nhất 20 ký tự.', 'At least 20 characters.'),
              )}
            </label>
          </section>

          {/* Chủ đề + thẻ */}
          <section className="card p-5">
            <fieldset>
              <legend className="text-xs font-semibold text-ink">
                {t('Chủ đề', 'Topic')}
              </legend>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {TOPICS.map((tp) => (
                  <label
                    key={tp.id}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 transition ${
                      topic === tp.id
                        ? 'border-brand-400 bg-brand-50'
                        : 'border-paper-200 hover:border-brand-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="topic"
                      value={tp.id}
                      checked={topic === tp.id}
                      onChange={() => setTopic(tp.id)}
                      className="h-4 w-4 border-paper-400 text-brand-700 focus:ring-brand-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink">
                        {bi(tp.labelVi, tp.labelEn)}
                      </span>
                      <span className="mt-0.5 block truncate text-2xs text-ink-faint">
                        {bi(tp.blurbVi, tp.blurbEn)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {fieldError(touched && !topicValid, t('Hãy chọn một chủ đề.', 'Pick a topic.'))}
            </fieldset>

            <label className="mt-5 block">
              <span className="text-xs font-semibold text-ink">
                {t('Thẻ', 'Tags')}
                <span className="ml-1 font-normal text-ink-faint">
                  {t('— ngăn cách bằng dấu phẩy', '— comma separated')}
                </span>
              </span>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder={t('học phí, miễn giảm, thủ tục', 'tuition, waiver, procedure')}
                className="field mt-1.5"
              />
            </label>
          </section>

          {/* Nguồn chính thức */}
          <section className="card p-5">
            <h2 className="text-xs font-semibold text-ink">
              {t('Nguồn chính thức (không bắt buộc)', 'Official source (optional)')}
            </h2>
            <p className="mt-1 text-2xs leading-relaxed text-ink-muted">
              {t(
                'Nếu bạn đã biết nơi quy định nằm, dán link ở đây. Đường dẫn phải là trang thật của Trường hoặc ĐHQGHN.',
                'If you already know where the rule is published, paste the link. It must be a real university or VNU page.',
              )}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.4fr]">
              <label className="block">
                <span className="mb-1 block text-2xs font-medium text-ink-muted">
                  {t('Tiêu đề nguồn', 'Source title')}
                </span>
                <input
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  placeholder={t('Ví dụ: Thông báo đăng ký học phần', 'e.g. Course registration notice')}
                  className="field"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-2xs font-medium text-ink-muted">
                  {t('Đường dẫn', 'URL')}
                </span>
                <input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://ulis.vnu.edu.vn/..."
                  className="field font-mono text-xs"
                />
              </label>
            </div>
            {sourceUrl && !/^https:\/\//.test(sourceUrl) && (
              <p className="mt-1.5 text-2xs text-clay-600">
                {t('Đường dẫn phải bắt đầu bằng https://', 'The URL must start with https://')}
              </p>
            )}
          </section>

          {/* Ẩn danh */}
          <section className="card p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-paper-400 text-brand-700 focus:ring-brand-500"
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-ink">
                  {t('Đăng ẩn danh', 'Post anonymously')}
                </span>
                <span className="mt-1 block text-2xs leading-relaxed text-ink-muted">
                  {t(
                    'Tên và khoa của bạn sẽ không hiện. Hãy chỉ dùng khi bạn thực sự cần giữ kín thông tin.',
                    'Your name and faculty will not appear. Use this only when you genuinely need to stay private.',
                  )}
                </span>
              </span>
            </label>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xs text-ink-faint">
              {state.questions.length} {t('câu hỏi đã có trong cộng đồng', 'questions already in the community')}
            </p>
            <div className="flex items-center gap-2">
              <Link to="/" className="btn-secondary">
                {t('Huỷ', 'Cancel')}
              </Link>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? t('Đang đăng…', 'Posting…') : t('Đăng câu hỏi', 'Post question')}
              </button>
            </div>
          </div>
          {submitError && (
            <p className="mt-3 rounded-lg border border-clay-200 bg-clay-50 px-3.5 py-2.5 text-xs text-clay-700">
              {submitError}
            </p>
          )}
        </div>

        {/* Cột hướng dẫn */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {t('Viết câu hỏi tốt', 'Ask well')}
            </h2>
            <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-muted">
              {[
                {
                  vi: 'Một câu hỏi, một vấn đề. Tách những vấn đề khác ra.',
                  en: 'One question, one issue. Split anything else out.',
                },
                {
                  vi: 'Nêu rõ hoàn cảnh: khóa, khoa, học kỳ, môn học.',
                  en: 'Give context: year, faculty, semester, course.',
                },
                {
                  vi: 'Đính kèm nguồn nếu bạn đã tìm thấy quy định.',
                  en: 'Attach the source if you already found the rule.',
                },
                {
                  vi: 'Đừng đăng lại câu đã có — hãy bấm "Mình cũng cần biết".',
                  en: 'Do not repost. Use "I also need this" instead.',
                },
              ].map((tip) => (
                <li key={tip.en} className="flex gap-2">
                  <svg
                    viewBox="0 0 20 20"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-none stroke-brand-500 stroke-2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 10.5 8 14l8-8" />
                  </svg>
                  {t(tip.vi, tip.en)}
                </li>
              ))}
            </ul>
          </section>

          <section className="card overflow-hidden">
            <header className="border-b border-paper-200 bg-brand-50 px-4 py-3">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-brand-800">
                {t('Nguồn chính thức thường dùng', 'Common official sources')}
              </h2>
            </header>
            <ul className="divide-y divide-paper-100">
              {OFFICIAL_PORTALS.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2.5 transition hover:bg-paper-50"
                  >
                    <span className="block text-xs font-medium text-ink">{t(p.labelVi, p.labelEn)}</span>
                    <span className="mt-0.5 block truncate font-mono text-2xs text-ink-faint">
                      {p.url.replace('https://', '')}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TOPICS, TOPIC_MAP } from '../data/topics'
import {
  markAlsoNeed,
  refreshQuestions,
  similarQuestions,
  state,
  toggleFollowTopic,
  useKnit,
} from '../store/knit'
import { useI18n, formatCount } from '../lib/i18n'
import { QuestionCard } from '../components/QuestionCard'
import { OfficialPortals } from '../components/OfficialPortals'
import { Pagination } from '../components/Pagination'

/**
 * Số câu hỏi hiện trên mỗi trang.
 *
 * Danh sách KNIT đang có hơn 40 câu — hiện tất cả một lượt làm trang nặng
 * và khó cuộn trên điện thoại.
 */
const PAGE_SIZE = 6

export function HomePage() {
  const { t, bi, lang } = useI18n()
  useKnit()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof similarQuestions>>>([])

  const topicParam = params.get('topic')
  const activeTopic = TOPICS.find((x) => x.id === topicParam)?.id

  /**
   * Trang hiện tại — nằm trong URL để người dùng chia sẻ được link.
   */
  const pageParam = Number(params.get('page') ?? '1')
  const [page, setPage] = useState(Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1)

  // Nạp danh sách câu hỏi từ server.
  useEffect(() => {
    refreshQuestions().catch(() => undefined)
  }, [])

  /**
   * Đồng bộ trang với URL.
   *
   * Cần thiết khi người dùng bấm nút Back của trình duyệt, hoặc mở link
   * `?page=3` trực tiếp.
   */
  useEffect(() => {
    const p = Number(params.get('page') ?? '1')
    const next = Number.isFinite(p) && p > 0 ? p : 1
    if (next !== page) setPage(next)
  }, [params, page])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.questions
      .filter((question) => (activeTopic ? question.topic === activeTopic : true))
      .filter((question) => {
        if (!q) return true
        const haystack =
          `${question.title} ${question.titleEn} ${question.body} ${question.bodyEn} ${question.tags.join(' ')}`.toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => {
        // Câu đã giải quyết và được nhiều người cần biết lên trước.
        if (a.answered !== b.answered) return a.answered ? -1 : 1
        return b.alsoNeed - a.alsoNeed
      })
  }, [activeTopic, query, state.questions.length])

  const handleSearch = (value: string) => {
    setQuery(value)
    // Tìm kiếm là danh sách mới — quay về trang đầu.
    setPage(1)
    similarQuestions(value).then(setSuggestions)
  }

  const setTopic = (id?: string) => {
    const next = new URLSearchParams(params)
    if (id) next.set('topic', id)
    else next.delete('topic')
    // Đổi chủ đề cũng là danh sách mới — quay về trang đầu.
    next.delete('page')
    setParams(next)
    setPage(1)
  }

  /**
   * Chuyển trang — ghi số trang vào URL để link chia sẻ được.
   */
  const goToPage = (next: number) => {
    const params2 = new URLSearchParams(params)
    if (next <= 1) params2.delete('page')
    else params2.set('page', String(next))
    setParams(params2)
    setPage(next)
    // Cuộn lên đầu danh sách, nếu không người dùng thấy vẫn trang cũ.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /**
   * Đóng gợi ý khi người dùng cuộn trang.
   *
   * Không làm vậy thì danh sách gợi ý nổi lên che mất danh sách câu hỏi
   * bên dưới, và người dùng tưởng trang bị kẹt — không cuộn xuống được.
   */
  useEffect(() => {
    if (suggestions.length === 0) return
    const onScroll = () => setSuggestions([])
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [suggestions.length])

  /**
   * Cắt danh sách theo trang.
   *
   * Trang hiện tại được ép về giới hạn hợp lệ — ví dụ người dùng đang ở
   * trang 5 rồi lọc còn 1 trang, ta đưa họ về trang cuối thay vì hiện trang
   * trống.
   */
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const unresolved = state.questions.filter((q) => !q.answered).length

  return (
    <div>
      {/* Hero — nơi người dùng bắt đầu: gõ câu hỏi, KNIT gợi ý câu đã có */}
      {/*
        Hero — nơi người dùng bắt đầu: gõ câu hỏi, KNIT gợi ý câu đã có.

        `overflow-hidden` bị bỏ khỏi `<section>` vì nó CẮT danh sách gợi ý
        (dropdown `absolute` nằm trong hero). Thay vào đó, phần nền gradient
        được bọc trong một div riêng có `overflow-hidden` — hiệu ứng giữ nguyên
        mà dropdown vẫn tràn ra được.
      */}
      <section className="relative border-b border-paper-300 bg-brand-900 text-white">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="grain absolute inset-0 opacity-70" aria-hidden />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 18% 20%, rgba(214,174,133,0.5), transparent 42%), radial-gradient(circle at 82% 78%, rgba(130,168,226,0.4), transparent 46%)',
            }}
            aria-hidden
          />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-2xs font-medium text-brand-100 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-clay-300" />
              {t(
                'Dành cho sinh viên ULIS — Trường Đại học Ngoại ngữ, ĐHQGHN',
                'For ULIS students — University of Languages and International Studies, VNU',
              )}
            </p>

            <h1 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              {t(
                'Câu hỏi của tân sinh viên, trả lời có nguồn.',
                'Freshmen questions, answered with sources.',
              )}
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-brand-100 sm:text-base">
              {t(
                'Gõ câu hỏi của bạn. KNIT sẽ gợi ý ngay những câu đã có câu trả lời từ khóa trên và cán bộ, kèm đường dẫn tới nguồn chính thức của Trường — để không ai phải hỏi lại một câu đã có người trả lời.',
                'Type your question. KNIT instantly surfaces questions already answered by seniors and staff, each linked to the university’s official source — so nobody has to ask twice.',
              )}
            </p>

            {/* Ô tìm kiếm + gợi ý tức thì */}
            <div className="relative mt-7">
              <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white p-2 shadow-lift">
                <svg
                  viewBox="0 0 20 20"
                  className="ml-2 h-5 w-5 shrink-0 fill-none stroke-ink-faint stroke-2"
                  strokeLinecap="round"
                >
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="m13.5 13.5 3 3" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={t(
                    'Ví dụ: làm thẻ sinh viên ở đâu, mượn sách được mấy cuối…',
                    'e.g. Where do I get a student ID, how many books can I borrow…',
                  )}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-ink-faint sm:text-base"
                  aria-label={t('Tìm câu hỏi', 'Search questions')}
                />
                <Link to="/ask" className="btn-primary shrink-0 px-3 sm:px-4">
                  <span className="hidden sm:inline">{t('Đặt câu hỏi', 'Ask')}</span>
                  <span className="sm:hidden">{t('Hỏi', 'Ask')}</span>
                </Link>
              </div>

              {suggestions.length > 0 && (
                <>
                  {/* Nền mờ — bấm ra ngoài để đóng danh sách gợi ý */}
                  <button
                    type="button"
                    aria-label={t('Đóng gợi ý', 'Close suggestions')}
                    onClick={() => setSuggestions([])}
                    className="fixed inset-0 z-20 cursor-default bg-brand-900/40 backdrop-blur-[2px]"
                  />

                  <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[60vh] animate-fade-up overflow-y-auto rounded-2xl border border-paper-300 bg-white shadow-lift scrollbar-slim">
                    <p className="sticky top-0 border-b border-paper-200 bg-paper-50 px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                    {t(
                      'Câu hỏi tương tự đã có câu trả lời',
                      'Similar questions already answered',
                    )}
                  </p>
                  <ul>
                    {suggestions.map((s) => (
                      <li key={s.id}>
                        <Link
                          to={`/question/${s.id}`}
                          onClick={() => setSuggestions([])}
                          className="flex items-start gap-3 border-b border-paper-100 px-4 py-3 transition last:border-0 hover:bg-brand-50"
                        >
                          <span className="mt-0.5 shrink-0 font-mono text-2xs font-semibold text-brand-600">
                            {s.answerCount}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium leading-snug text-ink">
                              {bi(s.title, s.titleEn)}
                            </span>
                            <span className="mt-0.5 block text-2xs text-ink-faint">
                              {TOPIC_MAP[s.topic].labelVi} · {formatCount(s.alsoNeed, lang)}{' '}
                              {t('cần biết', 'need this')}
                            </span>
                          </span>
                          <svg viewBox="0 0 20 20" className="mt-1 h-3.5 w-3.5 shrink-0 fill-ink-faint">
                            <path d="M7.5 4 13 10l-5.5 6-1.2-1.1L10.6 10 6.3 5.1 7.5 4Z" />
                          </svg>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="sticky bottom-0 bg-paper-50 px-4 py-2.5 text-2xs text-ink-muted">
                    {t('Không thấy câu nào đúng? ', 'None of these fit? ')}
                    <Link to="/ask" className="font-semibold text-brand-700 hover:underline">
                      {t('Đặt câu hỏi mới', 'Ask a new question')}
                    </Link>
                  </div>
                  </div>
                </>
              )}
            </div>

            <dl className="mt-9 grid max-w-2xl grid-cols-3 gap-4 border-t border-white/15 pt-6">
              {[
                { v: formatCount(state.questions.length, lang), l: t('câu hỏi', 'questions') },
                {
                  v: formatCount(state.questions.filter((q) => q.answered).length, lang),
                  l: t('đã giải quyết', 'resolved'),
                },
                { v: formatCount(unresolved, lang), l: t('đang chờ', 'awaiting') },
              ].map((item) => (
                <div key={item.l}>
                  <dt className="font-mono text-2xl font-bold text-white">{item.v}</dt>
                  <dd className="mt-0.5 text-2xs uppercase tracking-wide text-brand-200">{item.l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Danh sách câu hỏi */}
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTopic(undefined)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  !activeTopic
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-paper-300 bg-white text-ink-muted hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                {t('Tất cả', 'All')}
              </button>
              {TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setTopic(topic.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeTopic === topic.id
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-paper-300 bg-white text-ink-muted hover:border-brand-300 hover:text-brand-700'
                  }`}
                >
                  <span className="font-mono text-2xs opacity-70">{topic.mark}</span>
                  {t(topic.labelVi, topic.labelEn)}
                </button>
              ))}
            </div>

            {activeTopic && (
              <p className="mb-4 rounded-lg border border-brand-100 bg-brand-50 px-3.5 py-2.5 text-xs text-brand-800">
                <span className="font-semibold">
                  {bi(TOPIC_MAP[activeTopic].labelVi, TOPIC_MAP[activeTopic].labelEn)}
                </span>{' '}
                — {bi(TOPIC_MAP[activeTopic].blurbVi, TOPIC_MAP[activeTopic].blurbEn)}
              </p>
            )}

            {filtered.length === 0 ? (
              <div className="card flex flex-col items-center px-6 py-14 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-paper-200 text-ink-faint">
                  <svg viewBox="0 0 20 20" className="h-6 w-6 fill-none stroke-current stroke-2">
                    <circle cx="9" cy="9" r="5.5" />
                    <path d="m13.5 13.5 3 3" />
                  </svg>
                </span>
                <p className="mt-4 text-sm font-semibold text-ink">
                  {t('Chưa có câu hỏi nào khớp', 'No matching questions yet')}
                </p>
                <p className="mt-1 max-w-sm text-xs text-ink-muted">
                  {t(
                    'Hãy đặt câu hỏi của bạn — KNIT sẽ gợi ý những câu gần giống trong lúc bạn gõ.',
                    'Post your question — KNIT will suggest close matches while you type.',
                  )}
                </p>
                <Link to="/ask" className="btn-primary mt-5">
                  {t('Đặt câu hỏi', 'Ask a question')}
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {visible.map((q) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      onToggleAlsoNeed={markAlsoNeed}
                      isAlsoNeedMarked={state.alsoNeed.includes(q.id)}
                    />
                  ))}
                </div>

                <Pagination page={currentPage} pageCount={pageCount} onChange={goToPage} />
              </>
            )}
          </div>

          {/* Cột phụ */}
          <aside className="space-y-5">
            <OfficialPortals />

            <section className="card p-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                {t('Theo dõi chủ đề', 'Follow a topic')}
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                {t(
                  'Nhận thông báo khi chủ đề bạn quan tâm có câu hỏi mới.',
                  'Get notified when a topic you follow gets a new question.',
                )}
              </p>
              <ul className="mt-3 space-y-1.5">
                {TOPICS.map((topic) => {
                  const following = state.followingTopics.includes(topic.id)
                  return (
                    <li key={topic.id}>
                      <button
                        type="button"
                        onClick={() => toggleFollowTopic(topic.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-paper-200 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-ink">
                            {bi(topic.labelVi, topic.labelEn)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-2xs font-semibold transition ${
                            following
                              ? 'bg-brand-700 text-white'
                              : 'bg-paper-200 text-ink-muted'
                          }`}
                        >
                          {following ? t('Đang theo', 'Following') : t('Theo dõi', 'Follow')}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="card p-4">
              <h2 className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                {t('Nguyên tắc của KNIT', 'KNIT principles')}
              </h2>
              <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-muted">
                {[
                  {
                    vi: 'Câu trả lời về quy định của Trường phải kèm nguồn chính thức.',
                    en: 'Answers about university rules must cite an official source.',
                  },
                  {
                    vi: 'Trường hợp của bạn khác thì ghi rõ — không sửa câu hỏi gốc.',
                    en: 'If your case differs, add it — never overwrite the original question.',
                  },
                  {
                    vi: 'Khi thông tin lỗi thời, hãy báo để người trả lời cập nhật.',
                    en: 'When something is outdated, report it so the author can update it.',
                  },
                ].map((rule) => (
                  <li key={rule.en} className="flex gap-2">
                    <svg
                      viewBox="0 0 20 20"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-none stroke-brand-500 stroke-2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 10.5 8 14l8-8" />
                    </svg>
                    {t(rule.vi, rule.en)}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
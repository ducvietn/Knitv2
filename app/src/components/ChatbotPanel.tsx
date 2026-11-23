import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useI18n } from '../lib/i18n'

/**
 * Trợ lý điều hướng — chatbot dẫn sinh viên đến cộng đồng, không thay thế.
 *
 * Ba bước đúng như thiết kế:
 *
 * 1. Bot tóm tắt ngắn gọn từ bài viết có sẵn trong diễn đàn.
 * 2. Ngay dưới đó là các thẻ bài viết gốc kèm người đã trả lời.
 * 3. Nút "Chuyển thành bài đăng ẩn danh" tự điền sẵn nội dung vào form.
 */

/** Một nguồn trong diễn đàn mà bot tìm thấy. */
export interface ChatSource {
  kind: 'question' | 'answer'
  questionId: string
  sourceId: string
  title: string
  titleEn: string
  snippet: string
  snippetEn: string
  topic: string
  authorName: string
  authorVerified: boolean
  authorCohort: string
  answerCount: number
  accepted: boolean
  helpful: number
  score: number
}

/** Kết quả một lượt chat. */
export interface ChatReply {
  answer: string
  sources: ChatSource[]
  suggestPost: boolean
  suggestedTitle: string
  suggestedBody: string
  suggestAnonymous: boolean
  /** `false` khi đây là phản hồi tức thì — web sẽ gọi lại sau vài giây. */
  ready: boolean
}

/** Một lượt chat trong khung thoại. */
interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  /** Nội dung hiển thị. */
  text: string
  /** Với bot: các nguồn liên quan. */
  sources?: ChatSource[]
  /**
   * Với bot: đang chờ LLM lọc nguồn xong chưa.
   *
   * Chỉ khi chưa xong thì hiện phần "đang tìm" — thẻ nguồn chỉ hiện khi
   * đã chọn lọc xong để tránh hiện ra một loạt bài không liên quan.
   */
  searching?: boolean
  /** Với bot: có nên gợi ý đăng bài không. */
  suggestPost?: boolean
  suggestedTitle?: string
  suggestedBody?: string
  suggestAnonymous?: boolean
}

export function ChatbotPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Đóng bằng Escape, và cuộn xuống đáy mỗi khi có tin nhắn mới.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    inputRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || asking) return

    setError(null)
    setInput('')
    setAsking(true)
    const messageId = `b${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: `u${Date.now()}`, role: 'user', text: question },
      {
        id: messageId,
        role: 'bot',
        text: t('Mình đang tìm trong cộng đồng…', 'Searching the community…'),
        sources: [],
        searching: true,
      },
    ])

    /**
     * Bước 1 — gọi không chờ, nhận ngay phản hồi tức thì (~100ms).
     *
     * Bước này KHÔNG kèm thẻ nguồn: danh sách ứng viên lúc đó còn thô,
     * chưa được LLM lọc. Chỉ khi có kết quả chọn lọc (bước chờ) mới hiện
     * thẻ "Bài viết liên quan" — lúc đó thẻ nào cũng đúng và tối đa 4 thẻ.
     */
    try {
      const quick = await api.post<ChatReply>('/chatbot', { question, lang })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                text: quick.answer,
                searching: true,
              }
            : m,
        ),
      )

      /**
       * Bước 2 — gọi lại sau vài giây để lấy bản tóm tắt do model viết.
       *
       * Provider cần ~6s nên không chờ ngay, mà gọi lại ở chế độ chờ — nếu
       * model đã xong thì có kết quả luôn, nếu chưa thì vẫn trả về bản
       * tức thì đang hiện.
       */
      if (!quick.ready) {
        const full = await api.post<ChatReply>('/chatbot', { question, lang, wait: true })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  text: full.answer,
                  sources: full.sources,
                  searching: false,
                  suggestPost: full.suggestPost,
                  suggestedTitle: full.suggestedTitle,
                  suggestedBody: full.suggestedBody,
                  suggestAnonymous: full.suggestAnonymous,
                }
              : m,
          ),
        )
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('Không kết nối được trợ lý.', 'Could not reach the helper.'),
      )
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    } finally {
      setAsking(false)
    }
  }

  /**
   * Chuyển câu hỏi trong khung chat thành bài đăng ẩn danh.
   *
   * Nội dung được lưu vào `localStorage` rồi sang trang đặt câu hỏi, nơi
   * form tự điền — người dùng chỉ cần bấm "Đăng".
   */
  const convertToPost = (message: ChatMessage) => {
    const draft = {
      title: message.suggestedTitle ?? '',
      body: message.suggestedBody ?? '',
      anonymous: message.suggestAnonymous ?? true,
    }
    localStorage.setItem('knit.chatDraft', JSON.stringify(draft))
    onClose()
    navigate('/ask')
  }

  if (!open) return null

  const greeting: ChatMessage = {
    id: 'greeting',
    role: 'bot',
    text: t(
      'Chào bạn! Mình tìm giúp trong diễn đàn KNIT trước. Bạn hỏi về thủ tục gì?',
      'Hi! I look through the KNIT forum first. What procedure are you asking about?',
    ),
  }

  const thread = messages.length > 0 ? messages : [greeting]

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 animate-fade-in bg-brand-900/30"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={t('Trợ lý điều hướng', 'Navigation helper')}
        className="absolute bottom-0 right-0 top-0 flex w-full max-w-md animate-slide-in flex-col border-l border-paper-300 bg-paper-50 shadow-lift"
      >
        <header className="flex items-start justify-between gap-3 border-b border-paper-300 px-4 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {t('Trợ lý điều hướng', 'Navigation helper')}
            </h2>
            <p className="mt-0.5 text-2xs leading-snug text-ink-faint">
              {t(
                'Tóm tắt từ bài viết của cộng đồng — và chỉ vào nơi câu trả lời thật.',
                'Summarised from community threads — and points you to the real answers.',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint transition hover:bg-paper-200 hover:text-ink"
            aria-label={t('Đóng', 'Close')}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
              <path d="M6.4 5 5 6.4 8.6 10 5 13.6 6.4 15 10 11.4 13.6 15 15 13.6 11.4 10 15 6.4 13.6 5 10 8.6 6.4 5Z" />
            </svg>
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-slim px-4 py-4">
          {thread.map((message) => (
            <div key={message.id} className="mb-4">
              {message.role === 'user' ? (
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-xs leading-relaxed text-white">
                    {message.text}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-paper-300 bg-white px-3.5 py-2.5">
                    <p className="whitespace-pre-line text-xs leading-relaxed text-ink-muted">
                      {message.text}
                    </p>
                  </div>

                  {/* Đang lọc nguồn — chỉ hiện khi chưa có kết quả chọn lọc */}
                  {message.searching && (
                    <div className="mt-2.5 flex items-center gap-2 text-2xs text-ink-faint">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-paper-300 border-t-brand-500" />
                      {t('Đang lọc bài viết liên quan…', 'Filtering related threads…')}
                    </div>
                  )}

                  {/* Bước 2: thẻ bài viết gốc + người đã trả lời */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                        {t('Bài viết liên quan', 'Related threads')}
                      </p>
                      {message.sources.map((source) => (
                        <Link
                          key={`${source.questionId}-${source.sourceId}`}
                          to={`/question/${source.questionId}`}
                          onClick={onClose}
                          className="block rounded-lg border border-paper-300 bg-white px-3 py-2.5 transition hover:border-brand-300"
                        >
                          <p className="text-xs font-medium leading-snug text-ink">
                            {lang === 'en' ? source.titleEn || source.title : source.title}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {source.authorVerified && (
                              <span className="inline-flex items-center gap-1 rounded bg-verify-100 px-1.5 py-0.5 text-2xs font-semibold text-verify-700">
                                <svg viewBox="0 0 20 20" className="h-3 w-3 fill-current">
                                  <path d="M10 1.5 12.4 4l3.5-.4.6 3.4 2.5 2.4-1.9 3 1 3.4-3.3 1.2L10 19.5l-4.8-2.5-3.3-1.2 1-3.4-1.9-3L3.5 7l.6-3.4L7.6 4 10 1.5Z" />
                                </svg>
                                {t('Đã giải đáp', 'Answered')}
                              </span>
                            )}
                            <span className="text-2xs text-ink-muted">
                              {source.authorName}
                              {source.authorCohort && ` · ${source.authorCohort}`}
                            </span>
                            {source.accepted && (
                              <span className="text-2xs text-brand-700">
                                {t('đã giải quyết', 'resolved')}
                              </span>
                            )}
                            {source.helpful > 0 && (
                              <span className="text-2xs text-ink-faint">
                                {source.helpful} {t('hữu ích', 'helpful')}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Bước 3: chuyển thành bài đăng ẩn danh */}
                  {message.suggestPost && !message.searching && (
                    <button
                      type="button"
                      onClick={() => convertToPost(message)}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-2xs font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-100"
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="h-3.5 w-3.5 fill-none stroke-current stroke-2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10 4v12M4 10h12" />
                      </svg>
                      {t(
                        'Chuyển câu hỏi này thành bài đăng ẩn danh',
                        'Turn this into an anonymous post',
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {asking && (
            <div className="mb-4 flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </div>
          )}

          {error && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-2xs text-rose-700">{error}</p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
          className="border-t border-paper-300 p-3"
        >
          <div className="flex items-end gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t(
                'Ví dụ: Làm sao xin giấy xác nhận sinh viên?',
                'e.g. How do I get a student certificate?',
              )}
              className="field flex-1 text-xs"
              aria-label={t('Câu hỏi của bạn', 'Your question')}
            />
            <button
              type="submit"
              disabled={!input.trim() || asking}
              className="btn-primary shrink-0 px-3 py-2"
              aria-label={t('Gửi', 'Send')}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                <path d="M2 18 18 10 2 2l3.5 7L10 10l-4.5 1L2 18Z" />
              </svg>
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}

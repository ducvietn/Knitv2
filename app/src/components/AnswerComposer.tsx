import { useState } from 'react'
import { OFFICES } from '../data/mock'
import { useI18n } from '../lib/i18n'
import { postAnswer } from '../store/knit'

interface DraftSource {
  title: string
  url: string
}

/**
 * Ô soạn câu trả lời.
 *
 * Ba điều bắt buộc của KNIT được đặt ngay trong ô viết:
 * kèm nguồn chính thức, chỉ đường tới đầu mối khi chưa rõ,
 * và tách riêng "Trường hợp của mình khác".
 */
export function AnswerComposer({
  questionId,
  onPosted,
}: {
  questionId: string
  onPosted?: () => void
}) {
  const { t } = useI18n()

  const [body, setBody] = useState('')
  const [variantMode, setVariantMode] = useState(false)
  const [variantContext, setVariantContext] = useState('')
  const [sources, setSources] = useState<DraftSource[]>([])
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [referralOffice, setReferralOffice] = useState('')
  const [referralNote, setReferralNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const office = OFFICES.find((o) => o.vi === referralOffice)

  const addSource = () => {
    const url = sourceUrl.trim()
    if (!url) return
    if (!/^https:\/\//.test(url)) {
      setError(t('Đường dẫn nguồn phải bắt đầu bằng https://', 'Source URLs must start with https://'))
      return
    }
    setSources((prev) => [...prev, { title: sourceTitle.trim() || url, url }])
    setSourceTitle('')
    setSourceUrl('')
    setError(null)
  }

  const submit = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await postAnswer(questionId, {
        body: body.trim(),
        accepted: false,
        variant: variantMode
          ? {
              context: variantContext.trim() || t('Không nêu rõ', 'No context given'),
              contextEn: variantContext.trim() || t('Không nêu rõ', 'No context given'),
              anonymous: true,
            }
          : undefined,
        referral: office
          ? {
              office: office.vi,
              officeEn: office.en,
              note: referralNote.trim() || t('Chưa rõ — cần xác minh thêm với đầu mối.', 'Unclear — needs confirmation with this office.'),
              noteEn: referralNote.trim() || t('Chưa rõ — cần xác minh thêm với đầu mối.', 'Unclear — needs confirmation with this office.'),
            }
          : undefined,
        sources: sources.map((s) => ({ ...s, publisher: 'Cộng đồng ULIS' })),
      })
      setBody('')
      setVariantMode(false)
      setVariantContext('')
      setSources([])
      setReferralOffice('')
      setReferralNote('')
      onPosted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không thể đăng.', 'Could not post.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card mt-6 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">{t('Viết câu trả lời', 'Write an answer')}</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        {t(
          'Nếu câu trả lời dựa trên quy định của Trường, hãy kèm đường dẫn tới nguồn chính thức.',
          'If your answer relies on a university rule, link the official source.',
        )}
      </p>

      <div className="mt-3.5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={t('Chia sẻ điều bạn biết…', 'Share what you know…')}
          className="field resize-y"
          aria-label={t('Nội dung câu trả lời', 'Answer body')}
        />
      </div>

      {/* Nguồn chính thức */}
      <div className="mt-4 rounded-lg border border-paper-200 bg-paper-50 p-3">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">
          {t('Nguồn chính thức', 'Official sources')}
        </p>

        {sources.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {sources.map((s, i) => (
              <li
                key={s.url}
                className="flex items-start justify-between gap-2 rounded-md border border-paper-200 bg-white px-2.5 py-1.5"
              >
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 text-2xs text-brand-700 hover:underline"
                >
                  {s.title}
                </a>
                <button
                  type="button"
                  onClick={() => setSources((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 text-ink-faint transition hover:text-clay-600"
                  aria-label={t('Bỏ nguồn', 'Remove source')}
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                    <path d="M6.4 5 5 6.4 8.6 10 5 13.6 6.4 15 10 11.4 13.6 15 15 13.6 11.4 10 15 6.4 13.6 5 10 8.6 6.4 5Z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input
            value={sourceTitle}
            onChange={(e) => setSourceTitle(e.target.value)}
            placeholder={t('Tiêu đề nguồn', 'Source title')}
            className="field text-xs"
            aria-label={t('Tiêu đề nguồn', 'Source title')}
          />
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://ulis.vnu.edu.vn/..."
            className="field font-mono text-xs"
            aria-label={t('Đường dẫn nguồn', 'Source URL')}
          />
          <button type="button" onClick={addSource} className="btn-secondary px-3 text-xs">
            {t('Thêm', 'Add')}
          </button>
        </div>
      </div>

      {/* Đầu mối cần liên hệ */}
      <div className="mt-3 rounded-lg border border-paper-200 bg-paper-50 p-3">
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-faint">
          {t('Chưa rõ? Chỉ đường tới đầu mối', 'Unclear? Point to the right office')}
        </p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <select
            value={referralOffice}
            onChange={(e) => setReferralOffice(e.target.value)}
            className="field text-xs"
            aria-label={t('Đầu mối', 'Office')}
          >
            <option value="">{t('— Không chỉ định —', '— None —')}</option>
            {OFFICES.map((o) => (
              <option key={o.url} value={o.vi}>
                {o.vi}
              </option>
            ))}
          </select>
          <input
            value={referralNote}
            onChange={(e) => setReferralNote(e.target.value)}
            placeholder={t('Ghi chú cho người đọc', 'Note for readers')}
            className="field text-xs"
            aria-label={t('Ghi chú', 'Note')}
          />
        </div>
        {office && (
          <p className="mt-2 font-mono text-2xs text-ink-faint">
            {office.email} · {office.url.replace('https://', '')}
          </p>
        )}
      </div>

      {/* Trường hợp của mình khác */}
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-paper-200 bg-paper-50 px-3 py-2.5">
        <input
          type="checkbox"
          checked={variantMode}
          onChange={(e) => setVariantMode(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-paper-400 text-brand-700 focus:ring-brand-500"
        />
        <span className="min-w-0">
          <span className="block text-xs font-medium text-ink">
            {t('Trường hợp của mình khác', 'My case is different')}
          </span>
          <span className="mt-0.5 block text-2xs leading-relaxed text-ink-muted">
            {t(
              'Trường hợp của bạn khác với câu hỏi gốc. Câu trả lời sẽ nằm ở nhóm riêng.',
              'Your circumstances differ from the original question. Your answer goes in a separate group.',
            )}
          </span>
        </span>
      </label>

      {variantMode && (
        <div className="mt-3 animate-fade-up">
          <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-ink-faint">
            {t('Mô tả khác biệt của bạn', 'Describe how your case differs')}
          </label>
          <textarea
            value={variantContext}
            onChange={(e) => setVariantContext(e.target.value)}
            rows={2}
            placeholder={t(
              'Ví dụ: mình chuyển khoa giữa năm học nên hồ sơ không tự chuyển sang…',
              'e.g. I transferred faculty mid-year so my record did not carry over…',
            )}
            className="field resize-y"
          />
          <p className="mt-1.5 text-2xs text-ink-faint">
            {t(
              'Bạn có thể để ẩn danh — hoàn cảnh cá nhân sẽ không lộ tên.',
              'You may stay anonymous — your personal context stays unnamed.',
            )}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-2xs text-clay-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xs text-ink-faint">
          {t(
            'Câu trả lời về quy định của Trường phải có nguồn.',
            'Answers about university rules must cite a source.',
          )}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || busy}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? t('Đang đăng…', 'Posting…')
            : variantMode
              ? t('Đăng biến thể', 'Post variant')
              : t('Đăng câu trả lời', 'Post answer')}
        </button>
      </div>
    </section>
  )
}

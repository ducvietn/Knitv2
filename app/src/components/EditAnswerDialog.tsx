import { useEffect, useState } from 'react'
import { OFFICES } from '../data/mock'
import { useI18n } from '../lib/i18n'
import { updateAnswer } from '../store/knit'
import { Modal } from './Modal'
import type { Answer } from '../data/types'

/**
 * Hộp thoại sửa câu trả lời.
 *
 * Giữ nguyên ba ràng buộc của KNIT khi sửa: nội dung phải đủ dài,
 * nguồn chính thức phải là đường dẫn https://, và đầu mối cần liên hệ
 * vẫn chỉ được chọn trong danh sách phòng ban thật của Trường.
 */
export function EditAnswerDialog({
  answer,
  open,
  onClose,
}: {
  answer: Answer
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()

  const [body, setBody] = useState(answer.body)
  const [sources, setSources] = useState(answer.sources.map((s) => ({ ...s })))
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [referralOffice, setReferralOffice] = useState(answer.referral?.office ?? '')
  const [referralNote, setReferralNote] = useState(answer.referral?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setBody(answer.body)
    setSources(answer.sources.map((s) => ({ ...s })))
    setReferralOffice(answer.referral?.office ?? '')
    setReferralNote(answer.referral?.note ?? '')
    setSourceTitle('')
    setSourceUrl('')
    setError(null)
  }, [open, answer])

  const office = OFFICES.find((o) => o.vi === referralOffice)

  const addSource = () => {
    const url = sourceUrl.trim()
    if (!url) return
    if (!/^https:\/\//.test(url)) {
      setError(
        t('Đường dẫn nguồn phải bắt đầu bằng https://', 'Source URLs must start with https://'),
      )
      return
    }
    setSources((prev) => [
      ...prev,
      { title: sourceTitle.trim() || url, url, publisher: 'Cộng đồng ULIS' },
    ])
    setSourceTitle('')
    setSourceUrl('')
    setError(null)
  }

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await updateAnswer(answer.id, {
        body: body.trim(),
        sources: sources.map((s) => ({
          title: s.title,
          url: s.url,
          publisher: s.publisher || 'Cộng đồng ULIS',
        })),
        referral: office
          ? {
              office: office.vi,
              officeEn: office.en,
              note: referralNote.trim(),
              noteEn: referralNote.trim(),
            }
          : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Không lưu được.', 'Could not save.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Sửa câu trả lời', 'Edit answer')}
      description={t(
        'Cập nhật nội dung và nguồn chính thức nếu thông tin đã thay đổi.',
        'Update the content and official sources if the information changed.',
      )}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('Huỷ', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || body.trim().length < 10}
            className="btn-primary disabled:opacity-60"
          >
            {busy ? t('Đang lưu…', 'Saving…') : t('Lưu thay đổi', 'Save changes')}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink">
          {t('Nội dung câu trả lời', 'Answer body')}
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="field resize-y"
        />
      </label>

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
          {t('Đầu mối cần liên hệ', 'Referral office')}
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
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-2xs text-clay-700">
          {error}
        </p>
      )}
    </Modal>
  )
}

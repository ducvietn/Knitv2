import { useEffect, useState } from 'react'
import { TOPICS } from '../data/topics'
import { useI18n } from '../lib/i18n'
import { updateQuestion } from '../store/knit'
import { Modal } from './Modal'
import type { Question, Topic } from '../data/types'

/**
 * Hộp thoại sửa câu hỏi của chính mình (hoặc cán bộ kiểm duyệt).
 *
 * Giữ nguyên nguyên tắc "một câu hỏi, một câu trả lời tốt nhất": sửa câu hỏi
 * không xoá các câu trả lời đã có, và có ghi chú nhắc người dùng cập nhật nếu
 * nội dung thay đổi đáng kể.
 */
export function EditQuestionDialog({
  question,
  open,
  onClose,
}: {
  question: Question
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()

  const [title, setTitle] = useState(question.title)
  const [body, setBody] = useState(question.body)
  const [topic, setTopic] = useState<Topic>(question.topic)
  const [tags, setTags] = useState(question.tags.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(question.title)
    setBody(question.body)
    setTopic(question.topic)
    setTags(question.tags.join(', '))
    setError(null)
  }, [open, question])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await updateQuestion(question.id, {
        title: title.trim(),
        body: body.trim(),
        topic,
        tags: tags
          .split(',')
          .map((x) => x.trim().replace(/^#/, ''))
          .filter(Boolean)
          .slice(0, 8),
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
      title={t('Sửa câu hỏi', 'Edit question')}
      description={t(
        'Chỉnh lại câu hỏi cho đúng ý. Nếu thông tin đã thay đổi, hãy để lại ghi chú để người trả lời cập nhật.',
        'Refine the question. If facts changed, leave a note so answerers can update.',
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
            disabled={busy || title.trim().length < 8 || body.trim().length < 10}
            className="btn-primary disabled:opacity-60"
          >
            {busy ? t('Đang lưu…', 'Saving…') : t('Lưu thay đổi', 'Save changes')}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-ink">
          {t('Tiêu đề', 'Title')}
        </span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
      </label>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold text-ink">
          {t('Nội dung', 'Body')}
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="field resize-y"
        />
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink">
            {t('Chủ đề', 'Topic')}
          </span>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value as Topic)}
            className="field"
          >
            {TOPICS.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.labelVi}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink">
            {t('Thẻ', 'Tags')}
          </span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t('hoc-phi, thu-tuc', 'hoc-phi, thu-tuc')}
            className="field"
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-clay-200 bg-clay-50 px-3 py-2 text-2xs text-clay-700">
          {error}
        </p>
      )}
    </Modal>
  )
}

/**
 * Dịch tự động nội dung tiếng Việt sang tiếng Anh bằng OpenAI Codex API.
 *
 * Vì sao cần module này?
 *
 * KNIT lưu mỗi câu hỏi/câu trả lời ở hai cột: `title`/`title_en`,
 * `body`/`body_en`. Khi người dùng bấm nút "EN", web hiển thị bản `_en`.
 * Trước đây bản `_en` chỉ có ở dữ liệu mẫu — câu hỏi mới do người dùng
 * đăng sẽ có `title_en = title` (tức vẫn là tiếng Việt), nên bấm "EN" vẫn
 * thấy tiếng Việt.
 *
 * Module này gọi Codex API để dịch phần tiếng Việt đó.
 *
 * Nguyên tắc thiết kế:
 *
 * 1. **Không chặn request.** Dịch chạy nền sau khi response đã trả về cho
 *    client — người dùng không phải chờ. Lần tải trang sau sẽ thấy bản dịch.
 * 2. **Không chặn app.** Lỗi dịch không được làm sập server; mọi lỗi được
 *    nuốt và ghi log.
 * 3. **Tiết kiệm token.** Gộp nhiều đoạn vào một lần gọi API, yêu cầu
 *    model trả về JSON để parse được.
 * 4. **Có thể tắt.** Không có `OPENAI_API_KEY` thì module tự bỏ qua.
 */
import { sql } from './db'

/**
 * Model Codex dùng để dịch.
 *
 * `gpt-5.6-terra` là model "everyday agent workflows" — hợp với dịch thuật
 * hơn là các model reasoning nặng (đắt và chậm hơn, không cần thiết cho
 * việc dịch câu hỏi của sinh viên).
 */
const MODEL = process.env.KNIT_TRANSLATE_MODEL ?? 'gpt-5.6-terra'

/**
 * Base URL của provider.
 *
 * Mặc định là OpenAI trực tiếp. Khi dùng provider trung gian (OpenAI
 * compatible) thì đặt `KNIT_TRANSLATE_BASE_URL`, ví dụ
 * `https://modelapi.vn/v1`.
 */
const BASE_URL = (
  process.env.KNIT_TRANSLATE_BASE_URL ?? 'https://api.openai.com/v1'
).replace(/\/+$/, '')

/** Cổng chờ tối đa cho một lần gọi API (ms). */
const TIMEOUT_MS = Number(process.env.KNIT_TRANSLATE_TIMEOUT_MS ?? 45_000)

export const translateEnabled = Boolean(process.env.OPENAI_API_KEY)

/** Một đoạn cần dịch, kèm nhãn để model trả về đúng thứ tự. */
export interface Segment {
  /** Khóa định danh, ví dụ `title`, `body`. */
  key: string
  /** Nội dung tiếng Việt cần dịch. */
  text: string
}

export interface TranslationResult {
  key: string
  text: string
}

/**
 * Schema JSON mà model phải tuân theo.
 *
 * Dùng `response_format: json_schema` + `strict: true` để output luôn
 * parse được — không cần regex hay `eval`.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['key', 'text'],
      },
    },
  },
  required: ['translations'],
} as const

const SYSTEM_PROMPT =
  'Bạn là công cụ dịch thuật cho sinh viên Đại học Quốc gia TP.HCM (ULIS). ' +
  'Dịch tiếng Việt sang tiếng Anh tự nhiên, rõ ràng, đúng thuật ngữ hành chính và học thuật. ' +
  'Giữ nguyên tên riêng (cá nhân, trường, khoa, môn học), số, đơn vị đo và URL. ' +
  'Không thêm bớt ý, không bình luận. ' +
  'Trả về đúng số phần tử đầu vào, cùng thứ tự, mỗi phần tử có "key" và "text".'

/**
 * Gọi API để dịch nhiều đoạn.
 *
 * Dùng `/chat/completions` với `response_format: json_schema` — hoạt động
 * với cả OpenAI trực tiếp lẫn các provider OpenAI-compatible.
 */
async function callTranslateApi(segments: Segment[]): Promise<TranslationResult[]> {
  const apiKey = process.env.OPENAI_API_KEY!

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          segments: segments.map((s) => ({ key: s.key, text: s.text })),
        }),
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'translations', strict: true, schema: RESPONSE_SCHEMA },
    },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Codex API ${response.status}: ${detail.slice(0, 300)}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const raw = data.choices?.[0]?.message?.content
    if (!raw) throw new Error('Codex API không trả về nội dung.')

    const parsed = JSON.parse(raw) as { translations?: TranslationResult[] }
    const list = parsed.translations
    if (!Array.isArray(list)) throw new Error('Codex API trả về JSON không đúng cấu trúc.')
    return list
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Dịch các đoạn văn và trả về map `key -> text đã dịch`.
 *
 * Trả về map rỗng nếu dịch thất bại — caller không nên fail vì lý do dịch.
 */
export async function translateSegments(segments: Segment[]): Promise<Record<string, string>> {
  if (!translateEnabled || segments.length === 0) return {}

  try {
    const results = await callTranslateApi(segments)
    const map: Record<string, string> = {}
    for (const r of results) {
      if (r && typeof r.key === 'string' && typeof r.text === 'string' && r.text.trim()) {
        map[r.key] = r.text.trim()
      }
    }
    return map
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[knit-translate] dịch thất bại:', message)
    return {}
  }
}

/**
 * Dịch câu hỏi và cập nhật `title_en`, `body_en`.
 *
 * Chạy nền — không `await` từ route. Gọi lỗi cũng không ném ra ngoài.
 */
export function translateQuestionInBackground(questionId: string): void {
  if (!translateEnabled) return

  void (async () => {
    try {
      const rows = await sql
        .prepare('SELECT id, title, title_en, body, body_en FROM questions WHERE id = ?')
        .all<{ id: string; title: string; title_en: string; body: string; body_en: string }>(
          questionId,
        )

      const row = rows[0]
      if (!row) return

      // Đã có bản dịch khác tiếng Việt thì không cần dịch lại.
      const titleEn = row.title_en
      const bodyEn = row.body_en
      const needsTitle = !titleEn || titleEn === row.title
      const needsBody = !bodyEn || bodyEn === row.body
      if (!needsTitle && !needsBody) return

      const segments: Segment[] = []
      if (needsTitle) segments.push({ key: 'title', text: row.title })
      if (needsBody) segments.push({ key: 'body', text: row.body })

      const map = await translateSegments(segments)
      if (Object.keys(map).length === 0) return

      await sql
        .prepare(
          `UPDATE questions
             SET title_en = CASE WHEN ? = 1 THEN ? ELSE title_en END,
                 body_en  = CASE WHEN ? = 1 THEN ? ELSE body_en END
           WHERE id = ?`,
        )
        .run(needsTitle ? 1 : 0, map.title ?? titleEn, needsBody ? 1 : 0, map.body ?? bodyEn, row.id)

      console.log(`[knit-translate] đã dịch câu hỏi ${row.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[knit-translate] lỗi khi dịch câu hỏi:', message)
    }
  })()
}

/**
 * Dịch câu trả lời và cập nhật `body_en` (kèm phần biến thể và chuyển văn
 * phòng nếu có).
 *
 * Chạy nền — không `await` từ route.
 */
export function translateAnswerInBackground(answerId: string): void {
  if (!translateEnabled) return

  void (async () => {
    try {
      const rows = await sql
        .prepare(
          `SELECT id, body, body_en, variant_context, variant_context_en,
                  referral_office, referral_office_en, referral_note, referral_note_en
             FROM answers WHERE id = ?`,
        )
        .all<{
          id: string
          body: string
          body_en: string
          variant_context: string | null
          variant_context_en: string | null
          referral_office: string | null
          referral_office_en: string | null
          referral_note: string | null
          referral_note_en: string | null
        }>(answerId)

      const row = rows[0]
      if (!row) return

      const segments: Segment[] = []
      const needBody = !row.body_en || row.body_en === row.body
      if (needBody) segments.push({ key: 'body', text: row.body })

      const needVariant =
        row.variant_context != null &&
        (!row.variant_context_en || row.variant_context_en === row.variant_context)
      if (needVariant) {
        segments.push({ key: 'variant_context', text: row.variant_context ?? '' })
      }

      const needOffice =
        row.referral_office != null &&
        (!row.referral_office_en || row.referral_office_en === row.referral_office)
      if (needOffice) {
        segments.push({ key: 'referral_office', text: row.referral_office ?? '' })
      }

      const needNote =
        row.referral_note != null &&
        (!row.referral_note_en || row.referral_note_en === row.referral_note)
      if (needNote) {
        segments.push({ key: 'referral_note', text: row.referral_note ?? '' })
      }

      if (segments.length === 0) return

      const map = await translateSegments(segments)
      if (Object.keys(map).length === 0) return

      await sql
        .prepare(
          `UPDATE answers
             SET body_en             = CASE WHEN ? = 1 THEN ? ELSE body_en END,
                 variant_context_en  = CASE WHEN ? = 1 THEN ? ELSE variant_context_en END,
                 referral_office_en  = CASE WHEN ? = 1 THEN ? ELSE referral_office_en END,
                 referral_note_en    = CASE WHEN ? = 1 THEN ? ELSE referral_note_en END
           WHERE id = ?`,
        )
        .run(
          needBody ? 1 : 0,
          map.body ?? row.body_en ?? row.body,
          needVariant ? 1 : 0,
          map.variant_context ?? row.variant_context_en ?? row.variant_context,
          needOffice ? 1 : 0,
          map.referral_office ?? row.referral_office_en ?? row.referral_office,
          needNote ? 1 : 0,
          map.referral_note ?? row.referral_note_en ?? row.referral_note,
          row.id,
        )

      console.log(`[knit-translate] đã dịch câu trả lời ${row.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[knit-translate] lỗi khi dịch câu trả lời:', message)
    }
  })()
}

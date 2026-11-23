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
 * 1. **Không chặn request.** Bản dịch được tạo ở chế độ nền sau khi câu hỏi
 *    hoặc câu trả lời mới được đăng — người dùng không phải chờ.
 * 2. **Có thể dịch tức thì.** Khi người dùng bấm "EN" mà bản dịch chưa sẵn
 *    sàng, web gọi endpoint dịch on-demand để lấy bản dịch ngay, không cần
 *    tải lại trang.
 * 3. **Không chặn app.** Lỗi dịch không được làm sập server; mọi lỗi được
 *    nuốt và ghi log.
 * 4. **Nhanh.** Gọi song song thay vì tuần tự — đo thực tế trên provider:
 *    12 đoạn mất 18.5s nếu gộp 1 lần, nhưng chỉ 5.6s nếu chia 6 request
 *    chạy song song.
 * 5. **Có thể tắt.** Không có `OPENAI_API_KEY` thì module tự bỏ qua.
 */
import { sql } from './db'
import { callLlmJsonParallel, llmEnabled } from './llm'

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

/**
 * Số đoạn tối đa trong một lần gọi API.
 *
 * Provider xử lý prompt càng dài càng chậm theo chiều số token output —
 * 12 đoạn trong một lần gọi mất 18.5s, nhưng 12 đoạn chia 6 lần gọi song
 * song chỉ mất 5.6s. Vì vậy ta CHIA NHỎ thay vì gộp tất cả.
 */
const MAX_SEGMENTS_PER_CALL = 2

/**
 * Số lần gọi API chạy song song tối đa.
 *
 * Tăng lên sẽ giảm thời gian chờ nhưng tăng rủi ro bị provider giới hạn
 * tốc độ (429).
 */
const MAX_PARALLEL_CALLS = 6

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
 * Dịch một nhóm đoạn bằng MỘT lần gọi API.
 *
 * Trả về map `key -> text đã dịch`.
 */
async function translateChunk(segments: Segment[]): Promise<Record<string, string>> {
  const result = await callLlmJsonParallel([
    {
      name: 'translations',
      schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      system: SYSTEM_PROMPT,
      user: JSON.stringify({ segments: segments.map((s) => ({ key: s.key, text: s.text })) }),
    },
  ])

  const payload = result[0]?.data as { translations?: TranslationResult[] } | undefined
  const map: Record<string, string> = {}
  for (const r of payload?.translations ?? []) {
    if (r && typeof r.key === 'string' && typeof r.text === 'string' && r.text.trim()) {
      map[r.key] = r.text.trim()
    }
  }
  return map
}

/**
 * Dịch các đoạn văn và trả về map `key -> text đã dịch`.
 *
 * Các đoạn được CHIA NHỎ và gọi SONG SONG — đây là điểm mấu chốt để dịch
 * nhanh. Đo thực tế trên provider:
 *
 * - 1 lần gọi / 12 đoạn: 18.5s
 * - 6 lần gọi song song / 12 đoạn: 5.6s
 *
 * Trả về map rỗng nếu dịch thất bại — caller không nên fail vì lý do dịch.
 */
export async function translateSegments(segments: Segment[]): Promise<Record<string, string>> {
  if (!translateEnabled || segments.length === 0) return {}

  try {
    // Chia nhỏ thành nhiều nhóm, mỗi nhóm gọi song song.
    const chunks: Segment[][] = []
    for (let i = 0; i < segments.length; i += MAX_SEGMENTS_PER_CALL) {
      chunks.push(segments.slice(i, i + MAX_SEGMENTS_PER_CALL))
    }

    // Giới hạn số request chạy đồng thời để không bị provider giới hạn tốc độ.
    const maps: Record<string, string>[] = []
    for (let i = 0; i < chunks.length; i += MAX_PARALLEL_CALLS) {
      const batch = chunks.slice(i, i + MAX_PARALLEL_CALLS)
      const results = await Promise.all(batch.map((chunk) => translateChunk(chunk)))
      maps.push(...results)
    }

    return Object.assign({}, ...maps) as Record<string, string>
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[knit-translate] dịch thất bại:', message)
    return {}
  }
}

/**
 * Dịch một câu hỏi và cập nhật `title_en`, `body_en`.
 *
 * Đồng bộ — trả về sau khi ghi xong database. Dùng cho endpoint dịch
 * on-demand (web gọi khi người dùng bấm "EN").
 *
 * Trả về `true` nếu có cập nhật, `false` nếu không cần dịch (đã có bản
 * dịch) hoặc dịch thất bại.
 */
export async function translateQuestionNow(questionId: string): Promise<boolean> {
  const rows = await sql
    .prepare('SELECT id, title, title_en, body, body_en FROM questions WHERE id = ?')
    .all<{ id: string; title: string; title_en: string; body: string; body_en: string }>(questionId)

  const row = rows[0]
  if (!row) return false

  // Đã có bản dịch khác tiếng Việt thì không cần dịch lại.
  const titleEn = row.title_en
  const bodyEn = row.body_en
  const needsTitle = !titleEn || titleEn === row.title
  const needsBody = !bodyEn || bodyEn === row.body
  if (!needsTitle && !needsBody) return false

  const segments: Segment[] = []
  if (needsTitle) segments.push({ key: 'title', text: row.title })
  if (needsBody) segments.push({ key: 'body', text: row.body })

  const map = await translateSegments(segments)
  if (Object.keys(map).length === 0) return false

  await sql
    .prepare(
      `UPDATE questions
         SET title_en = CASE WHEN ? = 1 THEN ? ELSE title_en END,
             body_en  = CASE WHEN ? = 1 THEN ? ELSE body_en END
       WHERE id = ?`,
    )
    .run(needsTitle ? 1 : 0, map.title ?? titleEn, needsBody ? 1 : 0, map.body ?? bodyEn, row.id)

  console.log(`[knit-translate] đã dịch câu hỏi ${row.id}`)
  return true
}

/**
 * Dịch một câu trả lời và cập nhật `body_en` (kèm phần biến thể và chuyển
 * văn phòng nếu có).
 *
 * Đồng bộ — trả về sau khi ghi xong database.
 */
export async function translateAnswerNow(answerId: string): Promise<boolean> {
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
  if (!row) return false

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

  if (segments.length === 0) return false

  const map = await translateSegments(segments)
  if (Object.keys(map).length === 0) return false

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
  return true
}

/**
 * Dịch câu hỏi ở chế độ nền — không chặn request.
 *
 * Dùng sau khi người dùng đăng câu hỏi mới. Lỗi không ném ra ngoài.
 */
export function translateQuestionInBackground(questionId: string): void {
  if (!translateEnabled) return

  void translateQuestionNow(questionId).catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[knit-translate] lỗi khi dịch câu hỏi:', message)
  })
}

/**
 * Dịch câu trả lời ở chế độ nền — không chặn request.
 *
 * Dùng sau khi người dùng đăng câu trả lời mới. Lỗi không ném ra ngoài.
 */
export function translateAnswerInBackground(answerId: string): void {
  if (!translateEnabled) return

  void translateAnswerNow(answerId).catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[knit-translate] lỗi khi dịch câu trả lời:', message)
  })
}

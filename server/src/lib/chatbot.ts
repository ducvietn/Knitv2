import { callLlmJson } from './llm'
import { retrieveContext, type RagHit } from './rag'

/**
 * Chatbot điều hướng của KNIT.
 *
 * Triết lý — vì sao KHÔNG phải chatbot trả lời mọi thứ:
 *
 * Mục tiêu cốt lõi của KNIT là "phát huy tinh thần hỗ trợ giữa các thế hệ
 * sinh viên". Nếu bot trả lời tường tận mọi thứ, tân sinh viên sẽ chỉ
 * chat với bot rồi thoát — biến diễn đàn thành một web tra cứu khô khan,
 * mất đi tính kết nối giữa sinh viên năm nhất và anh chị khóa trên.
 *
 * Vì vậy bot làm ba việc, đúng theo luồng bạn mô tả:
 *
 * 1. **Tóm tắt ngắn từ RAG** — tìm trong database KNIT và trả lời ngắn
 *    gọn quy trình vài bước. Bot KHÔNG bịa: chỉ được dùng nguyên văn thứ
 *    có trong diễn đàn.
 * 2. **Điều hướng về cộng đồng** — trả về kèm các thẻ bài viết gốc liên
 *    quan, kèm thông tin người đã trả lời, để sinh viên đọc và hỏi tiếp.
 * 3. **Kích thích tương tác** — khi bot thấy trường hợp của người dùng có
 *    điểm khác biệt, bot đề xuất chuyển thành bài đăng ẩn danh, tự điền
 *    sẵn nội dung vào form.
 *
 * Bot KHÔNG bao giờ trả lời thay cộng đồng. Nếu không tìm thấy gì liên
 * quan, bot nói thẳng và đẩy sang bước 3.
 *
 * ---
 *
 * Về tốc độ — vì sao có hai bước:
 *
 * Provider `modelapi.vn` cần ~6 giây cho một lần gọi model. Nếu chờ trọn
 * 6 giây rồi mới hiện gì cả, người dùng tưởng bot treo.
 *
 * Nên bot làm hai bước:
 *
 * - **Bước 1 (tức thì, ~100ms)**: RAG tìm được bài viết liên quan → trả về
 *   ngay kèm thẻ nguồn. Người dùng đã có thể đọc và điều hướng.
 * - **Bước 2 (nền)**: model viết bản tóm tắt và viết lại câu hỏi → web gọi
 *   lại endpoint sau vài giây để nhận bản đầy đủ.
 *
 * Nhờ vậy người dùng luôn thấy phản hồi trong ~100ms.
 */

/** Kết quả một lượt chat. */
export interface ChatReply {
  /** Câu trả lời ngắn gọn cho người dùng. */
  answer: string
  /** Các bài viết gốc liên quan — để dẫn người dùng vào cộng đồng. */
  sources: RagHit[]
  /**
   * Nên đề xuất chuyển thành bài đăng không.
   *
   * `true` khi bot không tìm thấy câu trả lời chắc chắn, hoặc người dùng
   * nói trường hợp của họ khác.
   */
  suggestPost: boolean
  /** Gợi ý tiêu đề cho bài đăng. */
  suggestedTitle: string
  /** Gợi ý nội dung cho bài đăng. */
  suggestedBody: string
  /** Có nên gợi ý bài đăng ẩn danh không (trường hợp nhạy cảm). */
  suggestAnonymous: boolean
  /**
   * Câu trả lời đã sẵn sàng chưa.
   *
   * Khi `false`, web sẽ gọi lại endpoint sau vài giây để lấy bản trả lời
   * đầy đủ do model viết.
   */
  ready: boolean
}

/** Schema JSON cho câu trả lời của bot. */
const CHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    suggestPost: { type: 'boolean' },
    suggestedTitle: { type: 'string' },
    suggestedBody: { type: 'string' },
    suggestAnonymous: { type: 'boolean' },
  },
  required: ['answer', 'suggestPost', 'suggestedTitle', 'suggestedBody', 'suggestAnonymous'],
} as const

const SYSTEM_PROMPT = `Bạn là trợ lý điều hướng của diễn đàn KNIT (Đại học Quốc gia TP.HCM, khoa Ngôn ngữ).

Bạn KHÔNG phải chatbot trả lời mọi thứ. Mục tiêu của bạn là dẫn sinh viên đến câu trả lời của chính cộng đồng KNIT.

Nguyên tắc:
1. Chỉ dùng thông tin trong phần "NGỮ CẢNH TỪ DIỄN ĐÀN". Không bịa quy trình, không bịa tên phòng ban, không bịa mốc thời gian, không bịa số điện thoại hay địa chỉ.
2. Nếu phần ngữ cảnh ghi "(trống)" — diễn đàn chưa có gì về chủ đề này — hãy nói thẳng điều đó và mời sinh viên đăng câu hỏi. TUYỆT ĐỐI không tự đưa ra quy trình khi không có nguồn.
3. Trả lời NGẮN GỌN — tối đa 3 câu, theo kiểu quy trình vài bước nếu có. Người dùng đọc nhanh trên điện thoại.
4. Nếu ngữ cảnh không đủ để trả lời chắc chắn, nói rõ điều chưa rõ và gợi ý hỏi cộng đồng.
5. Nếu người dùng nói trường hợp của họ khác với các bài đã có, đặt suggestPost = true.
6. Nếu không có ngữ cảnh nào liên quan, đặt suggestPost = true.
7. suggestedTitle là câu hỏi của người dùng đã viết lại cho tốt — ngắn gọn, đúng kiểu một câu hỏi cụ thể trên diễn đàn.
8. suggestedBody phải là nội dung sẽ đăng lên diễn đàn — viết lại câu hỏi của người dùng cho rõ ràng, có đủ ngữ cảnh để anh chị khóa trên trả lời được. Không thêm thông tin bạn không biết.
9. suggestAnonymous = true nếu câu hỏi liên quan đến việc cá nhân nhạy cảm (giấy tờ, sức khỏe, tài chính cá nhân, hoàn đổi quân sự, hồ sơ cá nhân).
10. Viết bằng tiếng Việt, giọng thân thiện như một sinh viên năm nhất đang hỏi bạn — không lạnh lùng như chatbot công nghiệp.`

/** Nội dung một lượt chat của người dùng. */
export interface ChatTurn {
  /** Người dùng hỏi gì. */
  question: string
  /** Ngôn ngữ đang dùng. */
  lang: 'vi' | 'en'
}

/**
 * Cache câu trả lời theo câu hỏi.
 *
 * Cùng một câu hỏi thường được hỏi lại (người dùng đổi tab rồi quay lại,
 * hoặc vài người hỏi chung một thủ tục) — cache giúp không phải gọi model
 * lần nữa, vừa nhanh hơn vừa tiết kiệm token.
 */
const cache = new Map<string, ChatReply>()

/** Số câu trả lời giữ trong cache. */
const CACHE_LIMIT = 100

/** Đọc cache (có tính thời hạn). */
const readCache = (key: string): ChatReply | undefined => {
  const hit = cache.get(key)
  if (!hit) return undefined
  return hit
}

/** Ghi vào cache, giới hạn số phần tử. */
const writeCache = (key: string, reply: ChatReply): void => {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, reply)
}

/** Khoá cache theo câu hỏi + ngôn ngữ. */
const cacheKey = (turn: ChatTurn): string => `${turn.lang}:${turn.question.trim().toLowerCase()}`

/**
 * Trả lời một câu hỏi của sinh viên.
 *
 * @param waitForModel khi `true`, chờ model viết xong rồi mới trả về.
 *   Dùng cho lần gọi thứ hai (web gọi lại sau khi nhận bản tức thì).
 */
export const chat = async (
  turn: ChatTurn,
  waitForModel = false,
): Promise<ChatReply> => {
  const key = cacheKey(turn)
  const cached = readCache(key)

  // Đã có câu trả lời đầy đủ → trả ngay, không gọi model.
  if (cached?.ready) return cached

  const hits = await retrieveContext(turn.question, 6)

  /**
   * Bước 1 — phản hồi tức thì từ RAG.
   *
   * Nếu không cần chờ model, trả ngay kèm thẻ bài viết gốc. Người dùng
   * thấy phản hồi trong ~100ms thay vì phải chờ 6 giây.
   */
  if (!waitForModel) {
    const quick: ChatReply = {
      answer:
        turn.lang === 'en'
          ? 'Searching the community…'
          : 'Mình đang tìm trong cộng đồng…',
      sources: hits,
      suggestPost: hits.length === 0,
      suggestedTitle: turn.question,
      suggestedBody: turn.question,
      suggestAnonymous: false,
      ready: false,
    }

    /**
     * Gọi model ở nền để chuẩn bị câu trả lời đầy đủ. Lỗi không ném ra
     * ngoài — web sẽ gọi lại và nhận bản dự phòng.
     */
    void buildFullReply(turn, hits).then((full) => {
      writeCache(key, full)
    })

    return quick
  }

  /**
   * Bước 2 — câu trả lời đầy đủ do model viết.
   *
   * Nếu lần gọi trước đã lưu cache thì dùng luôn, không gọi model nữa.
   */
  const full = await buildFullReply(turn, hits)
  writeCache(key, full)
  return full
}

/**
 * Viết câu trả lời đầy đủ: model tóm tắt ngữ cảnh và viết lại câu hỏi.
 */
const buildFullReply = async (
  turn: ChatTurn,
  hits: RagHit[],
): Promise<ChatReply> => {
  const context = hits
    .map((hit, index) => {
      const author = hit.authorVerified
        ? `${hit.authorName} - ${hit.authorCohort} (tick xanh CTV)`
        : `${hit.authorName} - ${hit.authorCohort}`
      return [
        `Nguồn ${index + 1}:`,
        `  Câu hỏi: ${hit.title}`,
        `  Trích: ${hit.snippet}`,
        `  Người viết: ${author}`,
        hit.accepted ? '  (câu trả lời được đánh dấu giải quyết)' : '',
        hit.helpful > 0 ? `  (${hit.helpful} người thấy hữu ích)` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  const contextBlock = hits.length
    ? `NGỮ CẢNH TỪ DIỄN ĐÀN:\n${context}`
    : 'NGỮ CẢNH TỪ DIỄN ĐÀN: (trống — diễn đàn chưa có bài nào liên quan)'

  const result = await callLlmJson({
    name: 'chat_reply',
    schema: CHAT_SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM_PROMPT,
    user: `Câu hỏi của sinh viên: ${turn.question}\n\n${contextBlock}`,
  })

  const payload = result?.data as
    | {
        answer?: string
        suggestPost?: boolean
        suggestedTitle?: string
        suggestedBody?: string
        suggestAnonymous?: boolean
      }
    | undefined

  if (!payload?.answer) {
    /**
     * Model lỗi — vẫn phải trả về thẻ bài viết gốc để người dùng tự đọc,
     * và vẫn gợi ý đăng bài nếu không có ngữ cảnh nào.
     */
    return {
      answer:
        hits.length === 0
          ? turn.lang === 'en'
            ? 'I could not find anything in the community about this yet. It looks like a good question to post — the seniors may know the exact procedure.'
            : 'Mình chưa tìm thấy nội dung nào liên quan trong cộng đồng. Đây có vẻ là câu hỏi nên đăng lên diễn đàn — các anh chị khóa trên chắc là biết quy trình chính xác.'
          : turn.lang === 'en'
            ? 'I found a few related threads below. Have a look — and if your situation differs, consider posting it so the community can help.'
            : 'Mình tìm được vài bài liên quan bên dưới. Bạn đọc tham khảo nhé — nếu trường hợp của bạn khác, cứ đăng câu hỏi để mọi người giúp.',
      sources: hits,
      suggestPost: hits.length === 0,
      suggestedTitle: turn.question,
      suggestedBody: turn.question,
      suggestAnonymous: false,
      ready: true,
    }
  }

  return {
    answer: payload.answer,
    sources: hits,
    suggestPost: payload.suggestPost ?? hits.length === 0,
    suggestedTitle: payload.suggestedTitle || turn.question,
    suggestedBody: payload.suggestedBody || turn.question,
    suggestAnonymous: payload.suggestAnonymous ?? false,
    ready: true,
  }
}

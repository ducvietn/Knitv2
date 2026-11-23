import { callLlmJson } from './llm'
import { retrieveCandidates, type RagHit } from './rag'
import { normaliseIntent, type NormalisedIntent } from './intent'
import { buildWebContext, searchWeb, webSearchEnabled, type WebResult } from './web-search'

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
 * Kiến trúc 3 tầng — vì sao bot "khôn" hơn hẳn tìm kiếm thông thường:
 *
 * ```
 * Câu hỏi sinh viên (VI có dấu / VI không dấu / EN)
 *        │
 *        ▼
 * [Tầng 1] Chuẩn hoá ý định & tách khái niệm  (lib/intent.ts)
 *        │      → "học lại, tín học phí tín chỉ, quy chế điểm F"
 *        │      → keywords: ["học lại", "hoc lai", "retake", "tuition", ...]
 *        ▼
 * [Tầng 2] Quét rộng ứng viên (20 bài) + LLM re-rank
 *        │      (lib/rag.ts → lib/chatbot.ts)
 *        │      → model loại nhiễu: "học lại do trượt môn" ≠ "cải thiện điểm C"
 *        ▼
 * [Tầng 3] Tổng hợp & đối chiếu đa nguồn  (lib/web-search.ts)
 *        │      → nếu độ tin cậy thấp: tra ulis.vnu.edu.vn lấy quy chế gốc
 *        ▼
 *   Câu trả lời + thẻ nguồn + nút "chuyển thành bài đăng ẩn danh"
 * ```
 *
 * Không cần API embedding ngoài: Tầng 1 thay thế embedding (mở rộng
 * truy vấn), Tầng 2 thay thế vector search (LLM re-rank), Tầng 3 bổ sung
 * nguồn chính thức.
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

/**
 * Schema cho bước re-rank (Tầng 2).
 *
 * Model đọc danh sách ứng viên rồi trả về danh sách id thực sự liên
 * quan — đây là lớp "hiểu ngữ nghĩa" thay cho việc so khớp từ khoá thuần.
 */
const RERANK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    relevantIds: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['relevantIds', 'confidence', 'reason'],
} as const

const RERANK_SYSTEM = `Bạn là bộ lọc nguồn cho trợ lý điều hướng của diễn đàn KNIT (Đại học Quốc gia TP.HCM, khoa Ngôn ngữ).

Nhiệm vụ: đọc câu hỏi của sinh viên và danh sách bài viết ứng viên, chọn ra NHỮNG BÀI THỰC SỰ LIÊN QUAN.

Quy tắc:
1. Hiểu ý nghĩa câu hỏi, không so khớp từ khoá máy móc. "Lấy mã sinh viên ở đâu" và "Làm thẻ sinh viên ở đâu" là CÙNG một việc. "Where do I get a student ID?" cũng vậy.
2. Câu hỏi có thể viết không dấu, có dấu, hoặc tiếng Anh — cả ba đều là cùng một ý.
3. Chọn bài nào thực sự giúp trả lời câu hỏi. Bài chỉ trùng từ khoá mà khác HOÀN CẢNH thì KHÔNG chọn. Ví dụ: "học lại do trượt môn" khác "học cải thiện điểm C" — câu hỏi về trượt môn thì chỉ chọn bài về trượt môn.
4. Nếu không bài nào phù hợp, trả về mảng rỗng.
5. Trả về tối đa 4 id, theo thứ tự mức độ liên quan giảm dần. Chỉ trả về id có trong danh sách đưa cho bạn.
6. confidence là mức tự tin 0-1 về việc các bài đã chọn thực sự giải quyết câu hỏi. Nếu dưới 0.5 thì hệ thống sẽ tra cứu quy chế chính thức trên web.`

const SYSTEM_PROMPT = `Bạn là trợ lý điều hướng của diễn đàn KNIT (Đại học Quốc gia TP.HCM, khoa Ngôn ngữ).

Bạn KHÔNG phải chatbot trả lời mọi thứ. Mục tiêu của bạn là dẫn sinh viên đến câu trả lời của chính cộng đồng KNIT.

Nguyên tắc:
1. Chỉ dùng thông tin trong phần "NGỮ CẢNH TỪ DIỄN ĐÀN". Không bịa quy trình, không bịa tên phòng ban, không bịa mốc thời gian, không bịa số điện thoại hay địa chỉ.
2. Nếu ngữ cảnh CÓ bài liên quan — hãy trả lời dựa trên đó. Nếu bài viết đã mô tả quy trình, nơi liên hệ hay điều kiện thì nêu ra cụ thể, kể cả địa chỉ phòng ban, email, số điện thoại nếu có trong bài.
3. TUYỆT ĐỐI không nói "chưa có thông tin" khi ngữ cảnh CÓ bài liên quan. Chỉ nói vậy khi ngữ cảnh thực sự trống.
4. Nếu phần ngữ cảnh ghi "(trống)" — diễn đàn chưa có gì về chủ đề này — hãy nói thẳng điều đó và mời sinh viên đăng câu hỏi. TUYỆT ĐỐI không tự đưa ra quy trình khi không có nguồn.
5. Trả lời NGẮN GỌN — tối đa 3 câu, theo kiểu quy trình vài bước nếu có. Người dùng đọc nhanh trên điện thoại.
6. Nếu ngữ cảnh không đủ để trả lời chắc chắn, nói rõ điều chưa rõ và gợi ý hỏi cộng đồng.
7. Nếu người dùng nói trường hợp của họ khác với các bài đã có, đặt suggestPost = true.
8. Nếu không có ngữ cảnh nào liên quan, đặt suggestPost = true.
9. suggestedTitle là câu hỏi của người dùng đã viết lại cho tốt — ngắn gọn, đúng kiểu một câu hỏi cụ thể trên diễn đàn.
10. suggestedBody phải là nội dung sẽ đăng lên diễn đàn — viết lại câu hỏi của người dùng cho rõ ràng, có đủ ngữ cảnh để anh chị khóa trên trả lời được. Không thêm thông tin bạn không biết.
11. suggestAnonymous = true nếu câu hỏi liên quan đến việc cá nhân nhạy cảm (giấy tờ, sức khỏe, tài chính cá nhân, hoàn đổi quân sự, hồ sơ cá nhân).
12. Viết bằng tiếng Việt, giọng thân thiện như một sinh viên năm nhất đang hỏi bạn — không lạnh lùng như chatbot công nghiệp.
13. Nếu có phần "QUY CHẾ CHÍNH THỨC TỪ ULIS.VNU.EDU.VN", hãy dùng nó để đối chiếu và trích dẫn nguồn rõ ràng (tên trang + URL). Ưu tiên quy chế chính thức khi nó có thông tin đầy đủ hơn bài diễn đàn.
14. Nếu cả diễn đàn lẫn quy chế web đều không có, nói thẳng và mời sinh viên đăng bài — đừng suy đoán quy trình.`

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
  const cached = cache.get(key)

  // Đã có câu trả lời đầy đủ → trả ngay, không gọi model.
  if (cached?.ready) return cached

  /**
   * Tầng 1 — chuẩn hoá ý định.
   *
   * Model tách câu hỏi thành khái niệm chuẩn của ULIS + từ khoá mở rộng đa
   * ngôn ngữ. Nhờ vậy "lấy mã sinh viên ở đâu" (tiếng Việt không dấu) và
   * "Where do I get a student ID?" (tiếng Anh) đều tìm được cùng một bài.
   *
   * Nếu model lỗi thì dùng chính câu hỏi gốc làm truy vấn — vẫn chạy được.
   */
  const intent = await normaliseIntent(turn.question)

  /**
   * Tầng 2 — quét rộng ứng viên.
   *
   * Dùng khái niệm chuẩn + từ khoá mở rộng làm truy vấn. Mỗi truy vấn là
   * một cách diễn đạt khác, nên bài viết chỉ cần khớp một cách là lọt.
   */
  const queries = buildQueries(turn.question, intent)
  const candidates = await retrieveCandidates(queries, 20)

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
      sources: candidates.slice(0, 8),
      suggestPost: candidates.length === 0,
      suggestedTitle: turn.question,
      suggestedBody: turn.question,
      suggestAnonymous: false,
      ready: false,
    }

    /**
     * Gọi model ở nền để chuẩn bị câu trả lời đầy đủ. Lỗi không ném ra
     * ngoài — web sẽ gọi lại và nhận bản dự phòng.
     */
    void buildFullReply(turn, intent, candidates).then((full) => {
      writeCache(key, full)
    })

    return quick
  }

  /**
   * Bước 2 — câu trả lời đầy đủ do model viết.
   *
   * Nếu lần gọi trước đã lưu cache thì dùng luôn, không gọi model nữa.
   */
  const full = await buildFullReply(turn, intent, candidates)
  writeCache(key, full)
  return full
}

/**
 * Gom các truy vấn tìm kiếm từ ý định đã chuẩn hoá.
 *
 * Thứ tự quan trọng: khái niệm chuẩn đứng đầu vì đó là thuật ngữ chính
 * thức hay xuất hiện nhất trong bài viết.
 */
const buildQueries = (question: string, intent: NormalisedIntent | null): string[] => {
  const queries: string[] = [question]

  if (intent) {
    if (intent.concept) queries.push(intent.concept)
    for (const concept of intent.concepts) {
      if (concept && concept !== intent.concept) queries.push(concept)
    }
    for (const keyword of intent.keywords) {
      if (keyword) queries.push(keyword)
    }
  }

  return [...new Set(queries.map((q) => q.trim()).filter(Boolean))]
}

/**
 * Viết câu trả lời đầy đủ: model tóm tắt ngữ cảnh và viết lại câu hỏi.
 */
const buildFullReply = async (
  turn: ChatTurn,
  intent: NormalisedIntent | null,
  candidates: RagHit[],
): Promise<ChatReply> => {
  /**
   * Tầng 2 phần 2 — LLM re-rank.
   *
   * Model đọc câu hỏi và danh sách ứng viên rồi chọn ra tối đa 4 bài thực
   * sự giải quyết câu hỏi. Nhờ vậy bot không bao giờ nhét một bài chỉ
   * trùng từ khoá nhưng khác hoàn cảnh vào câu trả lời.
   */
  const { hits: relevant, confidence } = await rerankSources(
    turn.question,
    intent,
    candidates,
  )

  /**
   * Tầng 3 — tra cứu quy chế chính thức khi cần.
   *
   * Khi model không tìm được bài nào đủ tin cậy, hệ thống tra cứu
   * `ulis.vnu.edu.vn` để lấy văn bản quy trình thật rồi trộn vào ngữ cảnh.
   */
  const web = await maybeSearchWeb(turn.question, intent, relevant, confidence)

  const context = relevant
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

  const contextBlock = relevant.length
    ? `NGỮ CẢNH TỪ DIỄN ĐÀN:\n${context}`
    : 'NGỮ CẢNH TỪ DIỄN ĐÀN: (trống — diễn đàn chưa có bài nào liên quan)'

  const webBlock = web.text
    ? `\n\nQUY CHẾ CHÍNH THỨC TỪ ULIS.VNU.EDU.VN (dùng để đối chiếu, trích dẫn nguồn rõ ràng):\n${web.text}`
    : ''

  const intentBlock = intent
    ? `\n\nÝ ĐỊNH ĐÃ CHUẨN HOÁ: ${intent.intent}\nKHÁI NIỆM CHUẨN: ${intent.concept}`
    : ''

  const result = await callLlmJson({
    name: 'chat_reply',
    schema: CHAT_SCHEMA as unknown as Record<string, unknown>,
    system: SYSTEM_PROMPT,
    user: `Câu hỏi của sinh viên: ${turn.question}${intentBlock}\n\n${contextBlock}${webBlock}`,
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
        relevant.length === 0
          ? turn.lang === 'en'
            ? 'I could not find anything in the community about this yet. It looks like a good question to post — the seniors may know the exact procedure.'
            : 'Mình chưa tìm thấy nội dung nào liên quan trong cộng đồng. Đây có vẻ là câu hỏi nên đăng lên diễn đàn — các anh chị khóa trên chắc là biết quy trình chính xác.'
          : turn.lang === 'en'
            ? 'I found a few related threads below. Have a look — and if your situation differs, consider posting it so the community can help.'
            : 'Mình tìm được vài bài liên quan bên dưới. Bạn đọc tham khảo nhé — nếu trường hợp của bạn khác, cứ đăng câu hỏi để mọi người giúp.',
      sources: relevant,
      suggestPost: relevant.length === 0,
      suggestedTitle: turn.question,
      suggestedBody: turn.question,
      suggestAnonymous: false,
      ready: true,
    }
  }

  return {
    answer: payload.answer,
    sources: relevant,
    suggestPost: payload.suggestPost ?? relevant.length === 0,
    suggestedTitle: payload.suggestedTitle || turn.question,
    suggestedBody: payload.suggestedBody || turn.question,
    suggestAnonymous: payload.suggestAnonymous ?? false,
    ready: true,
  }
}

/**
 * Để model tự chọn nguồn thực sự liên quan (Tầng 2 phần 2).
 *
 * Đây là lớp "hiểu ngữ nghĩa": thay vì chỉ so khớp từ khoá, model đọc câu
 * hỏi và nội dung bài viết rồi quyết định cái nào thực sự giải quyết
 * được câu hỏi.
 *
 * Mô hình chạy trên danh sách 20 ứng viên — rộng hơn nhiều so với cách cũ
 * chỉ lấy 3-5 bài đầu. Đó là điểm mấu chốt: LLM phân biệt được "học lại
 * do trượt môn" với "học cải thiện điểm C", hai thứ đều chứa từ "học
 * lại" — điều mà bộ lọc từ khoá không làm được.
 *
 * Nếu model lỗi thì giữ nguyên danh sách ban đầu — không mất gì.
 */
const rerankSources = async (
  question: string,
  intent: NormalisedIntent | null,
  hits: RagHit[],
): Promise<{ hits: RagHit[]; confidence: number }> => {
  if (hits.length === 0) return { hits, confidence: 0 }

  const candidates = hits.slice(0, 20)

  const list = candidates
    .map((hit, index) => {
      const id = `s${index}`
      return [
        `[${id}] Câu hỏi: ${hit.title}`,
        hit.snippet ? `    Trích: ${hit.snippet.slice(0, 900)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  /**
   * Đưa cả khái niệm chuẩn vào prompt.
   *
   * Nhờ vậy model hiểu ý định thật của sinh viên, không chỉ câu chữ — ví dụ
   * biết "em lỡ rớt môn này" là hoàn cảnh trượt môn chứ không phải cải
   * thiện điểm.
   */
  const intentBlock = intent
    ? `Ý định: ${intent.intent}\nKhái niệm chuẩn: ${intent.concept}\n`
    : ''

  const result = await callLlmJson({
    name: 'rerank',
    schema: RERANK_SCHEMA as unknown as Record<string, unknown>,
    system: RERANK_SYSTEM,
    user: `${intentBlock}\nCâu hỏi của sinh viên: ${question}\n\nCác bài viết ứng viên:\n${list}`,
  })

  const payload = result?.data as { relevantIds?: string[]; confidence?: number } | undefined
  const ids = payload?.relevantIds

  /**
   * Model lỗi hoặc trả về rỗng → giữ nguyên danh sách gốc.
   *
   * Với trường hợp này, độ tin cậy đặt 0 để Tầng 3 kích hoạt tra cứu web.
   */
  if (!Array.isArray(ids) || ids.length === 0) return { hits, confidence: 0 }

  const chosen = ids
    .map((id) => candidates[Number(String(id).replace(/^s/, ''))])
    .filter((hit): hit is RagHit => Boolean(hit))

  if (chosen.length === 0) return { hits, confidence: 0 }

  const confidence = Math.max(0, Math.min(1, Number(payload?.confidence ?? 0.5)))

  return { hits: chosen, confidence }
}

/**
 * Tầng 3 — tra cứu quy chế chính thức khi diễn đàn không đủ.
 *
 * Chỉ chạy khi: không có API key tìm kiếm, HOẶC model không tìm được bài nào
 * đủ tin cậy. Đây là bước bù, không phải bước bắt buộc — nếu không có key
 * thì mọi thứ vẫn hoạt động như trước.
 */
const maybeSearchWeb = async (
  question: string,
  intent: NormalisedIntent | null,
  relevant: RagHit[],
  confidence: number,
): Promise<{ results: WebResult[]; text: string }> => {
  // Đã có nguồn đủ tin cậy → không cần tra web.
  if (!webSearchEnabled) return { results: [], text: '' }
  if (relevant.length > 0 && confidence >= 0.5) return { results: [], text: '' }

  // Dùng khái niệm chuẩn làm truy vấn web — "học lại học phí tín chỉ" tìm
  // được quy chế, còn câu hỏi gốc có thể quá rời rạc.
  const webQuery = intent?.concept || question

  const results = await searchWeb(webQuery)
  if (results.length === 0) return { results: [], text: '' }

  return buildWebContext(results)
}

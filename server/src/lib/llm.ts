/**
 * Lớp gọi LLM dùng chung cho KNIT.
 *
 * Tách ra khỏi `translate.ts` vì chatbot điều hướng cũng cần gọi model —
 * và cả hai đều cần cùng một bộ tối ưu tốc độ/chi phí.
 *
 * Ba quyết định tối ưu quan trọng nhất:
 *
 * 1. **Tắt reasoning.** `gpt-5.6-terra` mặc định dùng `reasoning: medium`,
 *    sinh ra hàng trăm token suy nghĩ cho mỗi lần gọi — vừa chậm vừa tốn
 *    (output $12/1M). Dịch thuật và RAG đều không cần suy nghĩ sâu, nên đặt
 *    `reasoning.effort = 'none'`. Đo thực tế: output giảm từ ~169 xuống
 *    ~31 token cho nội dung ngắn.
 *
 * 2. **Prompt caching.** System prompt là hằng số, và mọi lần gọi đều dùng
 *    chung nó. Provider cache phần input này giá rẻ hơn 10 lần và chạy
 *    nhanh hơn.
 *
 * 3. **Gọi song song.** Các nhóm nội dung độc lập (câu hỏi / câu trả lời)
 *    được gọi cùng lúc thay vì tuần tự.
 */

/** Model dùng chung. */
const MODEL = process.env.KNIT_LLM_MODEL ?? process.env.KNIT_TRANSLATE_MODEL ?? 'gpt-5.6-terra'

/** Base URL của provider (OpenAI-compatible). */
export const LLM_BASE_URL = (
  process.env.KNIT_TRANSLATE_BASE_URL ?? 'https://api.openai.com/v1'
).replace(/\/+$/, '')

/** Cổng chờ tối đa cho một lần gọi API (ms). */
export const LLM_TIMEOUT_MS = Number(process.env.KNIT_TRANSLATE_TIMEOUT_MS ?? 45_000)

/** Có bật dịch / chatbot hay không. */
export const llmEnabled = Boolean(process.env.OPENAI_API_KEY)

/**
 * Số lần thử lại khi provider lỗi tạm thời.
 *
 * Provider hay trả 502 tạm thời (Cloudflare) — thử lại giúp trải nghiệm
 * ổn định hơn nhiều so với báo lỗi ngay.
 */
const MAX_RETRIES = 2

/** Một tin nhắn gửi cho model. */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Yêu cầu trả về JSON theo schema — luôn parse được, không cần regex. */
export interface JsonSchemaRequest {
  /** Tên schema (hiển thị trong log của provider). */
  name: string
  /** Schema JSON Schema chuẩn. */
  schema: Record<string, unknown>
  /** System prompt. */
  system: string
  /** Nội dung yêu cầu của người dùng. */
  user: string
  /** Có dùng reasoning hay không (mặc định không — xem ghi chú ở đầu file). */
  reasoning?: boolean
}

/** Kết quả trả về từ model. */
export interface LlmJsonResult {
  /** Nội dung JSON đã parse. */
  data: unknown
  /** Số token input (đã tính cả phần cache). */
  promptTokens: number
  /** Số token output. */
  completionTokens: number
  /** Thời gian xử lý (ms). */
  elapsedMs: number
  /** Số token input lấy từ cache — rẻ hơn 10 lần. */
  cachedTokens: number
}

/**
 * Gọi model và nhận về JSON theo schema.
 *
 * Tự thử lại khi provider lỗi tạm thời (502/503/504 từ Cloudflare, 429 do
 * giới hạn tốc độ). Trả về `null` khi lỗi thật — caller không nên fail vì
 * lý reason của model.
 */
export const callLlmJson = async (request: JsonSchemaRequest): Promise<LlmJsonResult | null> => {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callLlmJsonOnce(request)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Chỉ thử lại với lỗi tạm thời.
      if (!isRetryable(lastError) || attempt === MAX_RETRIES) break
      // Chờ lâu hơn mỗi lần thử lại.
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
    }
  }

  console.error('[knit-llm] lỗi:', lastError?.message)
  return null
}

/** Lỗi nào đáng thử lại. */
const isRetryable = (error: Error): boolean =>
  /\b(429|502|503|504)\b/.test(error.message) || /fetch failed|timeout|abort/i.test(error.message)

/** Một lần gọi, không thử lại. */
const callLlmJsonOnce = async (request: JsonSchemaRequest): Promise<LlmJsonResult | null> => {
  const apiKey = process.env.OPENAI_API_KEY!
  if (!apiKey) return null

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: request.name,
        strict: true,
        schema: request.schema,
      },
    },
    // Dịch thuật không cần suy nghĩ — bỏ qua bước reasoning tiết kiệm
    // thời gian và phần lớn chi phí output.
    ...(request.reasoning
      ? { reasoning: { effort: 'low' } }
      : { reasoning: { effort: 'none' } }),
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  const startedAt = Date.now()

  try {
    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
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
      throw new Error(`LLM API ${response.status}: ${detail.slice(0, 300)}`)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        prompt_tokens_details?: { cached_tokens?: number }
      }
    }

    const raw = data.choices?.[0]?.message?.content
    if (!raw) throw new Error('LLM API không trả về nội dung.')

    return {
      data: JSON.parse(raw) as unknown,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      elapsedMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Gọi nhiều yêu cầu cùng lúc.
 *
 * Dùng khi các nhóm nội dung độc lập với nhau — ví dụ dịch câu hỏi và câu
 * trả lời của cùng một trang. Chạy song song giúp tổng thời gian bằng
 * thời gian của yêu cầu chậm nhất, không phải tổng.
 */
export const callLlmJsonParallel = async (
  requests: JsonSchemaRequest[],
): Promise<(LlmJsonResult | null)[]> => {
  if (requests.length === 0) return []
  if (requests.length === 1) return [await callLlmJson(requests[0]!)]

  return Promise.all(requests.map((request) => callLlmJson(request)))
}

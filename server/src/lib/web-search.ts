/**
 * Tầng 3 — tìm kiếm web bù khi diễn đàn không đủ.
 *
 * Khi LLM re-rank không tìm được bài nào đủ tin cậy, hệ thống tra cứu
 * quy chế chính thức của ULIS trên `ulis.vnu.edu.vn` để lấy văn bản quy
 * trình thật, rồi trộn vào ngữ cảnh cho bước tổng hợp.
 *
 * Provider tìm kiếm: Tavily (ưu tiên) hoặc Serper. Cả hai đều qua HTTP
 * thuần nên không cần thêm dependency.
 */

/** Kết quả một trang web. */
export interface WebResult {
  /** Tiêu đề trang. */
  title: string
  /** URL trang. */
  url: string
  /** Đoạn trích nội dung. */
  snippet: string
}

/** Nội dung tìm kiếm đã lấy, dùng để đưa vào prompt. */
export interface WebContext {
  /** Các trang đã dùng. */
  results: WebResult[]
  /** Nội dung đã rút gọn để đưa vào prompt. */
  text: string
}

/** Base URL của Tavily. */
const TAVILY_URL = 'https://api.tavily.com/search'

/** Base URL của Serper. */
const SERPER_URL = 'https://google.serper.dev/search'

/** Có bật tìm kiếm web không. */
export const webSearchEnabled = Boolean(
  process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY,
)

/** Số kết quả lấy từ mỗi lần tìm. */
const RESULT_LIMIT = 5

/**
 * Tìm kiếm web.
 *
 * Trả về mảng rỗng nếu không có API key hoặc provider lỗi — tầng 3 luôn
 * là bước bù, không phải bước bắt buộc.
 */
export const searchWeb = async (
  query: string,
  domain = 'ulis.vnu.edu.vn',
): Promise<WebResult[]> => {
  if (!webSearchEnabled) return []

  if (process.env.TAVILY_API_KEY) {
    const tavily = await searchTavily(query, domain)
    if (tavily.length > 0) return tavily
  }

  if (process.env.SERPER_API_KEY) {
    return searchSerper(query, domain)
  }

  return []
}

/** Tìm qua Tavily. */
const searchTavily = async (query: string, domain: string): Promise<WebResult[]> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: RESULT_LIMIT,
        include_domains: [domain],
        include_answer: false,
      }),
      signal: controller.signal,
    })

    if (!response.ok) return []

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>
    }

    return (data.results ?? [])
      .map((r) => ({
        title: String(r.title ?? ''),
        url: String(r.url ?? ''),
        snippet: String(r.content ?? '').slice(0, 800),
      }))
      .filter((r) => r.url)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** Tìm qua Serper. */
const searchSerper = async (query: string, domain: string): Promise<WebResult[]> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(SERPER_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: `${query} site:${domain}`, num: RESULT_LIMIT }),
      signal: controller.signal,
    })

    if (!response.ok) return []

    const data = (await response.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>
    }

    return (data.organic ?? [])
      .map((r) => ({
        title: String(r.title ?? ''),
        url: String(r.link ?? ''),
        snippet: String(r.snippet ?? '').slice(0, 800),
      }))
      .filter((r) => r.url)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ghép kết quả web thành khối văn bản cho prompt.
 *
 * Trích phần nội dung liên quan nhất — model sẽ tự đọc và trích dẫn.
 */
export const buildWebContext = (results: WebResult[]): WebContext => {
  if (results.length === 0) return { results: [], text: '' }

  const text = results
    .map((result, index) => {
      const body = result.snippet.replace(/\s+/g, ' ').trim()
      return `[Web ${index + 1}] ${result.title}\nURL: ${result.url}\n${body}`
    })
    .join('\n\n')

  return { results, text }
}

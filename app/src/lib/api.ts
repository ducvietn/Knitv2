/**
 * Lớp gọi API của KNIT.
 *
 * Mọi thao tác ghi đều đi qua server, nên dữ liệu nhất quán giữa các thiết bị
 * và có thể kiểm duyệt tập trung. Token JWT được giữ trong localStorage.
 */

/**
 * Base URL của API.
 *
 * Mặc định là `/api` — cùng origin với web app — nên bản deploy lên web
 * chỉ cần một domain là chạy, không cần CORS. Khi phát triển local, server
 * API chạy ở cổng khác nên dùng `VITE_API_BASE` trong `app/.env.development`.
 */
const BASE = import.meta.env.VITE_API_BASE ?? '/api'

const TOKEN_KEY = 'knit.token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  issues?: Record<string, string[]>
  constructor(status: number, message: string, issues?: Record<string, string[]>) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (options.body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 204) return undefined as T

  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    payload = null
  }

  if (!res.ok) {
    const body = (payload ?? {}) as { error?: string; message?: string; issues?: Record<string, string[]> }
    throw new ApiError(res.status, body.message ?? body.error ?? 'Đã có lỗi xảy ra.', body.issues)
  }

  return payload as T
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
}

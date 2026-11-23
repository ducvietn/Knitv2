/**
 * Bộ công cụ kiểm thử cho chatbot điều hướng — dùng bởi các script trong
 * `scripts/`.
 *
 * Gom các hàm cần thử vào một chỗ để script kiểm thử import gọn.
 */

export { normaliseIntent } from './intent'
export { retrieveCandidates } from './rag'
export { chat } from './chatbot'
export { searchWeb, webSearchEnabled } from './web-search'
export { sql } from './db'

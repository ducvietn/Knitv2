/**
 * Sua ChatbotPanel: chi hien the nguon khi da co ket qua LLM re-rank.
 *
 * Dung: node scripts/patch-chatbot-panel.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PATH = 'app/src/components/ChatbotPanel.tsx'
const src = readFileSync(PATH, 'utf8')

/** Giu nguyen xuong dong khi ghep chuoi. */
const nl = src.includes('\r\n') ? '\r\n' : '\n'

const lines = src.split(nl)
const out = []

for (const line of lines) {
  /**
   * Buoc 1 (goi khong cho) — bo cac truong tho, chi giu `searching`.
   *
   * Danh sach ung vien luc do con tho, chua qua LLM re-rank, nen hien ra
   * se la mot loat the bai khong lien quan.
   */
  if (
    line.includes('sources: quick.sources') ||
    line.includes('suggestPost: quick.suggestPost') ||
    line.includes('suggestedTitle: quick.suggestedTitle') ||
    line.includes('suggestedBody: quick.suggestBody') ||
    line.includes('suggestAnonymous: quick.suggestAnonymous')
  ) {
    continue
  }

  // Buoc 2 (goi cho) — gan nguon da loc va tat co "dang tim".
  if (line.includes('sources: full.sources')) {
    out.push(line)
    out.push(line.replace(/^(\s*)/, '$1') + 'searching: false,')
    continue
  }

  out.push(line)
}

let result = out.join(nl)

// 3) Khai bao truong `searching` trong interface ChatMessage.
result = result.replace(
  '/** Với bot: có nên gợi ý đăng bài không. */',
  [
    '/**',
    '   * Với bot: đang chờ LLM lọc nguồn xong chưa.',
    '   *',
    '   * Chỉ khi chưa xong thì hiện phần "đang tìm" — thẻ nguồn chỉ hiện',
    '   * khi đã chọn lọc xong, để tránh hiện ra một loạt bài không liên quan.',
    '   */',
    '  searching?: boolean',
    '  /** Với bot: có nên gợi ý đăng bài không. */',
  ].join(nl),
)

if (result === src) {
  console.log('KHONG co thay doi')
  process.exit(0)
}

writeFileSync(PATH, result, 'utf8')
console.log('Da sua xong', PATH)

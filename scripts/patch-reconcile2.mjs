/**
 * Chen ham `reconcileAnswerWithSources` vao `server/src/lib/chatbot.ts`.
 *
 * Dung: node scripts/patch-reconcile2.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PATH = 'server/src/lib/chatbot.ts'
const src = readFileSync(PATH, 'utf8')
const nl = src.includes('\r\n') ? '\r\n' : '\n'

const helper = [
  '/**',
  ' * Ép câu trả lời khớp với thực tế có nguồn hay không.',
  ' *',
  ' * Chỉ sửa khi model nói lệch. Nếu model đã nói đúng thì giữ nguyên — đừng',
  ' * cắt bỏ thông tin hữu ích chỉ vì thiếu một cụm từ khóa.',
  ' */',
  'const reconcileAnswerWithSources = (',
  '  answer: string,',
  '  sourceCount: number,',
  "  lang: 'vi' | 'en',",
  '): string => {',
  '  const lower = answer.toLowerCase()',
  '',
  '  /**',
  '   * Các cụm từ mang nghĩa "không tìm thấy gì".',
  '   *',
  '   * Dùng cả tiếng Việt và tiếng Anh vì câu hỏi có thể đến từ cả hai ngôn',
  '   * ngữ, và model trộn ngôn ngữ theo ngôn ngữ của người hỏi.',
  '   */',
  '  const noResultPhrases = [',
  "    'chưa có bài',",
  "    'chưa tìm thấy',",
  "    'không có bài',",
  "    'không tìm thấy',",
  "    'chưa có thông tin',",
  "    'không có thông tin',",
  "    'chưa có nội dung',",
  "    'không có nội dung',",
  "    'chưa có gì liên quan',",
  "    'chưa tìm được',",
  "    'không tìm được',",
  "    'no threads',",
  "    'no related',",
  "    'nothing found',",
  "    'no information',",
  "    'not found',",
  '  ]',
  '',
  '  const claimsNoResult = noResultPhrases.some((phrase) => lower.includes(phrase))',
  '',
  '  // Có nguồn nhưng model nói không có → sửa.',
  '  if (sourceCount > 0 && claimsNoResult) {',
  "    return lang === 'en'",
  "      ? 'Here are the threads from the community that cover this. Have a read below — and if your situation differs, post it so the seniors can help.'",
  "      : 'Dưới đây là các bài trong cộng đồng nói về vấn đề này. Bạn đọc tham khảo nhé — nếu trường hợp của bạn khác, cứ đăng câu hỏi để mọi người giúp.'",
  '  }',
  '',
  '  // Không có nguồn nhưng model nói có → sửa.',
  '  if (sourceCount === 0 && !claimsNoResult) {',
  "    return lang === 'en'",
  "      ? 'I could not find any thread in the community about this yet. It looks like a good question to post — the seniors may know the exact procedure.'",
  "      : 'Mình chưa tìm thấy bài nào trong cộng đồng về vấn đề này. Đây có vẻ là câu hỏi nên đăng lên diễn đàn — các anh chị khóa trên chắc là biết quy trình chính xác.'",
  '  }',
  '',
  '  return answer',
  '}',
  '',
  '',
].join(nl)

/**
 * Chen truoc comment cua `rerankSources`.
 */
const marker = `/**
 * Để model tự chọn nguồn thực sự liên quan (Tầng 2 phần 2).`

const idx = src.indexOf(marker)
if (idx === -1) {
  console.log('KHONG tim thay marker')
  process.exit(1)
}

const result = src.slice(0, idx) + helper + src.slice(idx)
writeFileSync(PATH, result, 'utf8')
console.log('Da chen helper')

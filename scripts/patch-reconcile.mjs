/**
 * Ep cau tra loi cua chatbot khop voi danh sach nguon that.
 *
 * Dung: node scripts/patch-reconcile.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PATH = 'server/src/lib/chatbot.ts'
const src = readFileSync(PATH, 'utf8')
const nl = src.includes('\r\n') ? '\r\n' : '\n'

const lines = src.split(nl)
const out = []
let done = false

for (const line of lines) {
  /**
   * Thay khoi `return { answer: payload.answer, ... }` bang ban co dieu chinh.
   *
   * Kiem tra bang dong tiep theo xem co phai `sources: relevant` khong — dam
   * bao khong sua nham cho mot khoi trong.
   */
  if (line.includes('answer: payload.answer,')) {
    const next = lines[out.length + 1]
    if (next?.includes('sources: relevant,')) {
      out.push('    answer,')
      out.push('    sources: relevant,')
      continue
    }
  }

  out.push(line)
}

let result = out.join(nl)

// Chen ham reconcile truoc ham rerankSources.
const helper = [
  '',
  '/**',
  ' * Ep cau tra loi khop voi thuc te co nguon hay khong.',
  ' *',
  ' * Chi sua khi model noi lech. Neu model da noi dung thi giu nguyen — dung cat bo',
  ' * thong tin huu ich chi vi thieu mot cum tu khoa.',
  ' */',
  'const reconcileAnswerWithSources = (',
  '  answer: string,',
  '  sourceCount: number,',
  "  lang: 'vi' | 'en',",
  '): string => {',
  '  const lower = answer.toLowerCase()',
  '',
  '  /**',
  '   * Cac cum tu mang nghia "khong tim thay gi".',
  '   *',
  '   * Dung ca tieng Viet va tieng Anh vi cau hoi co the den tu ca hai ngon ngu,',
  '   * va model tron ngon ngu theo ngon ngu cua nguoi hoi.',
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
  '  // Co nguon nhung model noi khong co → sua.',
  '  if (sourceCount > 0 && claimsNoResult) {',
  "    return lang === 'en'",
  "      ? 'Here are the threads from the community that cover this. Have a read below — and if your situation differs, post it so the seniors can help.'",
  "      : 'Dưới đây là các bài trong cộng đồng nói về vấn đề này. Bạn đọc tham khảo nhé — nếu trường hợp của bạn khác, cứ đăng câu hỏi để mọi người giúp.'",
  '  }',
  '',
  '  // Khong co nguon nhung model noi co → sua.',
  '  if (sourceCount === 0 && !claimsNoResult) {',
  "    return lang === 'en'",
  "      ? 'I could not find any thread in the community about this yet. It looks like a good question to post — the seniors may know the exact procedure.'",
  "      : 'Mình chưa tìm thấy bài nào trong cộng đồng về vấn đề này. Đây có vẻ là câu hỏi nên đăng lên diễn đàn — các anh chị khóa trên chắc là biết quy trình chính xác.'",
  '  }',
  '',
  '  return answer',
  '}',
  '',
].join(nl)

result = result.replace(
  '/**\r\n * Để model tự chọn nguồn thực sự liên quan (Tầng 2 phần 2).',
  `${helper.replace(/\r\n/g, nl)}/**\n * Để model tự chọn nguồn thực sự liên quan (Tầng 2 phần 2).`,
)

/**
 * Chen phep tinh `answer` ngay truoc khoi `return`.
 */
result = result.replace(
  /(\r?\n\s*return \{\r?\n\s*answer,\r?\n\s*sources: relevant,)/,
  [
    '',
    '  /**',
    '   * Đối chiếu câu trả lời với danh sách nguồn thật.',
    '   *',
    '   * Model đôi khi nói "diễn đàn chưa có bài nào liên quan" dù đã có nguồn',
    '   * (hoặc ngược lại — nói có trong khi không có nguồn nào). Ở đây ta ép buộc',
    '   * hai phần nhất quán với nhau:',
    '   *',
    '   * - Có nguồn → không được nói là không có bài nào.',
    '   * - Không có nguồn → phải nói rõ và gợi ý đăng bài.',
    '   */',
    '  const answer = reconcileAnswerWithSources(payload.answer, relevant.length, turn.lang)',
    '',
    '$1',
  ].join(nl),
)

if (result === src) {
  console.log('KHONG co thay doi')
  process.exit(1)
}

writeFileSync(PATH, result, 'utf8')
console.log('Da sua xong', PATH)

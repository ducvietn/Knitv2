import { sql } from './db'

/**
 * Tìm kiếm ngữ cảnh trong diễn đàn KNIT — phần "RAG" của chatbot điều hướng.
 *
 * Vì sao không dùng embedding?
 *
 * Diễn đàn KNIT nhỏ (hàng trăm câu hỏi), và truy vấn của sinh viên là
 * câu hỏi về thủ tục hành chính — nơi TỪ KHOÁ là tín hiệu mạnh ("xin
 * giấy xác nhận", "miễn nghĩa vụ quân sự", "đăng ký học phần"). Tìm kiếm
 * theo từ khoá cho kết quả chính xác, không cần cơ sở dữ liệu vector và
 * không tốn chi phí embedding.
 *
 * Điểm mấu chốt: hàm này trả về CẢ câu hỏi lẫn câu trả lời, kèm thông tin
 * người trả lời — vì chatbot phải dẫn sinh viên đến đúng bài viết gốc và
 * người đã trả lời, chứ không tự động làm thay.
 */

/** Một đoạn ngữ cảnh lấy từ diễn đàn. */
export interface RagHit {
  /** Loại nguồn. */
  kind: 'question' | 'answer'
  /** Id của câu hỏi chứa nguồn này. */
  questionId: string
  /** Id của nguồn (câu hỏi hoặc câu trả lời). */
  sourceId: string
  /** Tiêu đề câu hỏi. */
  title: string
  /** Tiêu đề câu hỏi bản tiếng Anh. */
  titleEn: string
  /** Nội dung đoạn trích. */
  snippet: string
  /** Nội dung đoạn trích bản tiếng Anh. */
  snippetEn: string
  /** Chủ đề. */
  topic: string
  /** Người viết nội dung này. */
  authorName: string
  /** Người viết là CTV / cán bộ (tick xanh). */
  authorVerified: boolean
  /** Khoá của người viết, ví dụ "K56". */
  authorCohort: string
  /** Số câu trả lời của câu hỏi chứa nguồn này. */
  answerCount: number
  /** Câu trả lời này có được đánh dấu giải quyết không. */
  accepted: boolean
  /** Số người thấy hữu ích. */
  helpful: number
  /** Điểm liên quan. */
  score: number
}

/** Chuẩn hoá chuỗi để so khớp không phân biệt dấu và hoa thường. */
const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Các từ dừng tiếng Việt — không mang thông tin khi tìm kiếm.
 *
 * Nếu giữ lại, câu "làm sao để" sẽ khớp với mọi bài viết.
 */
const STOP_WORDS = new Set([
  'la', 'lam', 'sao', 'de', 'cho', 'voi', 'va', 've', 'co', 'khong', 'mot',
  'nhu', 'thi', 'ban', 'minh', 'toi', 'hay', 'la', 'the', 'ra', 'ne', 'anh',
  'chi', 'em', 'me', 'ba', 'gi', 'giup', 'khi', 'tu', 'trong', 'ngoai',
  'tai', 'voi', 'cac', 'nhung', 'nen', 'bi', 'da', 'duoc', 'sau', 'tren',
  'biet', 'goi', 'can', 'nhan', 'lien', 'ho', 'cau', 'giay', 'to',
])

/**
 * Từ khoá "mạnh" — cụm từ chỉ đặc thù cho một chủ đề.
 *
 * Ví dụ "giay xac nhan" là cụm riêng của việc xin giấy tờ, không xuất
 * hiện ở mọi bài viết. Khớp cụm này cho điểm cao hơn nhiều so với khớp
 * từng từ rời.
 */
const STRONG_PHRASES = [
  'giay xac nhan',
  'nghia vu quan su',
  'mien nghia vu',
  'hoan nghia vu',
  'dang ky hoc phan',
  'trung lich',
  'thue hoc phi',
  'mien giam thue',
  'the sinh vien',
  'bao hiem',
  'lam the',
  'chung minh',
  'don tu',
  'so do',
]

/** Tách câu hỏi thành từ khoá có ý nghĩa. */
export const keywords = (text: string): string[] => {
  const tokens = normalise(text).split(' ').filter((t) => t.length > 2)
  return [...new Set(tokens.filter((t) => !STOP_WORDS.has(t)))]
}

/**
 * Tìm các đoạn nội dung liên quan tới câu hỏi của người dùng.
 *
 * Trả về tối đa `limit` kết quả, xếp theo độ liên quan.
 */
export const retrieveContext = async (
  query: string,
  limit = 6,
): Promise<RagHit[]> => {
  const terms = keywords(query)
  if (terms.length === 0) return []

  // Chuẩn hoá truy vấn để tìm bằng `LIKE` không phân biệt dấu.
  const normalisedQuery = normalise(query)

  // Tải về các bài có thể liên quan. Ở đây lọc rộng (theo cụm từ mạnh
  // hoặc từ khoá dài) rồi chấm điểm chi tiết trong JS — làm vậy nhanh hơn
  // và linh hoạt hơn việc viết SQL phức tạp.
  const probes = [
    ...STRONG_PHRASES.filter((phrase) => normalisedQuery.includes(phrase)),
    ...terms.filter((t) => t.length >= 5).slice(0, 4),
  ]

  if (probes.length === 0) probes.push(...terms.slice(0, 2))

  const where = probes.map(() => '(q.title LIKE ? OR q.body LIKE ? OR a.body LIKE ?)').join(' OR ')
  const params: string[] = []
  for (const probe of probes) {
    params.push(`%${probe}%`, `%${probe}%`, `%${probe}%`)
  }

  const rows = await sql
    .prepare(
      `SELECT q.id AS q_id, q.title AS q_title, q.title_en AS q_title_en,
              q.topic AS q_topic, q.also_need AS q_also_need,
              (SELECT COUNT(*) FROM answers a2 WHERE a2.question_id = q.id) AS q_answer_count,
              a.id AS a_id, a.body AS a_body, a.body_en AS a_body_en,
              a.accepted AS a_accepted, a.helpful_count AS a_helpful,
              u.display_name AS a_display_name, u.verified AS a_verified,
              u.cohort AS a_cohort
         FROM questions q
         LEFT JOIN answers a ON a.question_id = q.id
         LEFT JOIN users u ON u.id = COALESCE(a.author_id, q.author_id)
        WHERE ${where}
        LIMIT 300`,
    )
    .all<Record<string, unknown>>(...params)

  // Chấm điểm từng dòng theo số từ khoá khớp.
  const hits: RagHit[] = []

  for (const row of rows) {
    const title = String(row.q_title ?? '')
    const body = String(row.a_body ?? '')
    const haystack = normalise(`${title} ${body}`)
    const titleHaystack = normalise(title)

    let score = 0

    // Cụm từ mạnh — tín hiệu mạnh nhất về trùng chủ đề.
    for (const phrase of STRONG_PHRASES) {
      if (!normalisedQuery.includes(phrase)) continue
      if (haystack.includes(phrase)) score += 6
      else if (titleHaystack.includes(phrase)) score += 4
    }

    // Từ khoá rời — điểm thấp hơn nhiều để tránh khớp nhầm.
    let termHits = 0
    for (const term of terms) {
      if (!haystack.includes(term)) continue
      termHits += 1
      score += titleHaystack.includes(term) ? 2 : 0.75
    }

    /**
     * Ngưỡng liên quan.
     *
     * Phải khớp ÍT NHẤT 2 từ khoá, hoặc khớp một cụm từ mạnh. Nếu chỉ
     * khớp 1 từ chung ("giấy", "xác nhận") thì bài viết đó gần như chắc
     * chắn không liên quan — và đưa nó cho sinh viên chỉ làm nhiễu.
     */
    const matchedStrong = STRONG_PHRASES.some(
      (phrase) => normalisedQuery.includes(phrase) && haystack.includes(phrase),
    )
    if (termHits < 2 && !matchedStrong) continue

    // Câu hỏi đã có câu trả lời và được nhiều người cần biết → nổi lên.
    if (Number(row.q_answer_count ?? 0) > 0) score += 2
    if (row.a_accepted) score += 2
    if (row.a_verified) score += 1.5
    score += Number(row.q_also_need ?? 0) / 20

    const isQuestion = !row.a_id
    const snippetVi = isQuestion ? String(row.q_title ?? '') : body
    const snippetEn = isQuestion ? String(row.q_title_en ?? '') : String(row.a_body_en ?? '')

    hits.push({
      kind: isQuestion ? 'question' : 'answer',
      questionId: String(row.q_id),
      sourceId: isQuestion ? String(row.q_id) : String(row.a_id),
      title,
      titleEn: String(row.q_title_en ?? ''),
      snippet: snippetVi.slice(0, 400),
      snippetEn: snippetEn.slice(0, 400),
      topic: String(row.q_topic ?? ''),
      authorName: String(row.a_display_name ?? ''),
      authorVerified: Boolean(row.a_verified),
      authorCohort: String(row.a_cohort ?? ''),
      answerCount: Number(row.q_answer_count ?? 0),
      accepted: Boolean(row.a_accepted),
      helpful: Number(row.a_helpful ?? 0),
      score: Number(score.toFixed(2)),
    })
  }

  // Một câu hỏi chỉ nên xuất hiện một lần — lấy nguồn điểm cao nhất.
  const best = new Map<string, RagHit>()
  for (const hit of hits) {
    const key = `${hit.questionId}:${hit.kind}`
    const current = best.get(key)
    if (!current || hit.score > current.score) best.set(key, hit)
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * Tìm câu hỏi có câu trả lời được đánh dấu giải quyết — dùng làm "đích đến"
 * của chatbot.
 *
 * Khác với `retrieveContext`: chỉ trả về câu hỏi có câu trả lời tốt, vì
 * chatbot cần dẫn sinh viên đến nơi có thực sự giải quyết.
 */
export const retrieveAnsweredQuestions = async (
  query: string,
  limit = 3,
): Promise<RagHit[]> => {
  const hits = await retrieveContext(query, limit * 4)
  return hits
    .filter((hit) => hit.kind === 'question' && hit.answerCount > 0)
    .slice(0, limit)
}

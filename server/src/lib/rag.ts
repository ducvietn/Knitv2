import { sql } from './db'

/**
 * Tầng 2 (phần 1) — quét rộng ứng viên trong diễn đàn KNIT.
 *
 * ---
 *
 * Vì sao không dùng embedding?
 *
 * Provider hiện tại (`modelapi.vn`) không có model embedding — chỉ có model
 * chat. Vậy nên ta làm hai việc khác:
 *
 * 1. **Chấm điểm trong JS, không dùng `LIKE` ở SQL.**
 *
 *    Đây là điểm mấu chốt. `LIKE` so khớp giữ nguyên dấu, nên câu hỏi
 *    viết không dấu ("`toi lay ma sinh vien`") không bao giờ khớp nội dung
 *    có dấu ("`Làm thẻ sinh viên`") — đây chính là lý do bot báo "không
 *    tìm thấy" cho câu hỏi hoàn toàn hợp lệ.
 *
 *    Diễn đàn KNIT nhỏ (vài chục câu hỏi), nên tải hết về rồi so khớp trong
 *    JS sau khi đã BỎ DẤU cả hai vế là rẻ và chính xác. Cách này xử lý
 *    trọn vẹn cả ba dạng: tiếng Việt có dấu, tiếng Việt không dấu, tiếng
 *    Anh.
 *
 * 2. **Để LLM tự loại nguồn không liên quan.**
 *
 *    Sau khi quét ra danh sách ứng viên, model đọc câu hỏi và từng ứng viên
 *    rồi chọn ra cái thực sự liên quan — xem `lib/chatbot.ts`.
 *
 * ---
 *
 * Vì sao lấy NHIỀU ứng viên (15-20) thay vì 3-5?
 *
 * Bước lọc bằng từ khoá chỉ nhìn thấy "trùng chữ", không hiểu "trùng
 * hoàn cảnh". LLM thì hiểu — nó phân biệt được "học lại do trượt môn" với
 * "học cải thiện điểm C", hai thứ đều chứa từ "học lại". Nên ta đưa cho
 * LLM một danh sách rộng và để nó tự loại nhiễu — chính xác hơn nhiều so
 * với siết ngưỡng điểm bằng tay.
 *
 * ---
 *
 * Điểm mấu chốt khác: hàm này trả về CẢ câu hỏi lẫn câu trả lời, kèm
 * thông tin người trả lời — vì chatbot phải dẫn sinh viên đến đúng bài viết
 * gốc và người đã trả lời, chứ không tự động làm thay.
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

/**
 * Chuẩn hoá chuỗi để so khớp.
 *
 * BỎ DẤU + bỏ dấu câu + hạ chữ thường — nhờ vậy "Làm thẻ sinh viên",
 * "lam the sinh vien" và "Lam the sinh vien" đều trở thành một chuỗi
 * giống hệt nhau.
 */
export const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Các từ dừng tiếng Việt và tiếng Anh — không mang thông tin khi tìm kiếm.
 *
 * Nếu giữ lại, câu "làm sao để" sẽ khớp với mọi bài viết.
 */
const STOP_WORDS = new Set([
  // Tiếng Việt
  'la', 'lam', 'sao', 'de', 'cho', 'voi', 'va', 've', 'co', 'khong', 'mot',
  'nhu', 'thi', 'ban', 'minh', 'toi', 'hay', 'the', 'ra', 'ne', 'anh',
  'chi', 'em', 'me', 'ba', 'gi', 'giup', 'khi', 'tu', 'trong', 'ngoai',
  'tai', 'cac', 'nhung', 'nen', 'bi', 'da', 'duoc', 'sau', 'tren',
  'biet', 'goi', 'can', 'nhan', 'lien', 'ho', 'cau', 'giay', 'to',
  'vao', 'nha', 'den', 'luc', 'nao', 'nhieu', 'o', 'roi', 'thi', 'se',
  'deu', 'mot', 'hai', 'ba', 'muoi', 'gia', 'lan',
  // Tiếng Anh
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
  'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how',
  'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy',
  'did', 'get', 'let', 'put', 'say', 'she', 'too', 'use', 'that', 'with',
  'have', 'this', 'will', 'your', 'from', 'they', 'know', 'want', 'been',
  'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just',
  'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them',
  'well', 'were', 'what', 'which', 'where', 'there', 'about', 'would',
])

/**
 * Cụm từ đồng nghĩa — gom nhiều cách diễn đạt của CÙNG một chủ đề.
 *
 * Mỗi nhóm chứa cả tiếng Việt (có dấu và không dấu) lẫn tiếng Anh, để bot
 * hiểu được "lấy mã sinh viên" ↔ "làm thẻ sinh viên" ↔ "student ID" — ba
 * cách hỏi cùng một việc nhưng không từ nào trùng nhau.
 */
const SYNONYM_GROUPS: string[][] = [
  // Thẻ / mã sinh viên
  ['the sinh vien', 'ma sinh vien', 'msv', 'ma so', 'student id', 'student card', 'the ban'],
  // Giấy tờ / xác nhận
  ['giay xac nhan', 'xac nhan', 'giay to', 'chung minh', 'certificate', 'student certificate'],
  // Quân sự
  ['nghia vu quan su', 'mien nghia vu', 'hoan nghia vu', 'quan su', 'tay nghia vu', 'military'],
  // Học phần / đăng ký môn
  ['dang ky hoc phan', 'dang ky mon', 'hoc phan', 'mon hoc', 'register', 'course registration'],
  // Trùng lịch
  ['trung lich', 'xung dot', 'ung vien', 'conflict', 'clash', 'schedule conflict'],
  // Học phí
  ['thue hoc phi', 'hoc phi', 'mien giam', 'dong hoc phi', 'tuition', 'fee'],
  // Bảo hiểm
  ['bao hiem', 'bhyt', 'y te', 'insurance', 'health insurance'],
  // Hộ chiếu
  ['ho chieu', 'passport'],
  // Học bổng
  ['hoc bong', 'scholarship'],
  // Kết quả / điểm
  ['ket qua', 'diem', 'bang diem', 'gpa', 'grade', 'transcript'],
  // Thi lại / học lại
  ['thi lai', 'hoc lai', 'retake', 'fail'],
  // Tốt nghiệp
  ['tot nghiep', 'graduat', 'thi tot nghiep'],
  // Giải thể / hủy môn
  ['giai the', 'huy mon', 'drop', 'withdraw'],
  // Thực tập
  ['thuc tap', 'internship', 'thuc tap nghiep vu'],
  // Thư viện
  ['thu vien', 'library', 'muon sach', 'borrow'],
  // Ký túc
  ['ky tuc', 'noi tru', 'dormitory'],
  // Kỳ thi
  ['ky thi', 'thi', 'exam', 'test', 'midterm', 'final'],
  // Cấp thẻ
  ['cap the', 'lam the', 'student card', 'id card'],
  // Giờ mở cửa / thời gian
  ['may gio', 'mo cua', 'gio mo', 'opening hours', 'what time'],
  // Game / giải trí
  ['game', 'choi', 'play', 'games', 'gaming'],
  // Số giờ
  ['bao nhieu tieng', 'how many hours', 'bao nhieu gio', 'how long'],
  // Lịch học
  ['lich hoc', 'thoi khoa', 'timetable', 'schedule'],
  // Nội trú
  ['ky tuc', 'noi tru', 'dorm'],
  // Ký tên / xác nhận
  ['ky ten', 'xac nhan', 'sign'],
  // Bảo lưu / giữ nguyên
  ['bao luu', 'giữ nguyên', 'bao ve hoc phan'],
  // Chuyển khoa / chuyển lớp
  ['chuyen khoa', 'chuyen lop', 'change major', 'transfer'],
]

/**
 * Tách câu hỏi thành từ khoá có ý nghĩa.
 *
 * Không dùng độ dài ký tự làm tiêu chí — câu ngắn như "lấy mã sinh viên ở
 * đâu" có từ khoá rất ngắn nhưng lại là câu hỏi đúng nhất.
 */
export const keywords = (text: string): string[] => {
  const tokens = normalise(text).split(' ').filter((t) => t.length > 2)
  return [...new Set(tokens.filter((t) => !STOP_WORDS.has(t)))]
}

/**
 * Các nhóm đồng nghĩa mà truy vấn chạm tới.
 */
const matchingGroups = (normalisedQuery: string): string[][] => {
  const groups: string[][] = []
  for (const group of SYNONYM_GROUPS) {
    if (group.some((phrase) => normalisedQuery.includes(phrase))) {
      groups.push(group)
    }
  }
  return groups
}

/** Dữ liệu thô lấy từ database. */
interface RawRow {
  q_id: string
  q_title: string
  q_title_en: string
  q_body: string
  q_topic: string
  q_also_need: number
  q_answer_count: number
  a_id: string | null
  a_body: string | null
  a_body_en: string | null
  a_accepted: boolean
  a_helpful: number
  u_display_name: string | null
  u_verified: boolean
  u_cohort: string | null
}

/**
 * Tải toàn bộ diễn đàn về.
 *
 * Diễn đàn nhỏ nên tải hết rồi chấm điểm trong JS — cách này xử lý được
 * tiếng Việt có dấu, không dấu và tiếng Anh một cách đồng nhất, thay vì
 * dùng `LIKE` ở SQL vốn phân biệt dấu.
 */
const loadForum = async (): Promise<RawRow[]> => {
  return sql
    .prepare(
      `SELECT q.id AS q_id, q.title AS q_title, q.title_en AS q_title_en,
              q.body AS q_body, q.topic AS q_topic, q.also_need AS q_also_need,
              (SELECT COUNT(*) FROM answers a2 WHERE a2.question_id = q.id) AS q_answer_count,
              a.id AS a_id, a.body AS a_body, a.body_en AS a_body_en,
              a.accepted AS a_accepted, a.helpful_count AS a_helpful,
              u.display_name AS u_display_name, u.verified AS u_verified,
              u.cohort AS u_cohort
         FROM questions q
         LEFT JOIN answers a ON a.question_id = q.id
         LEFT JOIN users u ON u.id = COALESCE(a.author_id, q.author_id)
        LIMIT 500`,
    )
    .all<RawRow>()
}

/**
 * Tìm các đoạn nội dung liên quan tới câu hỏi của người dùng.
 *
 * Trả về tối đa `limit` kết quả, xếp theo độ liên quan.
 */
export const retrieveCandidates = async (
  queries: string | string[],
  limit = 20,
): Promise<RagHit[]> => {
  const queryList = (Array.isArray(queries) ? queries : [queries]).filter((q) => q.trim())
  if (queryList.length === 0) return []

  const rows = await loadForum()
  const hits: RagHit[] = []

  /**
   * Chuẩn bị từng truy vấn.
   *
   * `terms` là các từ khoá đã loại từ dừng; `groups` là các nhóm đồng nghĩa
   * mà truy vấn chạm tới.
   */
  const prepared = queryList.map((query) => ({
    query,
    normalised: normalise(query),
    terms: keywords(query),
    groups: matchingGroups(normalise(query)),
  }))

  for (const row of rows) {
    const title = String(row.q_title ?? '')
    const questionBody = String(row.q_body ?? '')
    const answerBody = String(row.a_body ?? '')

    // Chuẩn hoá cả nội dung tiếng Việt lẫn tiếng Anh để so khớp chéo.
    const haystackVi = normalise(`${title} ${questionBody} ${answerBody}`)
    const haystackEn = normalise(
      `${row.q_title_en ?? ''} ${row.a_body_en ?? ''} ${answerBody}`,
    )
    const titleHaystack = normalise(title)

    let score = 0
    let bestTermHits = 0
    let groupHits = 0

    /**
     * Chấm điểm theo từng truy vấn, lấy điểm cao nhất.
     *
     * Mỗi truy vấn độc lập — bài viết chỉ cần khớp MỘT truy vấn là đủ
     * liên quan. Đây là chỗ Tầng 1 phát huy tác dụng: câu "lấy mã sinh viên"
     * không khớp "Làm thẻ sinh viên", nhưng khớp truy vấn mở rộng "cấp thẻ
     * sinh viên".
     */
    for (const { normalised, terms, groups } of prepared) {
      let queryScore = 0
      let queryGroupHits = 0
      let queryTermHits = 0

      /**
       * Cụm đồng nghĩa — tín hiệu mạnh nhất.
       *
       * Nếu truy vấn và nội dung cùng nằm trong một nhóm đồng nghĩa thì đây
       * gần như chắc chắn là cùng chủ đề, kể cả khi không từ nào trùng nhau
       * ("lấy mã sinh viên" ↔ "làm thẻ sinh viên" ↔ "student ID").
       */
      for (const group of groups) {
        const inQuery = group.some((p) => normalised.includes(p))
        const inContent = group.some(
          (p) => haystackVi.includes(p) || haystackEn.includes(p) || titleHaystack.includes(p),
        )
        if (inQuery && inContent) {
          queryScore += 10
          queryGroupHits += 1
        }
      }

      // Từ khoá rời — điểm vừa phải để trùng từ chung vẫn ghi nhận.
      for (const term of terms) {
        const inVi = haystackVi.includes(term)
        const inEn = haystackEn.includes(term)
        if (!inVi && !inEn) continue
        queryTermHits += 1
        queryScore += titleHaystack.includes(term) ? 2.5 : 1
      }

      /**
       * Ngưỡng liên quan cho từng truy vấn.
       *
       * Chấp nhận khi: có cụm đồng nghĩa khớp, HOẶC khớp đủ 2 từ khoá.
       * Chỉ khớp 1 từ chung ("giấy", "xác nhận") thì bài viết đó gần như
       * chắc chắn không liên quan.
       */
      if (queryGroupHits === 0 && queryTermHits < 2) continue

      if (queryScore > score) score = queryScore
      if (queryTermHits > bestTermHits) bestTermHits = queryTermHits
      if (queryGroupHits > groupHits) groupHits = queryGroupHits
    }

    if (score === 0) continue

    // Câu hỏi đã có câu trả lời và được nhiều người cần biết → nổi lên.
    if (Number(row.q_answer_count ?? 0) > 0) score += 2
    if (row.a_accepted) score += 2
    if (row.u_verified) score += 1.5
    score += Number(row.q_also_need ?? 0) / 20

    const isQuestion = !row.a_id
    const snippetVi = isQuestion ? title : answerBody
    const snippetEn = isQuestion ? String(row.q_title_en ?? '') : String(row.a_body_en ?? '')

    hits.push({
      kind: isQuestion ? 'question' : 'answer',
      questionId: String(row.q_id),
      sourceId: isQuestion ? String(row.q_id) : String(row.a_id),
      title,
      titleEn: String(row.q_title_en ?? ''),
      snippet: snippetVi.slice(0, 1500),
      snippetEn: snippetEn.slice(0, 1500),
      topic: String(row.q_topic ?? ''),
      authorName: String(row.u_display_name ?? ''),
      authorVerified: Boolean(row.u_verified),
      authorCohort: String(row.u_cohort ?? ''),
      answerCount: Number(row.q_answer_count ?? 0),
      accepted: Boolean(row.a_accepted),
      helpful: Number(row.a_helpful ?? 0),
      score: Number(score.toFixed(2)),
    })
  }

  /**
   * Gom theo câu hỏi — mỗi câu hỏi chỉ nên xuất hiện một lần.
   *
   * Với cùng một câu hỏi, ta chọn câu trả lời **dài nhất**, không phải điểm
   * cao nhất. Lý do: câu trả lời dài thường là câu mô tả QUY TRÌNH đầy đủ
   * (kèm địa chỉ phòng ban, số điện thoại, mốc thời gian), còn câu trả lời
   * ngắn chỉ là góp ý kinh nghiệm ("chụp ảnh 4x6 trước ở nhà"). Cho bot
   * đọc câu dài là câu trả lời đầy đủ hơn nhiều.
   */
  const best = new Map<string, RagHit>()
  for (const hit of hits) {
    const key = `${hit.questionId}:${hit.kind}`
    const current = best.get(key)
    if (!current) {
      best.set(key, hit)
      continue
    }
    // Câu trả lời nào dài hơn thì giữ câu đó.
    if (hit.snippet.length > current.snippet.length) {
      best.set(key, { ...hit, score: Math.max(hit.score, current.score) })
    }
  }

  const ranked = [...best.values()].sort((a, b) => b.score - a.score)

  return ranked.slice(0, limit)
}

/**
 * Tìm câu hỏi có câu trả lời được đánh dấu giải quyết — dùng làm "đích đến"
 * của chatbot.
 *
 * Khác với `retrieveCandidates`: chỉ trả về câu hỏi có câu trả lời tốt, vì
 * chatbot cần dẫn sinh viên đến nơi có thực sự giải quyết.
 */
export const retrieveAnsweredQuestions = async (
  queries: string | string[],
  limit = 3,
): Promise<RagHit[]> => {
  const hits = await retrieveCandidates(queries, limit * 4)
  return hits
    .filter((hit) => hit.kind === 'question' && hit.answerCount > 0)
    .slice(0, limit)
}

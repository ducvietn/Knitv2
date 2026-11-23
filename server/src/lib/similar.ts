/**
 * Gợi ý câu hỏi tương tự — cơ chế khác biệt cốt lõi của KNIT.
 *
 * Chạy ở phía server để kết quả nhất quán giữa các thiết bị, và để
 * có thể mở rộng sang truy vấn theo embedding sau này.
 */

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export interface SimilarHit {
  id: string
  title: string
  titleEn: string
  topic: string
  answerCount: number
  alsoNeed: number
  score: number
}

/**
 * Chấm điểm cộng dồn theo từ khoá: càng nhiều từ trùng, càng gần.
 * Câu đã có câu trả lời và được nhiều người "cần biết" được ưu tiên.
 */
export const rankSimilar = (
  draft: string,
  pool: {
    id: string
    title: string
    titleEn: string
    body: string
    bodyEn: string
    tags: string[]
    answerCount: number
    alsoNeed: number
    topic: string
  }[],
  limit = 4,
): SimilarHit[] => {
  const text = normalise(draft)
  if (text.length < 3) return []
  const tokens = text.split(' ').filter((t) => t.length > 1)
  if (tokens.length === 0) return []

  return pool
    .map((q) => {
      const haystack = normalise(`${q.title} ${q.body} ${q.tags.join(' ')}`)
      let score = 0
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1
      }
      if (q.answerCount > 0) score += 1.5
      score += q.alsoNeed / 40
      return { q, score }
    })
    .filter(({ score }) => score > 1.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ q, score }) => ({
      id: q.id,
      title: q.title,
      titleEn: q.titleEn,
      topic: q.topic,
      answerCount: q.answerCount,
      alsoNeed: q.alsoNeed,
      score: Number(score.toFixed(2)),
    }))
}

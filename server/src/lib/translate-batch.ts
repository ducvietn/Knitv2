import { sql } from './db'
import { translateSegments, type Segment } from './translate'

/**
 * Dịch hàng loạt — gộp MỌI đoạn cần dịch vào MỘT lần gọi API.
 *
 * Vì sao cần?
 *
 * Khi người dùng bấm nút "EN" ở trang danh sách, có thể có hàng chục câu
 * hỏi và câu trả lời trên màn hình chưa có bản dịch. Nếu dịch từng cái
 * một thì tốn gấp nhiều lần token và người dùng phải chờ lâu.
 *
 * Ở đây tất cả đoạn văn được đóng gói thành một danh sách `segments` với
 * khoá duy nhất, gửi đi một lần, rồi ghi kết quả về database.
 */

/** Bản dịch của một câu hỏi. */
interface QuestionRow {
  id: string
  title: string
  title_en: string
  body: string
  body_en: string
}

/** Bản dịch của một câu trả lời. */
interface AnswerRow {
  id: string
  question_id: string
  body: string
  body_en: string
  variant_context: string | null
  variant_context_en: string | null
  referral_office: string | null
  referral_office_en: string | null
  referral_note: string | null
  referral_note_en: string | null
}

/** Những đoạn của một câu hỏi cần dịch. */
interface QuestionPlan {
  id: string
  needsTitle: boolean
  needsBody: boolean
  title: string
  body: string
  title_en: string
  body_en: string
}

/** Những đoạn của một câu trả lời cần dịch. */
interface AnswerPlan {
  id: string
  needsBody: boolean
  needsVariant: boolean
  needsOffice: boolean
  needsNote: boolean
  body: string
  body_en: string
  variant_context: string | null
  variant_context_en: string | null
  referral_office: string | null
  referral_office_en: string | null
  referral_note: string | null
  referral_note_en: string | null
}

/** Một đoạn cần dịch, kèm khoá duy nhất để tra lại kết quả. */
interface Job {
  /** Đoạn cần dịch. */
  text: string
  /** Hàm ghi kết quả về database. */
  save: (text: string) => Promise<void>
}

/**
 * Dịch danh sách câu hỏi + câu trả lời trong một lần gọi API.
 *
 * Trả về `true` nếu có nội dung nào được cập nhật.
 */
export async function translateContentNow(
  questionIds: string[],
  answerIds: string[],
): Promise<boolean> {
  const jobs: Job[] = []

  /* ------------------------------------------------------------ câu hỏi */

  if (questionIds.length > 0) {
    const rows = await sql
      .prepare(
        `SELECT id, title, title_en, body, body_en
           FROM questions WHERE id IN (${questionIds.map(() => '?').join(', ')})`,
      )
      .all<QuestionRow>(...questionIds)

    const plans: QuestionPlan[] = []

    for (const row of rows) {
      const needsTitle = !row.title_en || row.title_en === row.title
      const needsBody = !row.body_en || row.body_en === row.body
      if (!needsTitle && !needsBody) continue

      plans.push({
        id: row.id,
        needsTitle,
        needsBody,
        title: row.title,
        body: row.body,
        title_en: row.title_en,
        body_en: row.body_en,
      })
    }

    for (const plan of plans) {
      if (plan.needsTitle) {
        jobs.push({
          text: plan.title,
          save: async (text) => {
            await sql
              .prepare('UPDATE questions SET title_en = ? WHERE id = ?')
              .run(text, plan.id)
          },
        })
      }
      if (plan.needsBody) {
        jobs.push({
          text: plan.body,
          save: async (text) => {
            await sql.prepare('UPDATE questions SET body_en = ? WHERE id = ?').run(text, plan.id)
          },
        })
      }
    }
  }

  /* -------------------------------------------------------- câu trả lời */

  if (answerIds.length > 0) {
    const rows = await sql
      .prepare(
        `SELECT id, question_id, body, body_en, variant_context, variant_context_en,
                referral_office, referral_office_en, referral_note, referral_note_en
           FROM answers WHERE id IN (${answerIds.map(() => '?').join(', ')})`,
      )
      .all<AnswerRow>(...answerIds)

    for (const row of rows) {
      const needsBody = !row.body_en || row.body_en === row.body
      const needsVariant =
        row.variant_context != null &&
        (!row.variant_context_en || row.variant_context_en === row.variant_context)
      const needsOffice =
        row.referral_office != null &&
        (!row.referral_office_en || row.referral_office_en === row.referral_office)
      const needsNote =
        row.referral_note != null &&
        (!row.referral_note_en || row.referral_note_en === row.referral_note)

      if (needsBody) {
        jobs.push({
          text: row.body,
          save: async (text) => {
            await sql.prepare('UPDATE answers SET body_en = ? WHERE id = ?').run(text, row.id)
          },
        })
      }
      if (needsVariant) {
        jobs.push({
          text: row.variant_context ?? '',
          save: async (text) => {
            await sql
              .prepare('UPDATE answers SET variant_context_en = ? WHERE id = ?')
              .run(text, row.id)
          },
        })
      }
      if (needsOffice) {
        jobs.push({
          text: row.referral_office ?? '',
          save: async (text) => {
            await sql
              .prepare('UPDATE answers SET referral_office_en = ? WHERE id = ?')
              .run(text, row.id)
          },
        })
      }
      if (needsNote) {
        jobs.push({
          text: row.referral_note ?? '',
          save: async (text) => {
            await sql
              .prepare('UPDATE answers SET referral_note_en = ? WHERE id = ?')
              .run(text, row.id)
          },
        })
      }
    }
  }

  if (jobs.length === 0) return false

  /* ------------------------------------------------- một lần gọi API duy nhất */

  const segments: Segment[] = jobs.map((job, index) => ({
    key: `s${index}`,
    text: job.text,
  }))

  const map = await translateSegments(segments)
  if (Object.keys(map).length === 0) return false

  let changed = 0
  for (let index = 0; index < jobs.length; index++) {
    const translated = map[`s${index}`]
    if (!translated) continue
    await jobs[index]!.save(translated)
    changed += 1
  }

  if (changed > 0) {
    console.log(`[knit-translate] đã dịch ${changed}/${jobs.length} đoạn trong 1 lần gọi API`)
  }
  return changed > 0
}

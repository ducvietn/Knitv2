import { Router } from 'express'
import { z } from 'zod'
import { getAnswer, getQuestion } from '../lib/repo'
import { translateContentNow } from '../lib/translate-batch'
import { translateEnabled } from '../lib/translate'

export const translateRouter = Router()

/**
 * Dịch tức thì khi người dùng bấm nút "EN".
 *
 * Bình thường bản dịch được tạo ở chế độ nền ngay sau khi câu hỏi được
 * đăng. Nhưng nếu người dùng bấm "EN" ngay sau đó thì bản dịch chưa kịp
 * xong, và web sẽ hiện nội dung tiếng Việt. Các endpoint ở đây cho phép
 * web lấy bản dịch ngay lập tức, không cần tải lại trang.
 *
 * Chi phí được tối ưu bằng cách gộp MỌI đoạn cần dịch vào một lần gọi
 * API duy nhất — xem `lib/translate-batch.ts`.
 */

/** Danh sách id cần dịch. */
const batchSchema = z.object({
  questionIds: z.array(z.string().min(1)).max(100).default([]),
  answerIds: z.array(z.string().min(1)).max(300).default([]),
})

/**
 * Dịch nhiều câu hỏi và câu trả lời cùng lúc.
 *
 * Web gọi endpoint này khi người dùng bấm "EN" — trả về nội dung đã dịch
 * để cập nhật giao diện ngay, không cần tải lại trang.
 */
translateRouter.post('/', async (req, res) => {
  if (!translateEnabled) {
    res.status(503).json({
      error: 'translate_disabled',
      message: 'Tính năng dịch tự động chưa được bật trên máy chủ.',
    })
    return
  }

  const parsed = batchSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }

  const { questionIds, answerIds } = parsed.data
  if (questionIds.length === 0 && answerIds.length === 0) {
    res.json({ questions: [], answers: [] })
    return
  }

  await translateContentNow(questionIds, answerIds)

  // Đọc lại dữ liệu đã cập nhật để trả về cho web.
  const questions = (
    await Promise.all(questionIds.map((id) => getQuestion(id)))
  ).filter((q): q is NonNullable<typeof q> => Boolean(q))

  const answers = (
    await Promise.all(answerIds.map((id) => getAnswer(id)))
  ).filter((a): a is NonNullable<typeof a> => Boolean(a))

  res.json({ questions, answers })
})

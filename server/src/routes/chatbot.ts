import { Router } from 'express'
import { z } from 'zod'
import { chat } from '../lib/chatbot'
import { llmEnabled } from '../lib/llm'

export const chatbotRouter = Router()

/**
 * Trợ lý điều hướng của KNIT.
 *
 * Trả lời ngắn gọn dựa trên bài viết có sẵn trong diễn đàn, kèm thẻ bài
 * viết gốc để người dùng đọc và hỏi tiếp cộng đồng — thay vì bot làm thay
 * cộng đồng.
 *
 * Vì provider cần ~6s cho một lần gọi model, endpoint hỗ trợ hai chế độ:
 *
 * - `wait=false` (mặc định): trả ngay phần RAG + thẻ nguồn (~100ms), đồng
 *   thời gọi model ở nền.
 * - `wait=true`: chờ model viết xong rồi trả về bản đầy đủ.
 *
 * Web gọi lần đầu không chờ, rồi gọi lại lần hai sau vài giây.
 */
const chatSchema = z.object({
  question: z.string().min(3, 'Câu hỏi quá ngắn').max(1000),
  lang: z.enum(['vi', 'en']).default('vi'),
  /** Chờ model viết xong rồi mới trả về. */
  wait: z.boolean().default(false),
})

chatbotRouter.post('/', async (req, res) => {
  if (!llmEnabled) {
    res.status(503).json({
      error: 'chatbot_disabled',
      message: 'Trợ lý điều hướng chưa được bật trên máy chủ.',
    })
    return
  }

  const parsed = chatSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.flatten().fieldErrors })
    return
  }

  try {
    const reply = await chat(
      {
        question: parsed.data.question,
        lang: parsed.data.lang,
      },
      parsed.data.wait,
    )
    res.json(reply)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[knit-chatbot] lỗi:', message)
    res.status(500).json({
      error: 'chatbot_error',
      message: 'Trợ lý điều hướng đang gặp sự cố. Vui lòng thử lại.',
    })
  }
})

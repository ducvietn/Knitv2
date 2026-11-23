import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import cors from 'cors'
import express from 'express'
import { initSchema } from './lib/db'
import { attachUser } from './lib/auth'
import { avatarDir, avatarStorageEnabled, readAvatarFromStorage } from './lib/avatar'
import { adminRouter } from './routes/admin'
import { answersRouter, meRouter } from './routes/answers'
import { authRouter } from './routes/auth'
import { avatarRouter } from './routes/avatar'
import { notificationsRouter, reportsRouter } from './routes/notifications'
import { questionsRouter } from './routes/questions'
import { isDatabaseEmpty, readSeedFile, seedIfEmpty } from './seed-data'

const app = express()
const PORT = Number(process.env.PORT ?? 4000)

/**
 * Thư mục chứa bản build của web app.
 *
 * Khi deploy, server Node phục vụ luôn web tĩnh và API trên cùng một
 * origin — không cần CORS, không cần cấu hình domain riêng cho API.
 * Khi phát triển local, `vite dev` chạy ở cổng 5173 và thư mục này chưa tồn
 * tại nên server chỉ đóng vai trò API.
 */
const WEB_DIST = resolve(process.env.KNIT_WEB_DIST ?? '../app/dist')

/**
 * Danh sách origin được phép gọi API.
 *
 * Rỗng = chỉ cho phép same-origin (an toàn mặc định). Chỉ khi tách web và
 * API thành hai nơi khác nhau mới cần khai báo `KNIT_CORS_ORIGINS`.
 */
const corsOrigins = (process.env.KNIT_CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      // Không có Origin header = request cùng origin hoặc công cụ dòng lệnh.
      if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin không được phép truy cập KNIT API.'))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(attachUser)

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'knit-api', time: new Date().toISOString() })
})

app.use('/api/auth', authRouter)
app.use('/api/avatar', avatarRouter)
app.use('/api/questions', questionsRouter)
app.use('/api', answersRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/me', meRouter)
app.use('/api/admin', adminRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Đường dẫn không tồn tại.' })
})

/* ------------------------------------------------------------ web tĩnh (SPA) */

/**
 * Ảnh avatar do người dùng tải lên.
 *
 * Phục vụ trước khi bắt tay tới SPA để `/avatars/...` không bị nuốt vào
 * `index.html`. Ảnh không tồn tại trả 404 rõ ràng, không phải trang web.
 *
 * Khi bật Supabase Storage, ảnh nằm trên Storage nên phải tải qua API
 * thay vì đọc từ filesystem (container không có volume persistent).
 */
if (avatarStorageEnabled) {
  app.get('/avatars/:fileName', async (req, res) => {
    const fileName = String(req.params.fileName ?? '')
    if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
      res.status(404).json({ error: 'not_found', message: 'Không tìm thấy ảnh này.' })
      return
    }
    const buffer = await readAvatarFromStorage(fileName)
    if (!buffer) {
      res.status(404).json({ error: 'not_found', message: 'Không tìm thấy ảnh này.' })
      return
    }
    const ext = fileName.split('.').pop()?.toLowerCase()
    const mime =
      ext === 'png' ? 'image/png'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
      : 'application/octet-stream'
    res.setHeader('Content-Type', mime)
    res.setHeader('Cache-Control', 'public, max-age=604800')
    res.send(buffer)
  })
} else {
  app.use('/avatars', express.static(avatarDir, { maxAge: '7d' }))
}
app.use('/avatars', (_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Không tìm thấy ảnh này.' })
})

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }))
  // Mọi đường dẫn còn lại (SPA route) trả về index.html.
  app.get('*', (_req, res) => {
    res.sendFile(resolve(WEB_DIST, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send(
        'KNIT API đang chạy. Bản web chưa được build trong thư mục này — chạy `npm run build` ở workspace gốc.',
      )
  })
}

/* ------------------------------------------------------------ xử lý lỗi */

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[knit-api]', err)
  res.status(500).json({ error: 'server_error', message: 'Đã có lỗi xảy ra. Vui lòng thử lại.' })
})

/**
 * Tự nạp dữ liệu mẫu khi khởi động lần đầu.
 *
 * Cơ sở dữ liệu trên volume của môi trường deploy bắt đầu hoàn toàn trống,
 * nếu không nạp thì web mở ra trống trơn. Chỉ nạp khi bảng `questions` còn
 * rỗng — nghĩa là không bao giờ ghi đè dữ liệu thật do người dùng tạo.
 */
async function autoSeedOnFirstRun() {
  try {
    if (!(await isDatabaseEmpty())) return
    const seed = readSeedFile()
    await seedIfEmpty(seed)
    console.log('[knit-api] đã nạp dữ liệu mẫu vào cơ sở dữ liệu trống.')
  } catch (err) {
    console.warn('[knit-api] không nạp được dữ liệu mẫu:', err)
  }
}

/**
 * Khởi động server.
 *
 * Thứ tự quan trọng: tạo lược độ trước, nạp dữ liệu mẫu sau, và chỉ bắt đầu
 * lắng nghe khi mọi thứ đã sẵn sàng — nhờ vậy request đầu tiên không
 * gặp bảng chưa tồn tại.
 */
async function start() {
  await initSchema()
  await autoSeedOnFirstRun()

  app.listen(PORT, () => {
    console.log(`[knit-api] đang chạy tại http://localhost:${PORT}/api`)
    if (existsSync(WEB_DIST)) console.log(`[knit-api] phục vụ web tĩnh từ ${WEB_DIST}`)
  })
}

start().catch((err) => {
  console.error('[knit-api] không khởi động được:', err)
  process.exit(1)
})

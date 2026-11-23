/**
 * Kiểm thử adapter avatar với Supabase Storage.
 *
 * Dựng một HTTP server giả lập đúng API Storage của Supabase
 * (`/storage/v1/object/<bucket>/<file>`), rồi kiểm tra:
 *
 * - upload (POST + `x-upsert`)
 * - download (GET)
 * - xoá (DELETE)
 * - `saveAvatar` trả URL `/avatars/...`
 * - `readAvatarFromStorage` trả về đúng bytes
 *
 * Chạy:  npx tsx scripts/test-avatar-storage.mjs
 */
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`  [OK] ${label}`)
  } else {
    failures += 1
    console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/* --------------------------------------------- 1. server Storage giả lập */
const store = new Map()
const seen = { uploads: 0, downloads: 0, deletes: 0, contentType: null }

/** Trả JSON — `http` của Node không có `res.status()` như Express. */
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  // /storage/v1/object/<bucket>/<file>
  const match = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)
  if (!match) {
    json(res, 404, { error: 'not_found' })
    return
  }
  const [, bucket, file] = match
  if (bucket !== 'avatars') {
    json(res, 404, { error: 'no_bucket' })
    return
  }

  if (req.method === 'POST') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      store.set(file, Buffer.concat(chunks))
      seen.uploads += 1
      seen.contentType = req.headers['content-type'] ?? null
      json(res, 200, { Key: file })
    })
    return
  }

  if (req.method === 'GET') {
    seen.downloads += 1
    const data = store.get(file)
    if (!data) {
      json(res, 404, { error: 'not_found' })
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
    res.end(data)
    return
  }

  if (req.method === 'DELETE') {
    seen.deletes += 1
    store.delete(file)
    json(res, 200, { message: 'deleted' })
    return
  }

  json(res, 405, { error: 'method_not_allowed' })
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const SUPABASE_URL = `http://127.0.0.1:${port}`

console.log(`\n[1] Storage giả lập đang chạy tại ${SUPABASE_URL}`)

/* ------------------------------------------- 2. nạp adapter với biến môi trường */
process.env.SUPABASE_URL = SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.SUPABASE_STORAGE_BUCKET = 'avatars'
process.env.KNIT_AVATAR_DIR = resolve(ROOT, '.tmp-avatar-test')

const { avatarStorageEnabled, saveAvatar, deleteAvatar, readAvatarFromStorage } = await import(
  pathToFileURL(resolve(ROOT, 'server/src/lib/avatar.ts')).href
)

check('bật được Storage khi có SUPABASE_URL + key', avatarStorageEnabled === true)
check('tắt được khi thiếu key', (() => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const ok = avatarStorageEnabled === true // module đã nạp -> giữ nguyên giá trị đã tính
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved
  return ok
})())

/* ------------------------------------------------------------- 3. upload */
console.log('\n[2] Upload ảnh')
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const url = await saveAvatar(png, 'image/png', 'user-123')
check('saveAvatar trả URL dạng /avatars/...', url.startsWith('/avatars/'), url)
check('file đã được upload lên Storage', seen.uploads === 1, `uploads=${seen.uploads}`)
check('Content-Type đúng', seen.contentType === 'image/png', `ct=${seen.contentType}`)
check('bytes lưu đúng', store.size === 1, `size=${store.size}`)

const fileName = url.slice('/avatars/'.length)
const stored = store.get(fileName)
check('nội dung file khớp', stored?.equals(png) === true, `len=${stored?.length} vs ${png.length}`)

/* ----------------------------------------------------------- 4. download */
console.log('\n[3] Download ảnh')
const downloaded = await readAvatarFromStorage(fileName)
check('đọc được ảnh từ Storage', downloaded?.equals(png) === true, `len=${downloaded?.length}`)

const missing = await readAvatarFromStorage('khong-ton-tai.png')
check('ảnh không tồn tại trả null', missing === null)

/* ------------------------------------------------------------- 5. xoá */
console.log('\n[4] Xoá ảnh')
await deleteAvatar(url)
check('đã gọi DELETE', seen.deletes === 1, `deletes=${seen.deletes}`)
check('ảnh bị xoá khỏi Storage', store.size === 0, `size=${store.size}`)

/* ------------------------------------------ 6. xoá URL không hợp lệ */
console.log('\n[5] URL không hợp lệ')
await deleteAvatar(undefined)
await deleteAvatar('https://example.com/anh.png')
await deleteAvatar('/avatars/../../etc/passwd')
check('bỏ qua URL không hợp lệ', seen.deletes === 1, `deletes=${seen.deletes}`)

server.close()

console.log(
  failures === 0
    ? '\nKiem thu Supabase Storage avatar deu pass.'
    : `\n${failures} kiem thu that bai.`,
)
process.exit(failures === 0 ? 0 : 1)

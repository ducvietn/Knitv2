/**
 * Nạp dữ liệu mẫu (đã kiểm chứng nguồn thật của ULIS) vào SQLite.
 *
 * Dùng: `npm run seed` — xoá sạch rồi nạp lại toàn bộ dữ liệu mẫu.
 * Mật khẩu mặc định của mọi tài khoản mẫu: `knit1234`.
 */
import { DEFAULT_PASSWORD, readSeedFile, seedIfEmpty } from './seed-data'

const seed = readSeedFile()
seedIfEmpty(seed, { replace: true })

console.log('[knit-seed] đã nạp dữ liệu mẫu:')
console.log(
  `  ${seed.authors.length} tài khoản · ${seed.questions.length} câu hỏi · ${seed.answers.length} câu trả lời`,
)
console.log(`  mật khẩu chung: ${DEFAULT_PASSWORD}`)
console.log(`  đăng nhập thử: a2@ulis.vnu.edu.vn`)

/**
 * Sinh `server/seed-data.json` từ dữ liệu mẫu của app.
 *
 * Dùng: `npx tsx scripts/export-seed.ts` (chạy từ thư mục gốc workspace).
 * File JSON sinh ra được commit để server không phụ thuộc vào mã nguồn app.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ANSWERS, AUTHORS, NOTIFICATIONS, QUESTIONS, REPORTS } from '../app/src/data/mock'

const authors = AUTHORS.map((a) => ({
  id: a.id,
  email: `${a.id}@ulis.vnu.edu.vn`,
  displayName: a.displayName,
  facultyVi: a.facultyVi,
  facultyEn: a.facultyEn,
  cohort: a.cohort,
  role: a.role,
  verified: a.verified,
  avatarSeed: a.avatarSeed,
}))

const payload = { authors, questions: QUESTIONS, answers: ANSWERS, notifications: NOTIFICATIONS, reports: REPORTS }

const out = resolve(process.cwd(), 'server/seed-data.json')
writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8')
console.log(`Đã ghi ${out}`)
console.log(
  `  ${authors.length} tài khoản · ${QUESTIONS.length} câu hỏi · ${ANSWERS.length} câu trả lời · ${NOTIFICATIONS.length} thông báo · ${REPORTS.length} báo cáo`,
)

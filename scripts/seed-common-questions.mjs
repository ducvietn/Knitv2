/**
 * Them cau hoi mau ve cac thu tuc sinh vien that hay gap.
 *
 * Vì sao cần?
 *
 * Diễn đàn ban đầu chỉ có vài câu hỏi, và chưa có bài nào về các thủ tục
 * mà tân sinh viên hay hỏi nhất (quân sự, giấy xác nhận, hộ chiếu…). Chatbot
 * điều hướng chỉ hữu ích khi có nguồn để trích dẫn.
 *
 * Script này tạo câu hỏi + câu trả lời qua API thật, nên đi đúng luồng
 * (kèm bản dịch tiếng Anh tự động).
 *
 * Dung: node scripts/seed-common-questions.mjs [base-url]
 */
const BASE = process.argv[2] ?? 'http://localhost:4123/api'

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    /* khong phai JSON */
  }
  return { status: res.status, data }
}

/**
 * Cac cau hoi mau.
 *
 * `body` là nội dung câu hỏi; `answer` là câu trả lời sẽ được đăng (do
 * "sinh viên năm trên" trả lời). Nội dung bám sát thực tế, nhưng đây là dữ
 * liệu MẪU — người dùng thật sẽ bổ sung và sửa.
 */
const QUESTIONS = [
  {
    title: 'Làm sao để xin giấy xác nhận sinh viên?',
    body: 'Mình cần giấy xác nhận đang là sinh viên để làm thủ tục hoãn nghĩa vụ quân sự. Không biết nộp ở đâu, cần chuẩn bị gì và mất bao lâu?',
    topic: 'thu-tuc',
    answer:
      'Giấy xác nhận sinh viên do Văn phòng Khoa cấp, không phải lớp trưởng. Thường bạn gửi yêu cầu qua đầu mối lớp trưởng (lớp trưởng tổng hợp rồi chuyển Văn phòng Khoa), hoặc nộp trực tiếp tại Văn phòng Khoa. Hồ sơ thường gồm: bản sao CMND/CCCD, ảnh 3x4 cm và bản sao kết quả học kỳ gần nhất nếu cần. Số tiền và thời gian xử lý tuỳ từng học kỳ, nên bạn nên hỏi trực tiếp Văn phòng Khoa trước khi nộp. Nếu nộp cho cơ quan quân sự thì nhớ hỏi xem bản này có cần đóng dấu hay không.',
    referralOffice: 'Văn phòng Khoa Ngôn ngữ và Văn hóa Pháp',
    referralNote: 'Cầu hành chính — sinh viên nộp trực tiếp tại Văn phòng Khoa.',
  },
  {
    title: 'Thủ tục miễn nghĩa vụ quân sự ở đâu?',
    body: 'Sinh viên muốn đăng ký miễn nghĩa vụ quân sự thì làm ở đâu, nộp hồ sơ gồm những gì?',
    topic: 'thu-tuc',
    answer:
      'Thông thường quy trình gồm hai bước: xin giấy xác nhận từ trường (do Văn phòng Khoa cấp) rồi nộp hồ sơ tại Chi cục Quốc phòng địa phương nơi bạn cư trú. Hồ sơ thường có giấy xác nhận, bản sao CMND, ảnh 4x6 và giấy tờ xác nhận đã đăng ký. Lưu ý mốc thời gian: nên xử lý sớm trong học kỳ, vì thủ tục này kéo dài và cần bạn trực tiếp đến cơ quan quân sự. Chi tiết địa chỉ và mẫu đơn thì tùy địa phương cụ thể — hãy hỏi lớp trưởng hoặc anh chị đã làm trước.',
    referralOffice: 'Chi cục Quốc phòng địa phương nơi cư trú',
    referralNote: 'Hỏi lớp trưởng / anh chị khóa trên để biết địa chỉ và mẫu đơn của địa phương.',
  },
  {
    title: 'Có điều kiện miễn nghĩa vụ quân sự thì cần làm gì?',
    body: 'Mình nghe nói có thể được miễn nghĩa vụ quân sự. Điều kiện là gì và hồ sơ cần những gì?',
    topic: 'thu-tuc',
    answer:
      'Điều kiện cụ thể và hồ sơ kèm theo phụ thuộc từng trường hợp (sức khỏe, học vụ, tôn giáo…) và quy định của địa phương, nên mình không dám khẳng định điều kiện chính xác. Điều chắc chắn là bạn cần có giấy xác nhận của trường để nộp kèm. Tốt nhất là hỏi trực tiếp Chi cục Quốc phòng địa phương để lấy danh sách hồ sơ chính thức — họ sẽ cho bạn biết cụ thể cần bổ sung gì. Nếu anh chị nào đã làm rồi thì bạn cứ hỏi ở đây, mọi người sẽ chia sẻ kinh nghiệm.',
  },
  {
    title: 'Làm hộ chiếu ở đâu và cần những gì?',
    body: 'Muốn làm hộ chiếu thì đến đâu, mất bao lâu và cần chuẩn bị giấy tờ gì?',
    topic: 'thu-tuc',
    answer:
      'Thủ tục làm hộ chiếu thuộc Công an xã phường nơi bạn đăng ký hộ khẩu, không phải ở trường. Bạn cần CMND/CCCD, ảnh hộ chiếu theo quy định, và bản sao hộ khẩu; thanh niên 18-25 tuổi thì có thể cần giấy xác nhận của cơ quan quản lý. Thời gian cấp thường khoảng 5-7 ngày làm việc, có thể lâu hơn nếu bị bổ sung hồ sơ. Chi tiết địa chỉ và lịch làm việc thì tra ở Công an xã/phường hoặc trên cổng dịch vụ công.',
    referralOffice: 'Công an xã/phường nơi đăng ký hộ khẩu',
    referralNote: 'Thủ tục do Công an xã/phường quản lý — hỏi tại địa phương để biết lịch và mẫu đơn.',
  },
  {
    title: 'Bảo hiểm y tế của trường có tự động gia hạn mỗi năm không?',
    body: 'Năm nhất mua bảo hiểm y tế ở đâu, năm sau có phải đăng ký lại không và mất bao nhiêu?',
    topic: 'thu-tuc',
    answer:
      'Mình vẫn chưa thấy thông báo chính thức nào trên diễn đàn về việc gia hạn tự động nên không dám khẳng định. Bạn nên theo dõi thông báo của Phòng Công tác sinh viên và bảng tin của khoa — mỗi học kỳ đầu năm thường có thông báo mức đóng và hạn chót. Mẹo nhỏ: hãy hỏi lớp trưởng hoặc các anh chị khóa trên đã đóng năm trước, vì mức đóng và cách mua thường không đổi qua các năm.',
  },
  {
    title: 'Có thể đổi hoặc thi lại môn học không?',
    body: 'Mình trượt môn rồi thì có thể thi lại không, hay phải học lại? Thủ tục đăng ký thi lại thế nào?',
    topic: 'hoc-tap',
    answer:
      'Cách xử lý phụ thuộc quy định của khoa và ngành, nên mình không dám nói chắc trước. Điều chắc chắn là bạn cần tra cổng đào tạo để xem mình đã học lại bao nhiêu lần — nếu vượt quá số lần cho phép thì bắt buộc phải học lại. Bạn nên mở thông báo đăng ký học phần của học kỳ đó, phần xử lý thi lại và học lại thường có ghi rõ. Nếu bạn từng gặp trường hợp này thì bổ sung ở đây giúp người khác nhé.',
    referralOffice: 'Phòng Đào tạo và Người học',
    referralNote: 'Tra trên Cổng đào tạo ĐHQGHN — mục kết quả học tập.',
  },
  {
    title: 'Học bổng của trường xin ở đâu và điều kiện gì?',
    body: 'Năm nhất có được xin học bổng không? Hồ sơ gồm gì và hạn nộp là khi nào?',
    topic: 'hoc-tap',
    answer:
      'Học bổng thường do Phòng Chính trị & Công tác HSSV và Phòng Đào tạo phối hợp phát, thông báo mở rộng vào đầu mỗi học kỳ. Hồ sơ thường có bản kê khai thành tích, bản sao giấy chứng nhận kết quả học tập và bài luận hoặc thuyết minh thành tích. Mình chưa có thông báo cụ thể của học kỳ này trong tay nên bạn nên hỏi lớp trưởng để lấy đúng thông báo và file mẫu — vì hạn nộp và điều kiện chấm điểm thay đổi theo từng đợt.',
    referralOffice: 'Phòng Chính trị & Công tác HSSV',
    referralNote: 'Theo dõi thông báo học bổng đầu mỗi học kỳ.',
  },
  {
    title: 'Đăng ký môn học bị hết chỗ thì làm sao?',
    body: 'Đăng ký môn học bị đầy không được đăng ký. Có cách nào xin thêm chỗ không, hay phải chờ đợt sau?',
    topic: 'hoc-tap',
    answer:
      'Chỗ môn học thường được mở lại theo thông báo đăng ký học phần của từng đợt — lịch mở thêm chỗ và thời hạn đăng ký đều ghi rõ ở đó. Nếu vẫn không được, bạn nên liên hệ giảng viên phụ trách môn (một số thầy cô cho đăng ký thêm) hoặc tra Phòng Đào tạo và Người học về chuyện nâng sức chứa lớp. Mẹo nhỏ: đăng ký môn bắt buộc trước, môn tự chọn sau — vì môn tự chọn hay chiếm chỗ trước.',
    referralOffice: 'Phòng Đào tạo và Người học',
    referralNote: 'Tra thông báo đăng ký học phần của đúng học kỳ.',
  },
]

// 1. Tao tai khoan de dang bai.
const email = `seed${Date.now()}@ulis.vnu.edu.vn`
const reg = await call('/auth/register', {
  method: 'POST',
  body: {
    email,
    password: 'Knit@12345',
    displayName: 'Ban Truyen Nghiep',
    facultyVi: 'Khoa Ngon ngu va Van hoa Phap',
    facultyEn: 'Faculty of Languages and Civilisation',
    cohort: 'K23',
  },
})

if (reg.status !== 200 && reg.status !== 201) {
  console.log('DANG KY THAT BAI:', reg.status, JSON.stringify(reg.data).slice(0, 300))
  process.exit(1)
}
const auth = { Authorization: `Bearer ${reg.data.token}` }
console.log(`Da tao tai khoan ${email}\n`)

let created = 0
let failed = 0

for (const q of QUESTIONS) {
  const res = await call('/questions', {
    method: 'POST',
    headers: auth,
    body: {
      title: q.title,
      body: q.body,
      topic: q.topic,
      anonymous: false,
      tags: [],
    },
  })

  if (res.status !== 201) {
    console.log(`[FAIL] ${q.title} -> ${res.status} ${JSON.stringify(res.data).slice(0, 150)}`)
    failed++
    continue
  }

  const id = res.data.question.id

  const ans = await call(`/questions/${id}/answers`, {
    method: 'POST',
    headers: auth,
    body: {
      body: q.answer,
      accepted: true,
      referral: q.referralOffice
        ? { office: q.referralOffice, note: q.referralNote ?? '' }
        : undefined,
    },
  })

  if (ans.status !== 201) {
    console.log(`[FAIL-ANS] ${q.title} -> ${ans.status}`)
    failed++
    continue
  }

  console.log(`[OK] ${q.title}  (${id})`)
  created++
}

console.log(`\nDa tao ${created}/${QUESTIONS.length} cau hoi, that bai ${failed}`)
console.log('Cho 30 giay de server dich nen sang tieng Anh...')
await new Promise((r) => setTimeout(r, 30_000))
console.log('Xong.')

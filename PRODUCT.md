# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: React 18 + Vite + TypeScript + Tailwind CSS. Chosen by the team because the project needs many reusable components (question cards, answer threads, tag chips, role badges) and must ship as a fast mobile-first static web app for the ULIS pilot. No backend in v1: all data is local mock data in the client, structured so a real API can replace it later.

## Users

- **Tân sinh viên ULIS (chính)** — sinh viên năm nhất, mới nhập học, cần trả lời những câu hỏi hành chính và học tập mà thông tin đang nằm rải rác trên website trường, thông báo khoa và các group mạng xã hội. Job: tìm được câu trả lời đáng tin trong vài phút, hoặc biết chính xác phải hỏi ai.
- **Sinh viên khóa trên / cán bộ lớp / CTV** — đã từng trải qua những thắc mắc này và có kinh nghiệm phù hợp theo chủ đề. Job: chia sẻ lại kinh nghiệm một lần, để cả khóa sau đều dùng được.
- **Quản trị viên (nhóm dự án)** — kiểm duyệt, xác nhận thông tin, xử lý báo cáo nội dung sai/lỗi thời.

## Product Purpose

KNIT là website hỏi–đáp dành riêng cho sinh viên ULIS. Nó tồn tại để biến những câu hỏi lặp đi lặp lại mỗi năm nhập học thành một kho tri thức tích luỹ được: cùng một thắc mắc chỉ cần hỏi một lần, và câu trả lời tốt nhất từ nhiều người được gom về một chỗ.

Thành công nghĩa là: tân sinh viên tự tìm được câu trả lời mà không cần nhắn riêng cho anh chị; người hỗ trợ không phải trả lời lại cùng một câu lần thứ N; mọi thông tin về thủ tục nhà trường đều dẫn tới nguồn chính thức.

## Positioning

Khác biệt cốt lõi nằm ở cơ chế **gợi ý câu hỏi tương tự ngay khi người dùng đang soạn bài**: trước khi một câu hỏi trùng lặp được đăng lên, KNIT đã đưa ra các câu hỏi cùng chủ đề đã có câu trả lời. Ngoài ra, mỗi câu hỏi là một **trang thảo luận** gom nhiều câu trả lời về cùng một thắc mắc, và người hỏi có thể chọn "Trường hợp của mình khác" — một biến thể ẩn danh kèm bối cảnh riêng.

Một nền tảng hỏi–đáp chung (Reddit, group Facebook) không thể trung thực sao chép điều này: chúng không biết trước danh sách câu hỏi đã có của riêng một trường, không gắn được quyền ưu tiên cho cán bộ/giảng viên, và không điều hướng người dùng về đúng phòng ban khi thông tin chưa rõ.

## Operating Context

- Nội dung bám theo vòng đời của một sinh viên ULIS: nhập học → đăng ký học phần → làm thủ tục giấy tờ (thẻ, bảo hiểm, hộ chiếu) → tìm phòng học/thầy giảng viên → hoạt động CLB, đồ án, thực tập.
- Nguồn thông tin chính thức nằm rải rác: website trường, thông báo của khoa, phòng/ban chức năng, và lịch học. Câu trả lời về thủ tục bắt buộc phải kèm đường dẫn nguồn.
- Khi thông tin chưa rõ hoặc phức tạp, KNIT không tự ý trả lời: nó điều hướng tới đầu mối/phòng ban chức năng tương ứng.
- Cộng tác viên trả lời theo chủ đề, ưu tiên sinh viên khóa trên có trải nghiệm thực tế với đúng chủ đề đó.
- Môi trường sử dụng chính là điện thoại, trong hành lang hoặc giữa giờ học, một tay cầm — nên thao tác một tay và tốc độ tìm kiếm là ưu tiên hàng đầu.

## Capabilities and Constraints

Phiên bản đầu tiên (đúng phạm vi đã chốt):

- Quản lý tài khoản người dùng và phân quyền (người hỏi / cộng tác viên / quản trị viên).
- Đăng câu hỏi mới với tiêu đề, nội dung, thẻ chủ đề và tùy chọn ẩn danh; gợi ý câu hỏi tương tự ngay khi soạn.
- Tìm kiếm theo từ khóa, lọc theo chủ đề, sắp xếp theo độ liên quan / mới nhất / nhiều trả lời nhất.
- Trả lời câu hỏi, thả tim đánh giá hữu ích, đánh dấu câu trả lời đã giải quyết.
- Theo dõi chủ đề/câu hỏi và nhận thông báo nội bộ trên website.
- Báo cáo/góp ý nội dung khi thông tin lỗi thời hoặc không chính xác.
- Biến thể "Trường hợp của mình khác" ẩn danh cho câu hỏi cần bối cảnh cá nhân.

Ràng buộc đã biết:

- Thông tin về quy định, thủ tục nhà trường bắt buộc phải kèm đường dẫn nguồn chính thức.
- Ẩn danh là mặc định cho biến thể trường hợp riêng; tài khoản đại diện (giảng viên, cán bộ lớp) được tick xanh.
- Hiển thị tối thiểu thông tin cá nhân: tên hiển thị + khoa + năm học, không công khai email/SĐT.
- Ưu tiên thiết bị di động.

## Brand Commitments

- Tên **KNIT**: nghĩa "đan" (đan/kết nối) và gợi liên tưởng tới NEED (nhu cầu cần được lắng nghe và đáp ứng). Tên do nhóm đặt và là bắt buộc.
- Giọng điệu: gần gũi, thân thiện, hướng tới sinh viên — nhưng không hời hợt, không dùng tiếng Anh trang trí. Tiếng Việt là ngôn ngữ chính.
- Bối cảnh: ULIS — Trường Đại học Ngoại ngữ, Đại học Quốc gia Hà Nội (VNU), Hà Nội.
- Bản dịch Anh ngữ là phiên bản song ngữ song song, không thay thế tiếng Việt.

## Evidence on Hand

- Tài liệu ý tưởng và mô tả dự án của nhóm (file PDF, "HACKATHON - IDEA 1"): nguồn duy nhất hiện có cho product truth.
- Không có dữ liệu người dùng thật, không có cơ sở dữ liệu câu hỏi thật, không có testimonial, không có ảnh chụp sản phẩm. Mọi câu hỏi, câu trả lời, tên người dùng, số liệu và ảnh đại diện trong bản dựng là **dữ liệu mô phỏng (synthetic)** và phải được ghi nhãn rõ ràng ở nơi người dùng có thể nhầm là thật.
- Số liệu mục tiêu trong tài liệu là chỉ tiêu kế hoạch (70–100 người đăng ký, ≥20 câu hỏi, ≥85% được trả lời, ≥80% hài lòng, ≥70% quay lại) — không phải kết quả đã đạt, không được trình bày như thành tích.

## Product Principles

1. **Hỏi một lần, đáp một lần.** Trước khi tạo trùng lặp, luôn chỉ ra đường về câu trả lời đã có.
2. **Nguồn trước, cảm xúc sau.** Mọi thông tin thủ tục đều phải truy được về nơi phát hành; nơi không có nguồn thì nói thẳng và chỉ đường đến đầu mối.
3. **Kinh nghiệm người đã đi trước là hàng hóa chính.** Cộng tác viên và tín hiệu "câu trả lời này giúp tôi" quyết định chất lượng nội dung.
4. **Tôn trọng sự riêng tư của người cần hỏi.** Ẩn danh là một tính năng chính, không phải chế độ ẩn.
5. **Một tay, một phút.** Giao diện phải trả lời được câu hỏi của sinh viên đang đứng giữa hành lang.

## Accessibility & Inclusion

- Ngôn ngữ song ngữ Việt/Anh nhằm phục vụ cả sinh viên quốc tế của ULIS — một trường chuyên về ngoại ngữ, nơi phần lớn sinh viên đang học theo chương trình song ngữ.
- Tương thích bàn phím và trình đọc màn hình là yêu cầu cơ bản cho sản phẩm dùng trên điện thoại và máy tính trong lớp.

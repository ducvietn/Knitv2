export type Role = 'student' | 'contributor' | 'staff' | 'admin'

/**
 * Bảng màu avatar dựng sẵn.
 *
 * Khớp với `AVATAR_TONES` trong `shared/types.ts`.
 */
export const AVATAR_TONES = ['brand', 'clay', 'verify', 'emerald', 'amber', 'rose'] as const

export type AvatarTone = (typeof AVATAR_TONES)[number]

export type Topic = 'hoc-tap' | 'thu-tuc' | 'doi-song' | 'clb'

export interface TopicMeta {
  id: Topic
  labelVi: string
  labelEn: string
  /** Ký hiệu dùng trên tab / nhãn */
  mark: string
  blurbVi: string
  blurbEn: string
}

export interface Author {
  id: string
  displayName: string
  /** Khoa, ví dụ "Khoa Ngôn ngữ" */
  facultyVi: string
  facultyEn: string
  /** Năm học, ví dụ "K18" */
  cohort: string
  role: Role
  /** Tài khoản đại diện: giảng viên / cán bộ lớp → tick xanh */
  verified: boolean
  avatarSeed: string
  /** Ảnh do người dùng tải lên — rỗng thì dùng avatar dựng sẵn */
  avatarUrl?: string
  /** Màu nền của avatar dựng sẵn */
  avatarTone?: AvatarTone
}

export interface Source {
  title: string
  /** Đường dẫn nguồn chính thức */
  url: string
  publisher: string
}

export interface Answer {
  id: string
  questionId: string
  author: Author
  body: string
  bodyEn: string
  createdAt: string
  helpful: number
  /** Câu trả lời được đánh dấu đã giải quyết */
  accepted: boolean
  /** Người hỏi chọn "Trường hợp của mình khác" */
  variant?: {
    /** Bối cảnh cá nhân của biến thể */
    context: string
    contextEn: string
    anonymous: boolean
  }
  /** Trường hợp chưa rõ → điều hướng tới đầu mối */
  referral?: {
    office: string
    officeEn: string
    note: string
    noteEn: string
  }
  sources: Source[]
}

export interface Question {
  id: string
  title: string
  titleEn: string
  body: string
  bodyEn: string
  topic: Topic
  author: Author
  createdAt: string
  /** Số lượt người cũng cần biết */
  alsoNeed: number
  views: number
  answered: boolean
  /** Câu hỏi chưa có câu trả lời nào */
  answerCount: number
  anonymous: boolean
  followed: boolean
  /** Có biến thể "Trường hợp của mình khác" */
  hasVariants: boolean
  tags: string[]
}

export interface Notification {
  id: string
  kind: 'answer' | 'reply' | 'follow' | 'report' | 'system'
  title: string
  titleEn: string
  body: string
  bodyEn: string
  at: string
  read: boolean
  questionId?: string
}

export interface Report {
  id: string
  questionId: string
  answerId?: string
  reason: 'outdated' | 'inaccurate' | 'insensitive' | 'other'
  detail: string
  status: 'open' | 'reviewing' | 'resolved'
  createdAt: string
}

/** Tên gọi dùng trong hợp đồng dữ liệu chung với server. */
export type PublicUser = Author

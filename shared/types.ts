/**
 * Kiểu dữ liệu dùng chung giữa server và client.
 *
 * - Client: `app/src/data/types.ts` re-export từ đây.
 * - Server: `server/src/**` import từ `../../shared/types`.
 *
 * Mọi kiểu ở đây là hình dạng dữ liệu trao đổi qua API — không chứa bí mật.
 */

export type Role = 'student' | 'contributor' | 'staff' | 'admin'

/**
 * Bảng màu avatar dựng sẵn.
 *
 * Dùng khi người dùng không muốn đăng ảnh thật — chữ cái đại diện trên nền
 * màu. Danh sách phải khớp với bảng màu ở `app/src/components/Avatar.tsx`.
 */
export const AVATAR_TONES = ['brand', 'clay', 'verify', 'emerald', 'amber', 'rose'] as const

export type AvatarTone = (typeof AVATAR_TONES)[number]

export type Topic = 'hoc-tap' | 'thu-tuc' | 'doi-song' | 'clb'

export interface TopicMeta {
  id: Topic
  labelVi: string
  labelEn: string
  mark: string
  blurbVi: string
  blurbEn: string
}

export interface PublicUser {
  id: string
  displayName: string
  facultyVi: string
  facultyEn: string
  cohort: string
  role: Role
  /** Tài khoản đại diện (giảng viên, cán bộ lớp) → tick xanh */
  verified: boolean
  avatarSeed: string
  /**
   * Ảnh avatar do người dùng tải lên.
   *
   * Rỗng = dùng avatar dựng sẵn từ `avatarSeed` + `avatarTone`.
   */
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

export interface Variant {
  /** Bối cảnh cá nhân của biến thể */
  context: string
  contextEn: string
  anonymous: boolean
}

export interface Referral {
  office: string
  officeEn: string
  note: string
  noteEn: string
}

export interface Answer {
  id: string
  questionId: string
  author: PublicUser
  body: string
  bodyEn: string
  createdAt: string
  helpful: number
  /** Câu trả lời được đánh dấu đã giải quyết */
  accepted: boolean
  variant?: Variant
  referral?: Referral
  sources: Source[]
}

export interface Question {
  id: string
  title: string
  titleEn: string
  body: string
  bodyEn: string
  topic: Topic
  author: PublicUser
  createdAt: string
  /** Số lượt người cũng cần biết */
  alsoNeed: number
  views: number
  answered: boolean
  answerCount: number
  anonymous: boolean
  followed: boolean
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

export interface Session {
  token: string
  user: PublicUser
}

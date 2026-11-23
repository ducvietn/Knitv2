import type { Topic, TopicMeta } from './types'

export const TOPICS: TopicMeta[] = [
  {
    id: 'hoc-tap',
    labelVi: 'Học tập',
    labelEn: 'Study',
    mark: 'A',
    blurbVi: 'Đăng ký học phần, lịch học, điểm, đồ án, chính sách học phí.',
    blurbEn: 'Course registration, timetables, grades, projects, tuition policy.',
  },
  {
    id: 'thu-tuc',
    labelVi: 'Thủ tục',
    labelEn: 'Procedures',
    mark: 'B',
    blurbVi: 'Thẻ sinh viên, bảo hiểm, hộ chiếu, xác nhận, giấy tờ nhà trường.',
    blurbEn: 'Student ID, insurance, passport, certification, official paperwork.',
  },
  {
    id: 'doi-song',
    labelVi: 'Đời sống',
    labelEn: 'Campus life',
    mark: 'C',
    blurbVi: 'Căn-tin, ăn uống, y tế, chỗ ở, khu vực tự học, giao thông.',
    blurbEn: 'Notices, food, health, housing, study spaces, transport.',
  },
  {
    id: 'clb',
    labelVi: 'CLB & Sự kiện',
    labelEn: 'Clubs & events',
    mark: 'D',
    blurbVi: 'Câu lạc bộ, cuộc thi, chương trình, thực tập, kết nối khóa trên.',
    blurbEn: 'Clubs, competitions, programmes, internships, senior connections.',
  },
]

export const TOPIC_MAP: Record<Topic, TopicMeta> = TOPICS.reduce(
  (acc, t) => ({ ...acc, [t.id]: t }),
  {} as Record<Topic, TopicMeta>,
)

export const ALL_TOPICS: Topic[] = TOPICS.map((t) => t.id)

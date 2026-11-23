import { useSyncExternalStore } from 'react'
import { api, getToken, setToken } from '../lib/api'
import type { Answer, Notification, PublicUser, Question, Report, Topic } from '../data/types'

/**
 * Kho trạng thái phía client của KNIT.
 *
 * Dữ liệu thật nằm trên server; lớp này giữ bản sao đang hiển thị và
 * đồng bộ lại sau mỗi thao tác ghi. Nếu không có token, app vẫn chạy ở
 * chế độ chỉ-đọc với dữ liệu mô phỏng.
 */

export interface SimilarHit {
  id: string
  title: string
  titleEn: string
  topic: Topic
  answerCount: number
  alsoNeed: number
  score: number
}

export interface KnitState {
  questions: Question[]
  answers: Answer[]
  notifications: Notification[]
  reports: Report[]
  following: string[]
  followingTopics: Topic[]
  helpful: string[]
  alsoNeed: string[]
  reported: string[]
  lang: 'vi' | 'en'
  currentUser: PublicUser | null
  /** Câu hỏi đang soạn — dùng để gợi ý câu hỏi tương tự */
  drafts: Record<string, string>
}

const LANG_KEY = 'knit.lang'

const initialState = (): KnitState => ({
  questions: [],
  answers: [],
  notifications: [],
  reports: [],
  following: [],
  followingTopics: [],
  helpful: [],
  alsoNeed: [],
  reported: [],
  lang: (localStorage.getItem(LANG_KEY) as 'vi' | 'en') ?? 'vi',
  currentUser: null,
  drafts: {},
})

export const state: KnitState = initialState()

const listeners = new Set<() => void>()

export const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Snapshot cho `useSyncExternalStore` phải là một giá trị bất biến giữa các
 * lần render — nên dùng bộ đếm phiên bản thay vì chính đối tượng `state`.
 */
let version = 0

export const getSnapshot = () => version

export const commit = () => {
  version += 1
  for (const fn of listeners) fn()
}

/**
 * Đồng bộ avatar của người dùng hiện tại vào các câu hỏi / câu trả lời đã
 * nạp — để avatar mới hiện ngay mà không cần tải lại cả trang.
 */
function syncAvatarAcross(state_: KnitState, user: PublicUser) {
  const apply = (author: PublicUser) => {
    if (author.id !== user.id) return
    author.avatarUrl = user.avatarUrl
    author.avatarTone = user.avatarTone
  }
  for (const q of state_.questions) apply(q.author)
  for (const a of state_.answers) apply(a.author)
}

/** Hook để component re-render khi kho trạng thái thay đổi. */
export const useKnit = () => useSyncExternalStore(subscribe, getSnapshot)

export const setLang = (lang: 'vi' | 'en') => {
  state.lang = lang
  localStorage.setItem(LANG_KEY, lang)
  commit()
}

export const setDraft = (key: string, value: string) => {
  state.drafts[key] = value
  commit()
}

/* --------------------------------------------------- dịch tức thì khi bấm EN */

/**
 * Người dùng bấm nút "EN" thì nội dung phải hiện tiếng Anh NGAY, không
 * cần tải lại trang.
 *
 * Vì sao cần?
 *
 * Bản dịch tiếng Anh được tạo ở chế độ nền ngay sau khi câu hỏi/câu trả
 * lời mới được đăng. Nên nếu người dùng bấm "EN" ngay sau khi đăng (hoặc
 * bấm lại nhiều lần), bản dịch có thể chưa kịp sẵn sàng — giao diện sẽ
 * hiện tiếng Việt dù đang ở chế độ EN.
 *
 * Ở đây ta kiểm tra nội dung đang hiển thị: nếu còn đoạn nào chưa có bản
 * dịch (hoặc bản dịch trùng với bản gốc) thì gọi API dịch, rồi cập nhật
 * state để giao diện vẽ lại — không reload trang.
 */

/** Kiểm tra một câu hỏi còn đoạn nào chưa được dịch không. */
const questionNeedsTranslation = (q: Question): boolean =>
  !q.titleEn ||
  q.titleEn === q.title ||
  !q.bodyEn ||
  q.bodyEn === q.body

/** Kiểm tra một câu trả lời còn đoạn nào chưa được dịch không. */
const answerNeedsTranslation = (a: Answer): boolean => {
  if (!a.bodyEn || a.bodyEn === a.body) return true
  if (a.variant && (!a.variant.contextEn || a.variant.contextEn === a.variant.context)) {
    return true
  }
  if (a.referral) {
    if (a.referral.office && (!a.referral.officeEn || a.referral.officeEn === a.referral.office)) {
      return true
    }
    if (a.referral.note && (!a.referral.noteEn || a.referral.noteEn === a.referral.note)) {
      return true
    }
  }
  return false
}

/** Đang dịch câu hỏi nào — dùng để không gọi trùng. */
const translating = new Set<string>()

/**
 * Dịch những nội dung đang hiển thị mà chưa có bản dịch.
 *
 * Hàm này KHÔNG chặn việc đổi ngôn ngữ: giao diện chuyển sang tiếng Anh
 * ngay lập tức, bản dịch về sau sẽ tự cập nhật.
 */
export const translateVisibleContent = async (): Promise<void> => {
  if (state.lang !== 'en') return

  const questions = state.questions.filter(questionNeedsTranslation)
  const answers = state.answers.filter(answerNeedsTranslation)

  if (questions.length === 0 && answers.length === 0) return

  // Bỏ qua những id đang được dịch dở để không gọi trùng.
  const questionIds = questions
    .map((q) => q.id)
    .filter((id) => !translating.has(id))
  const answerIds = answers
    .map((a) => a.id)
    .filter((id) => !translating.has(id))

  if (questionIds.length === 0 && answerIds.length === 0) return

  for (const id of [...questionIds, ...answerIds]) translating.add(id)

  try {
    const res = await api.post<{ questions: Question[]; answers: Answer[] }>('/translate', {
      questionIds,
      answerIds,
    })

    for (const q of res.questions ?? []) {
      const index = state.questions.findIndex((x) => x.id === q.id)
      if (index >= 0) state.questions[index] = q
    }
    for (const a of res.answers ?? []) {
      const index = state.answers.findIndex((x) => x.id === a.id)
      if (index >= 0) state.answers[index] = a
    }

    commit()
  } catch {
    // Dịch thất bại không được làm hỏng giao diện — người dùng vẫn đọc
    // được nội dung tiếng Việt gốc.
  } finally {
    for (const id of [...questionIds, ...answerIds]) translating.delete(id)
  }
}

/**
 * Đổi ngôn ngữ và tự dịch nếu cần.
 *
 * Hàm này được `I18nProvider` gọi khi người dùng bấm nút ngôn ngữ.
 */
export const changeLang = (lang: 'vi' | 'en') => {
  setLang(lang)
  if (lang === 'en') void translateVisibleContent()
}

/**
 * Nạp lại danh sách câu hỏi + câu trả lời rồi dịch phần còn thiếu.
 *
 * Dùng sau khi đăng câu hỏi/câu trả lời mới: nội dung mới chưa có bản
 * dịch, nên bấm "EN" phải dịch ngay thay vì chờ nền.
 */
export const refreshAndTranslate = async (): Promise<void> => {
  await refreshQuestions()
  if (state.lang === 'en') await translateVisibleContent()
}



export const login = async (email: string, password: string) => {
  const res = await api.post<{ token: string; user: PublicUser }>('/auth/login', { email, password })
  setToken(res.token)
  state.currentUser = res.user
  await refreshAll()
  return res.user
}

export const register = async (input: {
  email: string
  password: string
  displayName: string
  facultyVi: string
  facultyEn: string
  cohort: string
}) => {
  const res = await api.post<{ token: string; user: PublicUser }>('/auth/register', input)
  setToken(res.token)
  state.currentUser = res.user
  await refreshAll()
  return res.user
}

export const logout = () => {
  setToken(null)
  state.currentUser = null
  state.notifications = []
  state.following = []
  state.followingTopics = []
  state.helpful = []
  state.alsoNeed = []
  commit()
}

export const restoreSession = async () => {
  if (!getToken()) return null
  try {
    const res = await api.get<{ user: PublicUser }>('/auth/me')
    state.currentUser = res.user
    await refreshAll()
    return res.user
  } catch {
    setToken(null)
    state.currentUser = null
    return null
  }
}

/* ------------------------------------------------------------- nạp dữ liệu */

export const refreshQuestions = async (topic?: Topic) => {
  const params = new URLSearchParams()
  if (topic) params.set('topic', topic)
  const res = await api.get<{ questions: Question[] }>(`/questions?${params.toString()}`)
  state.questions = res.questions
  commit()
}

export const refreshNotifications = async () => {
  if (!getToken()) return
  try {
    const res = await api.get<{ notifications: Notification[] }>('/notifications')
    state.notifications = res.notifications
    commit()
  } catch {
    /* token hết hạn — bỏ qua */
  }
}

export const refreshMe = async () => {
  if (!getToken()) return
  try {
    const res = await api.get<{
      myQuestions: Question[]
      myAnswers: Answer[]
      followedTopics: Topic[]
      followedQuestions: Question[]
      alsoNeed: string[]
      helpful: string[]
    }>('/me')
    state.following = res.followedQuestions.map((q) => q.id)
    state.followingTopics = res.followedTopics
    state.alsoNeed = res.alsoNeed
    state.helpful = res.helpful
    // Nạp luôn câu trả lời của tôi vào state để trang cá nhân hiển thị được.
    const mine = new Set(res.myAnswers.map((a) => a.id))
    state.answers = [...state.answers.filter((a) => !mine.has(a.id)), ...res.myAnswers]
    // Câu hỏi của tôi và câu hỏi đang theo dõi cũng phải có mặt trong state.
    for (const q of [...res.myQuestions, ...res.followedQuestions]) {
      const index = state.questions.findIndex((x) => x.id === q.id)
      if (index >= 0) state.questions[index] = q
      else state.questions.unshift(q)
    }
    commit()
  } catch {
    /* bỏ qua */
  }
}

export const refreshAll = async () => {
  await Promise.all([refreshQuestions(), refreshNotifications(), refreshMe()])
}

/* ------------------------------------------------------------------ truy vấn */

export const findQuestion = (id: string) => state.questions.find((q) => q.id === id)

export const answersFor = (questionId: string) =>
  state.answers
    .filter((a) => a.questionId === questionId)
    .sort((a, b) => {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1
      return b.helpful - a.helpful
    })

export const unreadNotifications = () => state.notifications.filter((n) => !n.read).length

export const loadQuestion = async (id: string) => {
  const res = await api.get<{ question: Question; answers: Answer[] }>(`/questions/${id}`)
  const index = state.questions.findIndex((q) => q.id === id)
  if (index >= 0) state.questions[index] = res.question
  else state.questions.unshift(res.question)
  state.answers = [...state.answers.filter((a) => a.questionId !== id), ...res.answers]
  commit()
  return res
}

/**
 * Gợi ý câu hỏi tương tự — cơ chế khác biệt cốt lõi của KNIT:
 * trước khi một câu hỏi trùng lặp được đăng lên, người dùng phải thấy
 * các câu hỏi cùng chủ đề đã có câu trả lời.
 */
export const similarQuestions = async (draft: string, excludeId?: string): Promise<SimilarHit[]> => {
  if (draft.trim().length < 3) return []
  const params = new URLSearchParams({ draft })
  if (excludeId) params.set('exclude', excludeId)
  try {
    const res = await api.get<{ similar: SimilarHit[] }>(`/questions/similar?${params.toString()}`)
    return res.similar
  } catch {
    return []
  }
}

/* --------------------------------------------------------------- thao tác ghi */

export const postQuestion = async (input: {
  title: string
  body: string
  topic: Topic
  anonymous: boolean
  tags: string[]
  source?: { title: string; url: string }
}) => {
  const res = await api.post<{ question: Question }>('/questions', input)
  state.questions.unshift(res.question)
  state.following.push(res.question.id)
  commit()
  return res.question
}

export const postAnswer = async (
  questionId: string,
  input: {
    body: string
    accepted: boolean
    variant?: Answer['variant']
    referral?: Answer['referral']
    sources?: { title: string; url: string; publisher: string }[]
  },
) => {
  const res = await api.post<{ answers: Answer[] }>(`/questions/${questionId}/answers`, input)
  state.answers = [...state.answers.filter((a) => a.questionId !== questionId), ...res.answers]
  const question = findQuestion(questionId)
  if (question) {
    question.answerCount = res.answers.length
    question.answered = true
    question.hasVariants = res.answers.some((a) => a.variant)
  }
  commit()
  return res.answers
}

export const toggleHelpful = async (answerId: string) => {
  const res = await api.post<{ helpful: number }>(`/answers/${answerId}/helpful`)
  const answer = state.answers.find((a) => a.id === answerId)
  const wasLiked = state.helpful.includes(answerId)
  if (answer) answer.helpful = res.helpful
  if (wasLiked) state.helpful = state.helpful.filter((id) => id !== answerId)
  else state.helpful.push(answerId)
  commit()
}

export const acceptAnswer = async (answerId: string) => {
  const res = await api.post<{ answers: Answer[] }>(`/answers/${answerId}/accept`)
  state.answers = [
    ...state.answers.filter((a) => a.questionId !== res.answers[0]?.questionId),
    ...res.answers,
  ]
  commit()
}

export const toggleFollowQuestion = async (questionId: string) => {
  const res = await api.post<{ followed: boolean }>(`/questions/${questionId}/follow`)
  const question = findQuestion(questionId)
  if (question) question.followed = res.followed
  if (res.followed) {
    if (!state.following.includes(questionId)) state.following.push(questionId)
  } else {
    state.following = state.following.filter((id) => id !== questionId)
  }
  commit()
}

export const toggleFollowTopic = async (topic: Topic) => {
  const res = await api.post<{ following: boolean }>(`/questions/topics/${topic}/follow`)
  if (res.following) {
    if (!state.followingTopics.includes(topic)) state.followingTopics.push(topic)
  } else {
    state.followingTopics = state.followingTopics.filter((t) => t !== topic)
  }
  commit()
}

export const markAlsoNeed = async (questionId: string) => {
  const res = await api.post<{ alsoNeed: number }>(`/questions/${questionId}/also-need`)
  const question = findQuestion(questionId)
  const wasMarked = state.alsoNeed.includes(questionId)
  if (question) question.alsoNeed = res.alsoNeed
  if (wasMarked) state.alsoNeed = state.alsoNeed.filter((id) => id !== questionId)
  else state.alsoNeed.push(questionId)
  commit()
}

export const reportContent = async (input: {
  questionId: string
  answerId?: string
  reason: Report['reason']
  detail: string
}) => {
  await api.post('/reports', input)
  if (!state.reported.includes(input.questionId)) state.reported.push(input.questionId)
  await refreshNotifications()
  commit()
}

export const markAllNotificationsRead = async () => {
  await api.post('/notifications/read-all')
  state.notifications = state.notifications.map((n) => ({ ...n, read: true }))
  commit()
}

export const markNotificationRead = async (id: string) => {
  await api.post(`/notifications/${id}/read`)
  state.notifications = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
  commit()
}

/* -------------------------------------------------------- sửa / xoá nội dung */

export const updateQuestion = async (
  id: string,
  input: Partial<Pick<Question, 'title' | 'body' | 'topic' | 'anonymous' | 'tags'>>,
) => {
  const res = await api.patch<{ question: Question }>(`/questions/${id}`, input)
  const index = state.questions.findIndex((q) => q.id === id)
  if (index >= 0) state.questions[index] = res.question
  commit()
  return res.question
}

export const deleteQuestion = async (id: string) => {
  await api.delete(`/questions/${id}`)
  state.questions = state.questions.filter((q) => q.id !== id)
  state.answers = state.answers.filter((a) => a.questionId !== id)
  state.following = state.following.filter((x) => x !== id)
  state.alsoNeed = state.alsoNeed.filter((x) => x !== id)
  commit()
}

export const updateAnswer = async (
  id: string,
  input: Partial<Pick<Answer, 'body' | 'variant' | 'referral' | 'sources'>>,
) => {
  const res = await api.patch<{ answers: Answer[] }>(`/answers/${id}`, input)
  if (res.answers.length > 0) {
    const questionId = res.answers[0].questionId
    state.answers = [...state.answers.filter((a) => a.questionId !== questionId), ...res.answers]
  }
  commit()
}

export const deleteAnswer = async (id: string) => {
  const answer = state.answers.find((a) => a.id === id)
  const res = await api.delete<{ answers: Answer[] }>(`/answers/${id}`)
  if (answer && res.answers.length >= 0) {
    state.answers = [...state.answers.filter((a) => a.questionId !== answer.questionId), ...res.answers]
    const question = findQuestion(answer.questionId)
    if (question) {
      question.answerCount = res.answers.length
      question.answered = res.answers.length > 0
      question.hasVariants = res.answers.some((a) => a.variant)
    }
  }
  state.helpful = state.helpful.filter((x) => x !== id)
  commit()
}

/* -------------------------------------------------------------- hồ sơ người dùng */

export const updateProfile = async (input: {
  displayName?: string
  facultyVi?: string
  facultyEn?: string
  cohort?: string
}) => {
  const res = await api.patch<{ user: PublicUser }>('/auth/me', input)
  state.currentUser = res.user
  commit()
  return res.user
}

export const changePassword = async (currentPassword: string, newPassword: string) => {
  await api.post('/auth/password', { currentPassword, newPassword })
}

/** Tải ảnh avatar lên và cập nhật hồ sơ hiện tại. */
export const uploadAvatar = async (dataUrl: string) => {
  const res = await api.post<{ user: PublicUser }>('/avatar', { dataUrl })
  state.currentUser = res.user
  syncAvatarAcross(state, res.user)
  commit()
  return res.user
}

/** Chọn màu cho avatar dựng sẵn (chữ cái đại diện). */
export const updateAvatarTone = async (tone: string) => {
  const res = await api.patch<{ user: PublicUser }>('/avatar/tone', { tone })
  state.currentUser = res.user
  syncAvatarAcross(state, res.user)
  commit()
  return res.user
}

/** Bỏ ảnh đã tải, quay lại dùng chữ cái đại diện. */
export const removeAvatar = async () => {
  const res = await api.delete<{ user: PublicUser }>('/avatar')
  state.currentUser = res.user
  syncAvatarAcross(state, res.user)
  commit()
  return res.user
}

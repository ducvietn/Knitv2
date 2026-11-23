import { createContext, useContext } from 'react'
import { state } from '../store/knit'

export type Lang = 'vi' | 'en'

/**
 * Chọn bản chữ theo ngôn ngữ hiện tại. Mọi nội dung song ngữ trong dữ liệu
 * đều theo cặp `vi` / `en`, nên chỉ cần một hàm chọn là đủ.
 */
export const pick = <T extends Record<string, unknown>, K extends keyof T>(
  pair: { vi: T[K] } & { en: T[K] },
  lang: Lang = state.lang,
): T[K] => pair[lang]

export interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (vi: string, en: string) => string
  /** Chọn trường theo ngôn ngữ: `pick({ vi: q.title, en: q.titleEn })` */
  bi: <T>(vi: T, en: T) => T
}

export const I18nContext = createContext<I18n>({
  lang: 'vi',
  setLang: () => {},
  t: (vi) => vi,
  bi: (vi) => vi,
})

export const useI18n = () => useContext(I18nContext)

/** Định dạng ngày theo ngôn ngữ. */
export const formatDate = (iso: string, lang: Lang = state.lang) =>
  new Date(iso).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

export const formatDateTime = (iso: string, lang: Lang = state.lang) =>
  new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** "3 giờ trước" / "3 hours ago" */
export const relativeTime = (iso: string, lang: Lang = state.lang) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return lang === 'vi' ? 'vừa xong' : 'just now'
  if (mins < 60) return lang === 'vi' ? `${mins} phút trước` : `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return lang === 'vi' ? `${hours} giờ trước` : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days < 30) return lang === 'vi' ? `${days} ngày trước` : `${days} days ago`
  const months = Math.round(days / 30)
  if (months < 12) return lang === 'vi' ? `${months} tháng trước` : `${months} months ago`
  return formatDate(iso, lang)
}

export const formatCount = (n: number, lang: Lang = state.lang) =>
  n.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')

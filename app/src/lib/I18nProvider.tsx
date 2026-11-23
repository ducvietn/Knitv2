import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { changeLang, state, subscribe } from '../store/knit'
import { I18nContext, type Lang } from './i18n'

/**
 * Cầu nối ngôn ngữ cho toàn app. Ngôn ngữ lưu trong store chung nên đổi
 * ngôn ngữ ở header sẽ áp dụng ngay cho mọi màn hình.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLocalLang] = useState<Lang>(state.lang)

  // Đồng bộ khi store đổi từ nơi khác (ví dụ sau khi reload).
  useMemo(() => subscribe(() => setLocalLang(state.lang)), [])

  const handleSetLang = useCallback((next: Lang) => {
    /**
     * `changeLang` (không phải `setLang`) vì nó còn kích hoạt dịch tức thì:
     * bấm "EN" thì nội dung chưa có bản dịch sẽ được dịch ngay và cập
     * nhật giao diện — không cần tải lại trang.
     */
    changeLang(next)
    setLocalLang(next)
  }, [])

  const value = useMemo(
    () => ({
      lang,
      setLang: handleSetLang,
      t: (vi: string, en: string) => (lang === 'vi' ? vi : en),
      bi: <T,>(vi: T, en: T) => (lang === 'vi' ? vi : en),
    }),
    [lang, handleSetLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

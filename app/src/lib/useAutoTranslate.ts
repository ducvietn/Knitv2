import { useEffect } from 'react'
import { state, translateVisibleContent, useKnit } from '../store/knit'

/**
 * Dịch nội dung đang hiển thị khi người dùng đang ở chế độ tiếng Anh.
 *
 * Hook này gắn vào mọi trang: mỗi khi danh sách câu hỏi / câu trả lời trong
 * store thay đổi (nạp trang mới, mở một câu hỏi, đăng câu hỏi mới…), nếu
 * đang ở chế độ "EN" mà nội dung còn thiếu bản dịch thì dịch ngay và cập
 * nhật giao diện — không cần người dùng tải lại trang.
 *
 * Bản dịch được ghi vào database nên lần sau nội dung đã có sẵn, không gọi
 * API lại.
 */
export function useAutoTranslate(): void {
  useKnit()

  useEffect(() => {
    if (state.lang !== 'en') return
    void translateVisibleContent()
  })
}

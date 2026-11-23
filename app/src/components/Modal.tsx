import { useEffect, useRef } from 'react'

/**
 * Hộp thoại dạng modal. Khoá cuộn trang, đóng bằng Escape, focus vào phần tử
 * đầu tiên khi mở và trả focus về nút đã mở khi đóng.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, button, [tabindex]:not([tabindex="-1"])',
      )
      target?.focus()
    }, 30)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      window.clearTimeout(timer)
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 animate-fade-in bg-brand-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 max-h-[92vh] w-full ${widths[size]} animate-fade-up overflow-y-auto scrollbar-slim rounded-t-2xl border border-paper-300 bg-white shadow-lift sm:rounded-2xl`}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-paper-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-ink-faint transition hover:bg-paper-200 hover:text-ink"
            aria-label="Đóng"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5 fill-current">
              <path d="M6.4 5 5 6.4 8.6 10 5 13.6 6.4 15 10 11.4 13.6 15 15 13.6 11.4 10 15 6.4 13.6 5 10 8.6 6.4 5Z" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-paper-200 bg-paper-50/95 px-5 py-3 backdrop-blur">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
/**
 * 软件著作权弹窗：展示《计算机软件著作权登记证书》图片。
 */
import { useEffect } from 'react'
import { Button } from './ui'

export function CopyrightDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Escape 关闭 + 打开时锁定滚动
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="软件著作权登记证书"
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-xl border bg-card text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b p-3.5">
          <h2 className="text-[14px] font-semibold tracking-tight">软件著作权登记证书</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </Button>
        </div>
        <div className="p-3">
          <img
            src="/soft-copyright.jpg"
            alt="计算机软件著作权登记证书"
            className="mx-auto max-h-[76vh] w-auto rounded-md"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 软件著作权弹窗：展示《计算机软件著作权登记证书》。
 */
import { useEffect } from 'react'
import { Button } from './ui'

export interface CopyrightInfo {
  softwareName: string
  version: string
  certificateNo: string
  registrationNo: string
  owner: string
  date: string
}

export const COPYRIGHT: CopyrightInfo = {
  softwareName: '水工钢筋混凝土肋形楼盖辅助设计系统',
  version: 'V1.0',
  certificateNo: '软著登字第17733114号',
  registrationNo: '2026SR0518833',
  owner: '华南农业大学',
  date: '2026年04月01日',
}

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
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-xl border bg-card text-card-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">计算机软件著作权登记证书</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              登记号 {COPYRIGHT.registrationNo} ｜ 证书号 {COPYRIGHT.certificateNo}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </Button>
        </div>
        <div className="p-4">
          <img
            src="/soft-copyright.jpg"
            alt="计算机软件著作权登记证书：软件名称 水工钢筋混凝土肋形楼盖辅助设计系统 V1.0，著作权人 华南农业大学，登记号 2026SR0518833"
            className="mx-auto max-h-[70vh] w-auto rounded-md border"
            loading="lazy"
          />
          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            <Info label="软件名称" value={`${COPYRIGHT.softwareName} ${COPYRIGHT.version}`} />
            <Info label="著作权人" value={COPYRIGHT.owner} />
            <Info label="登记号" value={COPYRIGHT.registrationNo} />
            <Info label="证书号" value={COPYRIGHT.certificateNo} />
            <Info label="权利取得方式" value="原始取得" />
            <Info label="权利范围" value="全部权利" />
            <Info label="登记日期" value={COPYRIGHT.date} />
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            本软件已依法在国家版权局完成计算机软件著作权登记。根据《计算机软件保护条例》，未经著作权人许可，任何人不得复制、修改或传播本软件的其中受保护部分。
          </p>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="flex-none text-muted-foreground">{label}：</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

/**
 * Nueva toast system — top-center messages matching staging's save feedback
 * (antd-style "Settings saved successfully."). Module-level store so any code
 * can fire `toast.success(...)` without prop drilling; <ToastHost/> renders them.
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'info'
/** additive (2026-10-06): one button on a toast (Undo, Share) — such a toast stays 8 s */
export interface ToastAction { label: string; onClick: () => void }
interface ToastMsg { id: number; tone: ToastTone; text: string; action?: ToastAction }

let nextId = 1
let listeners: ((msgs: ToastMsg[]) => void)[] = []
let msgs: ToastMsg[] = []

function push(tone: ToastTone, text: string, opts?: { action?: ToastAction }) {
  const m: ToastMsg = { id: nextId++, tone, text, action: opts?.action }
  msgs = [...msgs, m]
  listeners.forEach((l) => l(msgs))
  setTimeout(() => dismiss(m.id), m.action ? 8000 : 3500)
}
function dismiss(id: number) {
  msgs = msgs.filter((m) => m.id !== id)
  listeners.forEach((l) => l(msgs))
}

export const toast = {
  success: (text: string, opts?: { action?: ToastAction }) => push('success', text, opts),
  error: (text: string, opts?: { action?: ToastAction }) => push('error', text, opts),
  info: (text: string, opts?: { action?: ToastAction }) => push('info', text, opts),
}

const TONE_ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2, error: AlertCircle, info: Info,
}
const TONE_CLR: Record<ToastTone, string> = {
  success: 'text-success-fg', error: 'text-danger-fg', info: 'text-info-fg',
}

export function ToastHost() {
  const [list, setList] = useState<ToastMsg[]>(msgs)
  useEffect(() => {
    listeners.push(setList)
    return () => { listeners = listeners.filter((l) => l !== setList) }
  }, [])
  if (!list.length) return null
  return (
    <div className="fe-nueva fixed left-1/2 top-5 z-[100] -translate-x-1/2 flex flex-col items-center gap-2">
      {list.map((m) => {
        const Icon = TONE_ICON[m.tone]
        return (
          <div key={m.id}
            className="flex items-center gap-2.5 rounded-xl bg-surface border border-line shadow-ds-overlay pl-3.5 pr-2 py-2.5 text-[13px] text-ink animate-[toast-in_.18s_ease-out]">
            <Icon size={16} className={TONE_CLR[m.tone]} />
            <span>{m.text}</span>
            {m.action && (
              <button type="button" onClick={() => { dismiss(m.id); m.action?.onClick() }}
                className="ml-1 h-6 rounded-md px-2 text-[13px] font-bold text-brand-500 hover:bg-brand-50">{m.action.label}</button>
            )}
            <button onClick={() => dismiss(m.id)} className="ml-1 h-6 w-6 inline-flex items-center justify-center rounded-md text-warm-400 hover:text-ink-2 hover:bg-warm-100">
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

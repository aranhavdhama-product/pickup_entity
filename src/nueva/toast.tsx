/**
 * Nueva toast system — top-center messages matching staging's save feedback
 * (antd-style "Settings saved successfully."). Module-level store so any code
 * can fire `toast.success(...)` without prop drilling; <ToastHost/> renders them.
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export type ToastTone = 'success' | 'error' | 'info'
interface ToastMsg { id: number; tone: ToastTone; text: string }

let nextId = 1
let listeners: ((msgs: ToastMsg[]) => void)[] = []
let msgs: ToastMsg[] = []

function push(tone: ToastTone, text: string) {
  const m = { id: nextId++, tone, text }
  msgs = [...msgs, m]
  listeners.forEach((l) => l(msgs))
  setTimeout(() => dismiss(m.id), 3500)
}
function dismiss(id: number) {
  msgs = msgs.filter((m) => m.id !== id)
  listeners.forEach((l) => l(msgs))
}

export const toast = {
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text),
  info: (text: string) => push('info', text),
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
            <button onClick={() => dismiss(m.id)} className="ml-1 h-6 w-6 inline-flex items-center justify-center rounded-md text-warm-400 hover:text-ink-2 hover:bg-warm-100">
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

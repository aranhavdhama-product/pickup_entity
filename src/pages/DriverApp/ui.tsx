/**
 * FarEye Pilot look (from the Play Store / App Store listings): light grey
 * canvas, white 12–16px cards with a soft shadow, navy text, blue links,
 * red-orange primary + soft-pink secondary, 13/15/17px type, underline tabs,
 * swipe-to-confirm CTAs. Only this surface uses these values.
 */
import { useEffect, useRef, useState } from 'react'
import { ChartColumn, Bell, ChevronLeft, ChevronsRight, House, MessageCircle, X } from 'lucide-react'
import { onPhoneToast, type PhoneToastMsg } from './phoneToast'

/* ------------------------------------------------------------- frame ---- */

/**
 * The app shell — a real full-viewport mobile page, NOT a drawn phone. Demo it
 * with DevTools device mode (iPhone 12/14 Pro, Pixel 7): the shell fills the
 * viewport (100dvh, which tracks the mobile URL bar), respects the notch / home
 * indicator via env(safe-area-inset-*), and each Screen scrolls its own body so
 * the header stays pinned at the top and the bottom nav at the viewport bottom.
 * On a wide desktop window the column is simply capped at 480px and centred.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fe-nueva min-h-[100dvh] w-full overflow-x-hidden bg-[#F4F6F9]">
      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-[#F4F6F9]
                      pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]
                      min-[481px]:border-x min-[481px]:border-[#E3E8EF]">
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}

/** A screen: sticky header, scrolling body, optional sticky footer. */
export function Screen({ header, footer, nav, children, bodyClass = '' }: {
  header?: React.ReactNode; footer?: React.ReactNode; nav?: React.ReactNode; children: React.ReactNode; bodyClass?: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${bodyClass}`}>
        {children}
        {!footer && !nav && <div aria-hidden className="h-[env(safe-area-inset-bottom)]" />}
      </div>
      {footer && (
        <div className={`shrink-0 border-t border-[#E3E8EF] bg-white px-4 pt-3 ${nav ? 'pb-4' : 'pb-[calc(16px+env(safe-area-inset-bottom))]'}`}>{footer}</div>
      )}
      {nav}
    </div>
  )
}

export function TopBar({ title, sub, onBack, right }: {
  title: React.ReactNode; sub?: React.ReactNode; onBack?: () => void; right?: React.ReactNode
}) {
  return (
    <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[#E3E8EF] bg-white px-2 py-2">
      {onBack ? (
        <button type="button" aria-label="Back" onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#1B2A41] hover:bg-[#F4F6F9]">
          <ChevronLeft size={22} />
        </button>
      ) : <span className="w-2" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-bold text-[#1B2A41]">{title}</div>
        {sub && <div className="truncate text-[13px] text-[#5B6B82]">{sub}</div>}
      </div>
      {right && <div className="flex items-center gap-0.5 pr-1">{right}</div>}
    </div>
  )
}

export function IconBtn({ label, onClick, children, tone = 'plain' }: {
  label: string; onClick?: () => void; children: React.ReactNode; tone?: 'plain' | 'soft'
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors
        ${tone === 'soft' ? 'bg-[#E6EFF9] text-[#2F6FB5] hover:bg-[#D6E5F5]' : 'text-[#1B2A41] hover:bg-[#F4F6F9]'}`}>
      {children}
    </button>
  )
}

/* -------------------------------------------------------------- cards ---- */

export function Card({ children, onClick, className = '', pad = 'normal' }: {
  children: React.ReactNode; onClick?: () => void; className?: string; pad?: 'normal' | 'tight' | 'none'
}) {
  const padCls = pad === 'none' ? '' : pad === 'tight' ? 'px-4 py-3' : 'p-4'
  const cls = `w-full rounded-2xl bg-white ${padCls} text-left shadow-[0_2px_10px_rgba(27,42,65,0.07)] ${className}`
  if (onClick) {
    return (
      <div role="button" tabIndex={0} onClick={onClick}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
        className={`${cls} cursor-pointer transition-shadow hover:shadow-[0_4px_16px_rgba(27,42,65,0.12)]`}>{children}</div>
    )
  }
  return <div className={cls}>{children}</div>
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pb-2 pt-4">
      <span className="text-[13px] font-bold uppercase tracking-wide text-[#8A97AB]">{children}</span>
      {right}
    </div>
  )
}

/* -------------------------------------------------------------- chips ---- */

export type ChipTone = 'delivery' | 'pickup' | 'green' | 'amber' | 'red' | 'grey' | 'blue'
const CHIP: Record<ChipTone, string> = {
  delivery: 'bg-[#E6EFF9] text-[#2F6FB5]',
  pickup: 'bg-[#FDEBE3] text-[#B8431E]',
  green: 'bg-[#E3F5EA] text-[#1C7C45]',
  amber: 'bg-[#FDF3DC] text-[#94620F]',
  red: 'bg-[#FDE8E8] text-[#B42323]',
  grey: 'bg-[#EEF1F5] text-[#5B6B82]',
  blue: 'bg-[#E6EFF9] text-[#2F6FB5]',
}
export function Chip({ tone, children, icon }: { tone: ChipTone; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className={`inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold ${CHIP[tone]}`}>
      {icon}<span className="truncate">{children}</span>
    </span>
  )
}

/* ------------------------------------------------------------ buttons ---- */

export function Btn({ children, onClick, tone = 'primary', disabled, icon, className = '', size = 'md' }: {
  children: React.ReactNode; onClick?: () => void; tone?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  disabled?: boolean; icon?: React.ReactNode; className?: string; size?: 'md' | 'sm'
}) {
  const tones = {
    primary: 'bg-[#D9542B] text-white hover:bg-[#C4471F]',
    secondary: 'bg-[#F4B8A6] text-[#7A2E14] hover:bg-[#EFA792]',
    outline: 'border border-[#D9542B] bg-white text-[#D9542B] hover:bg-[#FDF1EC]',
    ghost: 'bg-transparent text-[#2F6FB5] hover:bg-[#E6EFF9]',
    danger: 'border border-[#E9B4B4] bg-white text-[#B42323] hover:bg-[#FDE8E8]',
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors
        ${size === 'sm' ? "relative h-8 px-2.5 text-[13px] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']" : 'h-12 px-4 text-[15px]'}
        disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]} ${className}`}>
      {icon}{children}
    </button>
  )
}

/**
 * Swipe-to-confirm. Drag the knob to the end — or tap the bar (the prototype
 * accepts a tap too, so a reviewer on a trackpad is not fighting it).
 */
export function SwipeButton({ label, onConfirm, disabled, tone = 'primary' }: {
  label: string; onConfirm: () => void; disabled?: boolean; tone?: 'primary' | 'green'
}) {
  const track = useRef<HTMLDivElement>(null)
  const start = useRef(0)
  const moved = useRef(false)
  const [x, setX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const max = () => (track.current ? track.current.clientWidth - 52 : 260)
  const bg = tone === 'green' ? 'bg-[#1F9D55]' : 'bg-[#D9542B]'
  const fire = () => { if (!disabled) { setX(0); onConfirm() } }
  return (
    <div ref={track} role="button" tabIndex={disabled ? -1 : 0} aria-label={label} aria-disabled={disabled}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire() } }}
      onClick={fire}
      className={`relative h-[52px] w-full select-none overflow-hidden rounded-full ${bg} ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pl-10 text-[15px] font-bold text-white">
        {label}
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          start.current = e.clientX - x
          moved.current = false
          setDragging(true)
        }}
        onPointerMove={(e) => {
          if (!dragging) return
          const nx = Math.min(max(), Math.max(0, e.clientX - start.current))
          if (nx > 4) moved.current = true
          setX(nx)
        }}
        onPointerUp={() => {
          if (!dragging) return
          setDragging(false)
          if (!moved.current || x >= max() * 0.85) fire()
          else setX(0)
        }}
        onPointerCancel={() => { setDragging(false); setX(0) }}
        style={{ transform: `translateX(${x}px)`, transition: dragging ? 'none' : 'transform 160ms ease-out', touchAction: 'none' }}
        className={`absolute left-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow
          ${tone === 'green' ? 'text-[#1F9D55]' : 'text-[#D9542B]'}`}
      >
        <ChevronsRight size={22} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- tabs ---- */

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { id: T; label: string }[]
}) {
  return (
    <div className="flex shrink-0 border-b border-[#E3E8EF] bg-white">
      {items.map((t) => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={`relative h-11 flex-1 text-[15px] font-bold ${value === t.id ? 'text-[#D9542B]' : 'text-[#8A97AB]'}`}>
          {t.label}
          {value === t.id && <span className="absolute bottom-0 left-1/2 h-[3px] w-16 -translate-x-1/2 rounded-t bg-[#D9542B]" />}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- sheets ---- */

export function Sheet({ title, onClose, children, footer }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#11161F]/45" />
      <div className="relative flex max-h-[88%] flex-col rounded-t-[20px] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#D5DBE4]" />
        <div className="flex items-center justify-between px-4 pb-2 pt-2">
          <div className="text-[17px] font-bold text-[#1B2A41]">{title}</div>
          <IconBtn label="Close" onClick={onClose}><X size={18} /></IconBtn>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto px-4 ${footer ? 'pb-4' : 'pb-[calc(16px+env(safe-area-inset-bottom))]'}`}>{children}</div>
        {footer && <div className="border-t border-[#E3E8EF] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>
  )
}

/** A tappable list of reasons (radio look). */
export function ReasonList({ options, value, onChange }: {
  options: { code: string; label: string }[]; value: string; onChange: (code: string) => void
}) {
  return (
    <div className="divide-y divide-[#EEF1F5] rounded-xl border border-[#E3E8EF]">
      {options.map((r) => (
        <button key={r.code} type="button" onClick={() => onChange(r.code)}
          className="flex w-full items-center gap-3 px-3 py-3 text-left text-[15px] text-[#1B2A41] hover:bg-[#F8FAFC]">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${value === r.code ? 'border-[#D9542B]' : 'border-[#C3CCD8]'}`}>
            {value === r.code && <span className="h-2.5 w-2.5 rounded-full bg-[#D9542B]" />}
          </span>
          {r.label}
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({ value, max, tone = 'orange' }: { value: number; max: number; tone?: 'orange' | 'green' }) {
  const pct = max ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E9EDF2]">
      <div className={`h-full rounded-full transition-[width] ${tone === 'green' ? 'bg-[#1F9D55]' : 'bg-[#D9542B]'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ------------------------------------------------------------- toasts ---- */

export function PhoneToastHost() {
  const [items, setItems] = useState<PhoneToastMsg[]>([])
  useEffect(() => onPhoneToast((m) => {
    setItems((xs) => [...xs.slice(-2), m])
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== m.id)), 3200)
  }), [])
  if (!items.length) return null
  return (
    <div className="pointer-events-none absolute inset-x-3 top-[calc(12px+env(safe-area-inset-top))] z-50 flex flex-col gap-2">
      {items.map((m) => (
        <div key={m.id} role="status"
          className={`rounded-xl px-4 py-3 text-[13px] font-bold text-white shadow-lg
            ${m.tone === 'success' ? 'bg-[#1C7C45]' : m.tone === 'error' ? 'bg-[#B42323]' : 'bg-[#1B2A41]'}`}>
          {m.text}
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------- bottom nav ---- */

export function BottomNav({ active, onHome, onOther }: {
  active: 'home'; onHome: () => void; onOther: (label: string) => void
}) {
  const items: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <HomeIcon /> },
    { id: 'chat', label: 'Chat', icon: <MessageCircle size={21} /> },
    { id: 'perf', label: 'Performance', icon: <ChartColumn size={21} /> },
    { id: 'notif', label: 'Notification', icon: <Bell size={21} /> },
  ]
  return (
    <nav className="flex shrink-0 border-t border-[#E3E8EF] bg-white pb-[calc(4px+env(safe-area-inset-bottom))] pt-1.5">
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => (it.id === 'home' ? onHome() : onOther(it.label))}
          className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-bold ${it.id === active ? 'text-[#D9542B]' : 'text-[#8A97AB]'}`}>
          {it.icon}{it.label}
        </button>
      ))}
    </nav>
  )
}
const HomeIcon = () => <House size={21} />

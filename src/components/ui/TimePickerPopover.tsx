import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface TimePickerPopoverProps {
  value: string                 // "HH:MM" in 24h
  onCommit: (v: string) => void // user picked OK / Now
  onClose: () => void
  anchorRect: DOMRect | null
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

export default function TimePickerPopover({
  value,
  onCommit,
  onClose,
  anchorRect,
}: TimePickerPopoverProps) {
  const [hh, setHh] = useState(value.slice(0, 2))
  const [mm, setMm] = useState(value.slice(3, 5))
  const containerRef = useRef<HTMLDivElement>(null)
  const hoursRef = useRef<HTMLDivElement>(null)
  const minsRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Position below the anchor, flip up if not enough space
  useLayoutEffect(() => {
    if (!anchorRect) return
    const popoverH = 282
    const popoverW = 220
    const margin = 6
    const viewportH = window.innerHeight
    const viewportW = window.innerWidth

    let top = anchorRect.bottom + margin
    if (top + popoverH > viewportH - 8) {
      top = Math.max(8, anchorRect.top - popoverH - margin)
    }
    let left = anchorRect.left
    if (left + popoverW > viewportW - 8) {
      left = Math.max(8, viewportW - popoverW - 8)
    }
    setPos({ top, left })
  }, [anchorRect])

  // Scroll selected items into view on open
  useEffect(() => {
    const scrollToSelected = (container: HTMLDivElement | null, selector: string) => {
      if (!container) return
      const sel = container.querySelector<HTMLElement>(selector)
      if (sel) sel.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
    scrollToSelected(hoursRef.current, '[data-selected="true"]')
    scrollToSelected(minsRef.current, '[data-selected="true"]')
  }, [])

  // Click-outside / Esc to close
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const commit = () => onCommit(`${hh}:${mm}`)

  const now = () => {
    const d = new Date()
    const nhh = d.getHours().toString().padStart(2, '0')
    const nmm = d.getMinutes().toString().padStart(2, '0')
    setHh(nhh); setMm(nmm)
    onCommit(`${nhh}:${nmm}`)
  }

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      style={{
        top: pos.top, left: pos.left, position: 'fixed', width: 220, zIndex: 1100,
        boxShadow: '0 10px 28px -6px rgba(15, 23, 42, 0.18), 0 4px 10px -3px rgba(15, 23, 42, 0.08)',
        animation: 'fareye-pop-in 130ms ease-out',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
      className="bg-white rounded-lg border border-gray-200 select-none overflow-hidden"
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="grid grid-cols-2">
        <div ref={hoursRef} className="h-[226px] overflow-y-auto border-r border-gray-100 py-1.5">
          {HOURS.map(h => {
            const selected = h === hh
            return (
              <button
                key={h}
                data-selected={selected}
                onClick={() => setHh(h)}
                className={`block w-full text-center py-2 text-[14px] tabular-nums leading-[1.2] transition-colors
                  ${selected
                    ? 'bg-[#FFEDE5] text-[#E84E1B] font-semibold'
                    : 'text-gray-700 font-medium hover:bg-gray-50 hover:text-gray-900'}`}
                style={{ fontFamily: 'inherit' }}
              >
                {h}
              </button>
            )
          })}
        </div>
        <div ref={minsRef} className="h-[226px] overflow-y-auto py-1.5">
          {MINUTES.map(m => {
            const selected = m === mm
            return (
              <button
                key={m}
                data-selected={selected}
                onClick={() => setMm(m)}
                className={`block w-full text-center py-2 text-[14px] tabular-nums leading-[1.2] transition-colors
                  ${selected
                    ? 'bg-[#FFEDE5] text-[#E84E1B] font-semibold'
                    : 'text-gray-700 font-medium hover:bg-gray-50 hover:text-gray-900'}`}
                style={{ fontFamily: 'inherit' }}
              >
                {m}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2.5 bg-white">
        <button
          onClick={now}
          className="text-[14px] font-semibold text-[#E84E1B] hover:underline underline-offset-2 leading-none"
          style={{ fontFamily: 'inherit' }}
        >
          Now
        </button>
        <button
          onClick={commit}
          className="px-5 py-1.5 rounded text-[14px] font-semibold text-white bg-[#E84E1B] hover:bg-[#d44218] transition-colors leading-none"
          style={{ fontFamily: 'inherit' }}
        >
          OK
        </button>
      </div>
    </div>,
    document.body,
  )
}

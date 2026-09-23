import { useState, useRef, useEffect, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'

interface ResizableSplitProps {
  left: ReactNode
  right: ReactNode
  defaultLeftWidth?: number
  minLeft?: number
  maxLeft?: number
  storageKey?: string
}

export default function ResizableSplit({
  left,
  right,
  defaultLeftWidth = 580,
  minLeft = 320,
  maxLeft = 1100,
  storageKey,
}: ResizableSplitProps) {
  const initial = storageKey
    ? Number(localStorage.getItem(storageKey)) || defaultLeftWidth
    : defaultLeftWidth
  const [leftWidth, setLeftWidth] = useState<number>(initial)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - rect.left
      const clamped = Math.max(minLeft, Math.min(maxLeft, newWidth))
      // Also don't let the right side shrink below 280px
      const maxAllowed = rect.width - 280
      setLeftWidth(Math.min(clamped, maxAllowed))
    }
    const handleUp = () => setIsDragging(false)

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging, minLeft, maxLeft])

  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, String(leftWidth))
  }, [leftWidth, storageKey])

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden">
      <div
        style={{ width: leftWidth }}
        className="flex-shrink-0 overflow-hidden flex flex-col"
      >
        {left}
      </div>

      {/* Draggable divider */}
      <div
        onMouseDown={() => setIsDragging(true)}
        className={`group relative w-2 mx-0.5 flex-shrink-0 cursor-col-resize flex items-center justify-center
          ${isDragging ? 'bg-[#E84E1B]/20' : 'hover:bg-gray-200'}`}
        title="Drag to resize"
      >
        <div className={`w-0.5 h-full ${isDragging ? 'bg-[#E84E1B]' : 'bg-transparent group-hover:bg-gray-300'} transition-colors`} />
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-10 rounded flex items-center justify-center transition-colors
            ${isDragging ? 'bg-[#E84E1B] text-white' : 'bg-white border border-gray-200 text-gray-400 opacity-0 group-hover:opacity-100'}`}
        >
          <GripVertical size={12} />
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {right}
      </div>
    </div>
  )
}

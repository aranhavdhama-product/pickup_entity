import { useRef, useState } from 'react'
import { Clock, X } from 'lucide-react'
import TimePickerPopover from './TimePickerPopover'

interface EditableTimeInputProps {
  value: string                  // "HH:MM"
  onChange: (v: string) => void
  modified?: boolean
  originalValue?: string
}

export default function EditableTimeInput({
  value, onChange, modified = false, originalValue,
}: EditableTimeInputProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const openPicker = () => {
    if (wrapRef.current) setAnchorRect(wrapRef.current.getBoundingClientRect())
    setOpen(true)
  }

  const clearOrRevert = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (originalValue && originalValue !== value) {
      onChange(originalValue)
    }
  }

  return (
    <>
      <div
        ref={wrapRef}
        onClick={e => { e.stopPropagation(); openPicker() }}
        className={`relative inline-flex items-center gap-1 rounded border px-2 py-1 bg-white cursor-pointer transition-colors
          ${open
            ? 'border-[#E84E1B] ring-1 ring-[#E84E1B]'
            : modified
              ? 'border-[#E84E1B]'
              : 'border-gray-300 hover:border-gray-400'}`}
        style={{ width: 92 }}
      >
        <span
          className={`text-[13px] font-medium tabular-nums leading-none flex-1
            ${modified ? 'text-[#E84E1B]' : 'text-gray-800'}`}
        >
          {value}
        </span>
        {open && originalValue && originalValue !== value ? (
          <button
            onClick={clearOrRevert}
            className="w-4 h-4 rounded-full bg-gray-300 hover:bg-gray-400 flex items-center justify-center text-white"
            title="Revert"
          >
            <X size={10} strokeWidth={3} />
          </button>
        ) : (
          <Clock size={13} className="text-gray-400" strokeWidth={2} />
        )}
      </div>

      {open && (
        <TimePickerPopover
          value={value}
          anchorRect={anchorRect}
          onCommit={(v) => { onChange(v); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

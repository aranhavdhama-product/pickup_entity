import { ChevronDown, Calendar } from 'lucide-react'

interface FilterPillProps {
  label: string
  withCalendar?: boolean
  active?: boolean
  onClick?: () => void
}

export default function FilterPill({ label, withCalendar, active, onClick }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
        ${active
          ? 'border-[#E84E1B] text-[#E84E1B] bg-white'
          : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'
        }`}
    >
      {label}
      {withCalendar && <Calendar size={12} />}
      {!withCalendar && <ChevronDown size={12} />}
    </button>
  )
}

interface StatusBadgeProps {
  status: string
}

const statusConfig: Record<string, { bg: string; text: string; border: string }> = {
  'Un-Assigned': { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200' },
  'Assigned':    { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
  'In-Progress': { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
  'Completed':   { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig['Un-Assigned']
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${config.bg} ${config.text} ${config.border}`}>
      {status}
    </span>
  )
}

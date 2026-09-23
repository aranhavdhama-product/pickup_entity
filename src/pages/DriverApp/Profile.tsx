import { BadgeCheck, ChevronRight, IdCard, LogOut, Settings, Truck } from 'lucide-react'
import { Card, Chip, Screen, TopBar } from './ui'
import { phoneToast } from './phoneToast'
import { driverId, initials } from './model'

export default function ProfileScreen({ driver, vehicle, hub, onBack, onLogout }: {
  driver: string; vehicle: string | null; hub: string; onBack: () => void; onLogout: () => void
}) {
  const rows: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean }[] = [
    { icon: <Truck size={18} />, label: 'Vehicle information', sub: vehicle ?? 'No vehicle assigned', onClick: () => phoneToast(vehicle ? `${vehicle} · 2-wheeler van (mock)` : 'No vehicle assigned') },
    { icon: <Settings size={18} />, label: 'Settings', sub: 'Language, notifications, app version', onClick: () => phoneToast('Settings are not part of the prototype') },
    { icon: <LogOut size={18} />, label: 'Logout', onClick: onLogout, danger: true },
  ]
  return (
    <Screen header={<TopBar title="Profile" onBack={onBack} />} bodyClass="px-4 pb-6">
      <div className="flex flex-col items-center pt-6">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1B2A41] text-[28px] font-bold text-white">{initials(driver)}</span>
        <div className="mt-3 text-[20px] font-bold text-[#1B2A41]">{driver}</div>
        <div className="text-[13px] text-[#5B6B82]">{driverId(driver)}{hub ? ` · ${hub}` : ''}</div>
      </div>
      <Card className="mt-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E3F5EA] text-[#1C7C45]"><IdCard size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-[#1B2A41]">Digital pass</div>
            <div className="text-[13px] text-[#5B6B82]">Show at the hub gate and merchant dock</div>
          </div>
          <Chip tone="green" icon={<BadgeCheck size={12} />}>Active</Chip>
        </div>
      </Card>
      <Card className="mt-3" pad="none">
        {rows.map((r, i) => (
          <button key={r.label} type="button" onClick={r.onClick}
            className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${i ? 'border-t border-[#EEF1F5]' : ''}`}>
            <span className={r.danger ? 'text-[#B42323]' : 'text-[#5B6B82]'}>{r.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[15px] font-bold ${r.danger ? 'text-[#B42323]' : 'text-[#1B2A41]'}`}>{r.label}</span>
              {r.sub && <span className="block truncate text-[13px] text-[#8A97AB]">{r.sub}</span>}
            </span>
            {!r.danger && <ChevronRight size={18} className="text-[#C3CCD8]" />}
          </button>
        ))}
      </Card>
    </Screen>
  )
}

import { useState } from 'react'
import { Check, ChevronDown, Lock, ShieldCheck, User } from 'lucide-react'
import { Btn } from './ui'
import { DEFAULT_DRIVER } from './session'
import { openTripsOf, today } from './model'
import type { LocalTrip } from '../LocalPFP/planningStore'

/** Pilot's Secure Login. The prototype has no password: the user id list is the seeded drivers. */
export default function LoginScreen({ roster, trips, onLogin }: {
  roster: string[]; trips: LocalTrip[]; onLogin: (driver: string, remember: boolean) => void
}) {
  const [driver, setDriver] = useState(DEFAULT_DRIVER)
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(true)
  const hint = (d: string) => {
    const n = openTripsOf(trips, d).filter((t) => t.date <= today()).length
    return n ? `${n} trip${n === 1 ? '' : 's'} today` : 'No trips today'
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-white px-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center pt-14">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F26C2E] to-[#C4471F] shadow-[0_8px_20px_rgba(217,84,43,0.35)]">
          <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
            <path d="M8 26V6h10a7 7 0 0 1 0 14h-5" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="13" cy="26" r="2.2" fill="#fff" />
          </svg>
        </div>
        <div className="mt-3 text-[13px] font-bold tracking-[0.2em] text-[#8A97AB]">FAREYE PILOT</div>
      </div>
      <div className="mt-10">
        <div className="text-[24px] font-bold text-[#1B2A41]">Welcome</div>
        <div className="mt-1 text-[15px] text-[#5B6B82]">Sign in to continue</div>
      </div>

      <label className="mt-8 text-[13px] font-bold text-[#5B6B82]" htmlFor="pilot-user">Email or User Id</label>
      <div className="relative mt-1.5">
        <button id="pilot-user" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
          className={`flex h-12 w-full items-center gap-2.5 rounded-xl border bg-white px-3 text-left text-[15px] text-[#1B2A41]
            ${open ? 'border-[#D9542B]' : 'border-[#D5DBE4]'}`}>
          <User size={18} className="text-[#8A97AB]" />
          <span className="flex-1 truncate">{driver}</span>
          <ChevronDown size={18} className={`text-[#8A97AB] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <ul role="listbox" className="absolute inset-x-0 top-[52px] z-20 max-h-72 overflow-y-auto rounded-xl border border-[#E3E8EF] bg-white py-1 shadow-[0_10px_30px_rgba(27,42,65,0.16)]">
            {roster.map((d) => (
              <li key={d} role="option" aria-selected={d === driver}>
                <button type="button" onClick={() => { setDriver(d); setOpen(false) }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F4F6F9] ${d === driver ? 'bg-[#FDF1EC]' : ''}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-[#1B2A41]">{d}</span>
                    <span className="block text-[12px] text-[#8A97AB]">{hint(d)}</span>
                  </span>
                  {d === driver && <Check size={16} className="text-[#D9542B]" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-[15px] text-[#1B2A41]">
        <button type="button" role="checkbox" aria-checked={remember} onClick={() => setRemember((v) => !v)}
          className={`relative flex h-5 w-5 items-center justify-center rounded-md border-2 before:absolute before:-inset-3 before:content-[''] ${remember ? 'border-[#D9542B] bg-[#D9542B]' : 'border-[#C3CCD8] bg-white'}`}>
          {remember && <Check size={13} strokeWidth={3} className="text-white" />}
        </button>
        Remember me
      </label>

      <div className="flex-1" />
      <Btn className="mt-10 w-full" onClick={() => onLogin(driver, remember)}>Next</Btn>
      <div className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-[#8A97AB]">
        <ShieldCheck size={14} /> Secure Login <span className="mx-1">·</span> <Lock size={12} /> Prototype — no password
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Check, CircleCheck } from 'lucide-react'
import { Card, ProgressBar, Screen, SwipeButton, TopBar } from './ui'
import type { LocalTrip } from '../LocalPFP/planningStore'

const GROUPS: { title: string; items: string[] }[] = [
  { title: 'Documentation', items: ['Driving licence', 'Vehicle registration (OR/CR)', 'Trip manifest printed'] },
  { title: 'Safety', items: ['Seat belt working', 'First-aid kit on board', 'Fire extinguisher charged'] },
  { title: 'Vehicle', items: ['Tyre pressure checked', 'Fuel above ¼ tank', 'Lights and indicators working'] },
  { title: 'Equipment and tools', items: ['Handheld scanner charged', 'Trolley / dolly loaded', 'Packing tape and labels'] },
]
const ALL = GROUPS.flatMap((g) => g.items)

export default function ChecklistScreen({ trip, saved, onBack, onSave }: {
  trip: LocalTrip; saved: boolean; onBack: () => void; onSave: () => void
}) {
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(saved ? ALL : []))
  const toggle = (i: string) => setTicked((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const done = ticked.size === ALL.length
  return (
    <Screen
      header={<TopBar title="Checklist" sub={`${trip.id} · pre-trip inspection`} onBack={onBack} />}
      footer={<>
        {!done && <div className="mb-2 text-center text-[13px] text-[#5B6B82]">{ALL.length - ticked.size} items left — tick every item to save</div>}
        <SwipeButton label="Save Checklist & Go Home" disabled={!done} tone="green" onConfirm={onSave} />
      </>}
      bodyClass="px-4 pb-4"
    >
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(27,42,65,0.07)]">
        <div className="mb-2 flex justify-between text-[13px]">
          <span className="font-bold text-[#1B2A41]">{ticked.size} of {ALL.length} checked</span>
          <button type="button" className="font-bold text-[#2F6FB5]" onClick={() => setTicked(new Set(done ? [] : ALL))}>{done ? 'Clear all' : 'Tick all'}</button>
        </div>
        <ProgressBar value={ticked.size} max={ALL.length} tone="green" />
      </div>
      {GROUPS.map((g) => {
        const n = g.items.filter((i) => ticked.has(i)).length
        return (
          <Card key={g.title} className="mt-3" pad="none">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[15px] font-bold text-[#1B2A41]">{g.title}</span>
              {n === g.items.length
                ? <CircleCheck size={20} className="text-[#1F9D55]" />
                : <span className="text-[13px] text-[#8A97AB]">{n}/{g.items.length}</span>}
            </div>
            {g.items.map((i) => (
              <button key={i} type="button" onClick={() => toggle(i)}
                className="flex w-full items-center gap-3 border-t border-[#EEF1F5] px-4 py-3 text-left text-[15px] text-[#1B2A41]">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2
                  ${ticked.has(i) ? 'border-[#1F9D55] bg-[#1F9D55]' : 'border-[#C3CCD8]'}`}>
                  {ticked.has(i) && <Check size={14} strokeWidth={3} className="text-white" />}
                </span>
                {i}
              </button>
            ))}
          </Card>
        )
      })}
    </Screen>
  )
}

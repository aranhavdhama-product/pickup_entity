import { useState } from 'react'
import type { AddForm, FieldDef, FormSection } from './mastersTree'
import type { MasterRow } from './mastersEnv'
import { Button, Field, Input, Select, Toggle, Checkbox } from './components'
import { Clock, XCircle, Plus, CalendarDays } from 'lucide-react'

function FieldControl({ f, value, onChange, size = 'sm' }: { f: FieldDef; value: any; onChange: (v: any) => void; size?: 'sm' | 'lg' }) {
  switch (f.type) {
    case 'toggle':
      return (
        <div className="flex items-center gap-2 h-8">
          <Toggle checked={!!value} onChange={onChange} />
        </div>
      )
    case 'checkbox':
      return <Checkbox checked={!!value} onChange={onChange} label="Yes" />
    case 'radio':
      return (
        <div className="flex items-center gap-5 h-8">
          {(f.options ?? ['Yes', 'No']).map((o) => (
            <label key={o} className="inline-flex items-center gap-2 cursor-pointer text-[13px] text-ink-2">
              <input type="radio" checked={value === o} onChange={() => onChange(o)} className="accent-[var(--color-brand-500)]" />
              {o}
            </label>
          ))}
        </div>
      )
    case 'select':
      return <Select value={value} placeholder={f.placeholder} options={f.options ?? []} onChange={onChange} size={size} />
    case 'number':
      return <Input type="number" value={value} placeholder={f.placeholder} onChange={onChange} size={size} />
    case 'date':
      return (
        <div className="relative">
          <Input value={value} placeholder={f.placeholder ?? 'Select Date'} onChange={onChange} size={size} />
          <CalendarDays size={size === 'lg' ? 16 : 14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-warm-400" />
        </div>
      )
    case 'time':
      return (
        <div className="relative">
          <Input value={value} placeholder={f.placeholder ?? 'Select time'} onChange={onChange} size={size} />
          <Clock size={size === 'lg' ? 16 : 14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-warm-400" />
        </div>
      )
    default:
      return <Input value={value} placeholder={f.placeholder} onChange={onChange} size={size} />
  }
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
function OperatingHours() {
  const [on, setOn] = useState<Record<string, boolean>>({ Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true })
  return (
    <div className="col-span-2 space-y-2">
      {DAYS.map((d) => (
        <div key={d} className="flex items-center gap-3 flex-wrap">
          <div className="w-32"><Checkbox checked={on[d]} onChange={(v) => setOn((s) => ({ ...s, [d]: v }))} label={d} /></div>
          <TimeBox /><TimeBox />
          <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="radio" name={`primary-${d}`} className="accent-[var(--color-brand-500)]" /> Primary
          </label>
          <button className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-line text-ink-3 hover:bg-warm-100"><Plus size={13} /></button>
        </div>
      ))}
    </div>
  )
}
function TimeBox() {
  return (
    <div className="relative w-32">
      <input placeholder="Select time" className="time-field h-8 w-full rounded-md border border-warm-300 bg-surface pl-3 pr-12 text-[13px] text-ink placeholder:text-warm-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20" />
      <Clock size={13} className="absolute right-7 top-1/2 -translate-y-1/2 text-warm-400" />
      <XCircle size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-300" />
    </div>
  )
}

function ModeToggle({ modes }: { modes: { label: string; sub: string }[] }) {
  const [sel, setSel] = useState(0)
  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-2">
        {modes.map((m, i) => (
          <button key={m.label} onClick={() => setSel(i)}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors
              ${sel === i ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface hover:bg-warm-50'}`}>
            <span className={`h-4 w-4 rounded-full border-2 shrink-0 mt-0.5 ${sel === i ? 'border-brand-500' : 'border-warm-300'} flex items-center justify-center`}>
              {sel === i && <span className="h-2 w-2 rounded-full bg-brand-500" />}
            </span>
            <span>
              <span className="block text-[14px] font-bold text-ink">{m.label}</span>
              <span className="block text-[12px] text-ink-3">{m.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-[12px] text-brand-500 mb-4">Try uploading data from excels as a bulk or single</p>
    </>
  )
}

function Section({ s, values, set, pageStyle, uppercase }: { s: FormSection; values: any; set: (k: string, v: any) => void; pageStyle?: boolean; uppercase?: boolean }) {
  const isOps = s.heading === 'Operating Hours'
  const plainLabels = pageStyle && !uppercase
  return (
    <div className="mb-6">
      {s.heading && (
        <div className="mb-3">
          <h4 className="text-[14px] font-bold text-ink">{s.heading}</h4>
          <div className="h-px bg-line mt-2" />
        </div>
      )}
      <div className={`grid grid-cols-2 ${pageStyle ? 'gap-x-8 gap-y-5' : 'gap-x-6 gap-y-4'}`}>
        {isOps ? <OperatingHours /> : s.fields.filter((f) => !f.showWhen || values[f.showWhen.label] === f.showWhen.equals).map((f) => f.type === 'checkbox' ? (
          <div key={f.label} className={`flex items-center ${pageStyle ? 'pt-7' : 'h-8'} ${f.full ? 'col-span-2' : ''}`}>
            <Checkbox checked={!!values[f.label]} onChange={(v) => set(f.label, v)} label={f.label} />
          </div>
        ) : (
          <Field key={f.label} label={f.label} required={f.required} info={f.info} full={f.full} plain={plainLabels}>
            <FieldControl f={f} value={values[f.label]} onChange={(v) => set(f.label, v)} size={pageStyle ? 'lg' : 'sm'} />
          </Field>
        ))}
      </div>
    </div>
  )
}

export function MasterFormBody({ form, initial, onCancel, onSubmit }: {
  form: AddForm; initial?: MasterRow; onCancel: () => void; onSubmit: (values: MasterRow) => void
}) {
  const pageStyle = form.kind === 'page'
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {}
    form.sections.forEach((s) => s.fields.forEach((f) => { if (f.default !== undefined) init[f.label] = f.default }))
    return { ...init, ...initial }
  })
  const set = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }))
  return (
    <div>
      {form.modeToggle && <ModeToggle modes={form.modeToggle} />}
      {form.sections.map((s, i) => <Section key={i} s={s} values={values} set={set} pageStyle={pageStyle} uppercase={form.uppercaseLabels} />)}
      {pageStyle && (
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-line mt-2">
          <Button variant="outline" onClick={onCancel}>{form.cancelLabel ?? 'Cancel'}</Button>
          <Button onClick={() => onSubmit(values)}>{form.submitLabel ?? 'Save'}</Button>
        </div>
      )}
    </div>
  )
}

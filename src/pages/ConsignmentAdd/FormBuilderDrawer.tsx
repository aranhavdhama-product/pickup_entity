/**
 * Form Builder — admin-only drawer opened from the Add / Modify Consignment page
 * (an on-form alternative to Base Modules → Consignment Order). It edits the same
 * FieldConfig the form/list/filters already consume, so changes propagate:
 *
 *  - drag-and-drop reorder within a section (native HTML5 DnD, no dependency)
 *  - show / hide a field (mandatory fields are locked on)
 *  - inline relabel
 *  - reset everything to default
 *
 * All edits flow up via onChange; the parent persists with saveFieldConfig and
 * re-renders the form live.
 */
import { useState } from 'react'
import { GripVertical, Lock, RotateCcw, X, Eye, EyeOff } from 'lucide-react'
import { Button } from '../../nueva/components'
import {
  FIELD_SECTIONS, orderedSectionFields, byKeyMandatory,
  type FieldConfig, type FieldSection, type FormBehavior,
} from './fieldConfig'

export function FormBuilderDrawer({ open, onClose, cfg, onChange, onReset, behavior }: {
  open: boolean
  onClose: () => void
  cfg: FieldConfig
  onChange: (next: FieldConfig) => void
  onReset: () => void
  behavior: FormBehavior
}) {
  const [drag, setDrag] = useState<{ section: FieldSection; key: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  if (!open) return null

  const patch = (key: string, o: Partial<FieldConfig[string]>) =>
    onChange({ ...cfg, [key]: { ...cfg[key], ...o } })

  const reorder = (section: FieldSection, fromKey: string, toKey: string) => {
    if (fromKey === toKey) return
    const keys = orderedSectionFields(section, cfg).map((f) => f.key)
    const from = keys.indexOf(fromKey)
    const to = keys.indexOf(toKey)
    if (from < 0 || to < 0) return
    keys.splice(to, 0, keys.splice(from, 1)[0])
    const next: FieldConfig = { ...cfg }
    keys.forEach((k, i) => { next[k] = { ...next[k], order: i } })
    onChange(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-4">
          <div>
            <h3 className="text-[16px] font-bold text-ink">Form Builder</h3>
            <p className="text-[12px] text-ink-3">Reorder, show/hide and rename fields. Applies to the form, view, filters and table.</p>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink"><X size={18} /></button>
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 space-y-5 overflow-y-auto px-4 py-4">
          {FIELD_SECTIONS.map((section) => {
            const fields = orderedSectionFields(section, cfg)
            return (
              <div key={section}>
                <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-3">{section}</div>
                <div className="space-y-1.5">
                  {fields.map((f) => {
                    const mandatory = !!byKeyMandatory(f.key)
                    const behaviorHidden = behavior.hidden.includes(f.key)
                    const hidden = !mandatory && (cfg[f.key]?.hidden || behaviorHidden)
                    const label = cfg[f.key]?.label ?? f.defaultLabel
                    const isOver = over === f.key && drag?.key !== f.key
                    return (
                      <div key={f.key}
                        draggable
                        onDragStart={() => setDrag({ section, key: f.key })}
                        onDragEnd={() => { setDrag(null); setOver(null) }}
                        onDragOver={(e) => { if (drag?.section === section) { e.preventDefault(); setOver(f.key) } }}
                        onDrop={(e) => { e.preventDefault(); if (drag?.section === section) reorder(section, drag.key, f.key); setDrag(null); setOver(null) }}
                        className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors
                          ${isOver ? 'border-brand-500 bg-brand-50' : 'border-line bg-surface'}
                          ${hidden ? 'opacity-55' : ''}`}>
                        <GripVertical size={15} className="shrink-0 cursor-grab text-warm-400" />
                        <input
                          value={label}
                          onChange={(e) => patch(f.key, { label: e.target.value || undefined })}
                          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-warm-400"
                        />
                        {f.form === 'full' && <span className="shrink-0 rounded bg-warm-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-3">FULL</span>}
                        {mandatory
                          ? <span title="Required — can't be hidden" className="shrink-0 text-warm-400"><Lock size={14} /></span>
                          : (
                            <button type="button" title={hidden ? 'Show field' : 'Hide field'}
                              onClick={() => patch(f.key, { hidden: !cfg[f.key]?.hidden })}
                              className={`shrink-0 rounded p-1 hover:bg-warm-100 ${hidden ? 'text-warm-400' : 'text-brand-500'}`}>
                              {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-line px-4 py-3.5">
          <button onClick={onReset} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink">
            <RotateCcw size={14} /> Reset to default
          </button>
          <Button onClick={onClose}>Done</Button>
        </div>
    </div>
  )
}

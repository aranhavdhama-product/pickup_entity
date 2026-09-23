/**
 * Consignment address edit form.
 *
 * Rebuilds the staging Edit screen with two fields it is missing — Company Name and
 * Landmark — and reorganises the flat single-column list into labelled sections.
 *
 * Both missing fields already exist in the Add form and in the
 * POST/PUT /ship/api/v3/consignments payload, so this is a UI gap, not an API limit.
 */

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Info, MapPin, RotateCcw, Sparkles } from 'lucide-react'
import {
  Button, Field, Input, Select, StatusPill, Toggle,
} from '../../nueva/components'
import {
  PARTY_META, SECTIONS, SEED, countNew,
  type FieldSpec, type Party, type PartyValues, type SectionSpec,
} from './fields'

type RtoMode = 'same' | 'different'

export default function ConsignmentEdit() {
  const [values, setValues] = useState<Record<Party, PartyValues>>(() => structuredClone(SEED))
  const [rto, setRto] = useState<RtoMode>('same')
  const [showOnlyNew, setShowOnlyNew] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)

  const set = (party: Party, key: string, v: string | boolean) => {
    setValues((p) => ({ ...p, [party]: { ...p[party], [key]: v } }))
    setSaved(false)
  }

  const missingRequired = useMemo(() => {
    const out: string[] = []
    for (const party of ['shipFrom', 'shipTo'] as Party[]) {
      for (const s of SECTIONS[party]) {
        for (const f of s.fields) {
          if (f.required && !String(values[party][f.key] ?? '').trim()) {
            out.push(`${PARTY_META[party].title} → ${f.label}`)
          }
        }
      }
    }
    return out
  }, [values])

  const newCount = countNew()

  return (
    <div className="fe-nueva min-h-full bg-canvas">
      {/* ---------------------------------------------------------------- header */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-[1440px] px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[20px] font-black tracking-tight text-ink">Edit Consignment</h1>
                <span className="font-mono text-[13px] text-ink-3">CO0803E</span>
                <StatusPill label="Created" tone="success" />
                <StatusPill label="Label Generated" tone="info" />
              </div>
              <p className="mt-1 max-w-[70ch] text-[13px] text-ink-3">
                Addresses and contacts for both parties. Changes are sent as a single
                <span className="font-mono text-[12px]"> PUT /ship/api/v3/consignments</span> keyed on
                the reference number.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="text" onClick={() => { setValues(structuredClone(SEED)); setSaved(false) }}>
                <RotateCcw size={13} /> Reset
              </Button>
              <Button variant="outline">Cancel</Button>
              <Button onClick={() => setSaved(true)} disabled={missingRequired.length > 0}>
                Save Changes
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <Toggle checked={showOnlyNew} onChange={setShowOnlyNew} />
              <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <Sparkles size={13} className="text-brand-500" />
                Show only the {newCount} fields missing from staging
              </span>
            </label>
            {missingRequired.length > 0 ? (
              <span className="text-[12.5px] text-danger-fg">
                {missingRequired.length} required field{missingRequired.length > 1 ? 's' : ''} empty
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[12.5px] text-success-fg">
                <Check size={13} /> All required fields complete
              </span>
            )}
            {saved && (
              <span className="text-[12.5px] font-bold text-success-fg">
                Payload assembled — {Object.keys(values.shipFrom).length * 2} fields ready to PUT
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- the form */}
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="grid gap-6 xl:grid-cols-2">
          {(['shipFrom', 'shipTo'] as Party[]).map((party) => (
            <PartyCard
              key={party} party={party} values={values[party]} showOnlyNew={showOnlyNew}
              collapsed={collapsed} setCollapsed={setCollapsed}
              onChange={(k, v) => set(party, k, v)}
            />
          ))}
        </div>

        {/* ------------------------------------------------------------ RTO */}
        <section className="mt-6 rounded-md border border-line bg-surface">
          <div className="border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-black text-ink">Return To Origin (RTO)</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              Where the consignment goes back to if delivery fails.
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="inline-flex rounded-md border border-line p-0.5">
              {(['same', 'different'] as RtoMode[]).map((m) => (
                <button
                  key={m} type="button" onClick={() => setRto(m)}
                  className={`rounded-[4px] px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                    rto === m ? 'bg-brand-500 text-white' : 'text-ink-2 hover:text-ink'
                  }`}>
                  {m === 'same' ? 'Same As Ship From' : 'Use Different Address'}
                </button>
              ))}
            </div>
            {rto === 'same' ? (
              <p className="mt-3 text-[12.5px] text-ink-3">
                Mirrors Ship From. Sent as
                <span className="font-mono text-[12px]"> returnTo.returnFacilityCode</span> plus a copy
                of the origin contact and address.
              </p>
            ) : (
              <p className="mt-3 text-[12.5px] text-ink-3">
                A separate return address block would appear here, with the same sections as above.
              </p>
            )}
          </div>
        </section>

        {/* --------------------------------------------------- what changed */}
        <section className="mt-6 rounded-md border border-brand-500/30 bg-brand-50/40">
          <div className="px-5 py-4">
            <h2 className="flex items-center gap-1.5 text-[14px] font-black text-ink">
              <Sparkles size={14} className="text-brand-500" /> What this adds over the staging edit form
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] font-bold uppercase tracking-wide text-ink-3">
                    <th className="pb-2 pr-4">Field</th>
                    <th className="pb-2 pr-4">Party</th>
                    <th className="pb-2">API path</th>
                  </tr>
                </thead>
                <tbody className="text-ink-2">
                  {(['shipFrom', 'shipTo'] as Party[]).flatMap((party) =>
                    SECTIONS[party].flatMap((s) =>
                      s.fields.filter((f) => f.isNew).map((f) => (
                        <tr key={`${party}-${f.key}`} className="border-t border-line/70">
                          <td className="py-1.5 pr-4 font-bold text-ink">{f.label}</td>
                          <td className="py-1.5 pr-4">{PARTY_META[party].title}</td>
                          <td className="py-1.5 font-mono text-[12px] text-ink-3">{f.apiPath}</td>
                        </tr>
                      )),
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">
              Also fixed: <b>Country, City and State keep their required markers</b> here. On the
              staging edit form the asterisks are dropped even though the same fields are mandatory
              in Add.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- party ---- */

function PartyCard({
  party, values, onChange, showOnlyNew, collapsed, setCollapsed,
}: {
  party: Party
  values: PartyValues
  onChange: (key: string, v: string | boolean) => void
  showOnlyNew: boolean
  collapsed: Record<string, boolean>
  setCollapsed: (f: (p: Record<string, boolean>) => Record<string, boolean>) => void
}) {
  const meta = PARTY_META[party]
  const sections = SECTIONS[party]
    .map((s) => ({ ...s, fields: showOnlyNew ? s.fields.filter((f) => f.isNew) : s.fields }))
    .filter((s) => s.fields.length > 0)

  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-black text-ink">{meta.title}</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3">{meta.caption}</p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-bg px-2.5 py-0.5 text-[11.5px] font-bold text-neutral-fg">
          {sections.reduce((n, s) => n + s.fields.length, 0)} fields
        </span>
      </div>

      <div className="divide-y divide-line">
        {sections.map((s) => (
          <SectionBlock
            key={s.id} section={s} values={values} onChange={onChange}
            open={!collapsed[`${party}.${s.id}`]}
            toggle={() => setCollapsed((p) => ({ ...p, [`${party}.${s.id}`]: !p[`${party}.${s.id}`] }))}
          />
        ))}
      </div>
    </section>
  )
}

function SectionBlock({
  section, values, onChange, open, toggle,
}: {
  section: SectionSpec
  values: PartyValues
  onChange: (key: string, v: string | boolean) => void
  open: boolean
  toggle: () => void
}) {
  const newInSection = section.fields.filter((f) => f.isNew).length
  return (
    <div className="px-5 py-4">
      <button type="button" onClick={toggle} className="group flex w-full items-center gap-2 text-left">
        <ChevronDown
          size={14}
          className={`text-warm-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-2">{section.title}</span>
        {newInSection > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10.5px] font-bold text-brand-500">
            <Sparkles size={9} /> {newInSection} new
          </span>
        )}
      </button>

      {open && (
        <>
          {section.caption && (
            <p className="mt-1.5 pl-[22px] text-[12px] text-ink-3">{section.caption}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5 pl-[22px]">
            {section.fields.map((f) => (
              <FieldRow
                key={f.key} spec={f} value={values[f.key]}
                onChange={(v) => onChange(f.key, v)}
              />
            ))}
            {section.id === 'geo' && (
              <div className="col-span-2">
                <Button variant="outline">
                  <MapPin size={13} /> Update Location on Map
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function FieldRow({
  spec, value, onChange,
}: { spec: FieldSpec; value: string | boolean | undefined; onChange: (v: string | boolean) => void }) {
  const wrap = (node: React.ReactNode) => (
    <Field label={spec.label} required={spec.required} full={spec.full}>
      <div className={spec.isNew ? 'rounded-md ring-1 ring-brand-500/35' : ''}>{node}</div>
      {spec.hint && (
        <p className="mt-1 flex items-start gap-1 text-[11.5px] text-ink-3">
          <Info size={11} className="mt-[2px] shrink-0 text-warm-400" />
          {spec.hint}
        </p>
      )}
    </Field>
  )

  if (spec.type === 'toggle') {
    return (
      <Field label={spec.label} full={spec.full}>
        <div className="flex h-8 items-center">
          <Toggle checked={value === true} onChange={onChange} />
        </div>
      </Field>
    )
  }
  if (spec.type === 'select') {
    return wrap(
      <Select
        value={String(value ?? '')} options={spec.options ?? []}
        placeholder={spec.placeholder ?? 'Select'} onChange={onChange}
      />,
    )
  }
  return wrap(
    <Input
      value={String(value ?? '')} placeholder={spec.placeholder}
      type={spec.type === 'number' ? 'number' : spec.type === 'time' ? 'datetime-local' : 'text'}
      onChange={onChange}
    />,
  )
}

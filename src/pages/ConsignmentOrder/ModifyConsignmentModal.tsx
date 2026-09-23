/**
 * Modify Consignment Details — the modal reached from the consignment-order
 * multiselect panel. Six tabs, scrolling body, Confirm disabled until something changes.
 *
 * Two fields exist here that staging's version omits, though both are in the Add form and
 * in the POST/PUT /ship/api/v3/consignments payload:
 *
 *   Company Name -> ship{To,From}.contact.companyName   (on CONTACT, not address —
 *                                                        the read model nests it under
 *                                                        the address, which is how it
 *                                                        gets overlooked)
 *   Landmark     -> ship{To,From}.address.landmark
 *
 * Fields are grouped rather than laid out as one long run, and the address block is
 * ordered smallest unit to largest — landmark, suburb, city, state, postcode, country —
 * so it reads the way an address is actually written.
 */

import { useEffect, useMemo, useState } from 'react'
import { Barcode, Wrench,
  ArrowRight, Info, LayoutGrid, List, MapPin, Package, Paperclip, X,
} from 'lucide-react'
import { Button, Input, Select, Toggle } from '../../nueva/components'
import { fetchMasterRows, fetchSkuMaster, type MasterRecord, type SkuMasterRow } from '../../nueva/settingsApi'
import { fetchFormBehavior, loadFormBehavior, type FormBehavior } from '../ConsignmentAdd/fieldConfig'
import {
  PackageBoxes, RepeatableList,
  SkuBody, SkuSummary, SkuTotals, VasBody, VasSummary,
} from '../../components/consignmentRows'
import {
  computePackInfo, newPackage, newSku, newVas,
  skuIncomplete, vasIncomplete,
} from '../../components/consignmentRowsModel'

/* ------------------------------------------------------------------- types ---- */

import {
  CATEGORY_KEYS, CATEGORY_LABELS, type AddressDraft, type ConsignmentDraft,
} from './consignmentDraft'

const TABS = [
  { label: 'Consignment', icon: Package },
  { label: 'Ship To', icon: MapPin },
  { label: 'Ship From', icon: MapPin },
  { label: 'SKU', icon: List },
  { label: 'Package', icon: LayoutGrid },
  { label: 'VAS', icon: Paperclip },
]

/* -------------------------------------------------------------------- modal ---- */

export default function ModifyConsignmentModal({
  initial, count = 1, onClose, onConfirm,
}: {
  initial: ConsignmentDraft
  count?: number
  onClose: () => void
  onConfirm: (d: ConsignmentDraft) => void
}) {
  const [tab, setTab] = useState(0)
  const [skuMaster, setSkuMaster] = useState<SkuMasterRow[]>([])
  const [packageTypes, setPackageTypes] = useState<MasterRecord[]>([])
  const [vasServices, setVasServices] = useState<MasterRecord[]>([])
  const [behavior, setBehavior] = useState<FormBehavior>(loadFormBehavior)
  useEffect(() => {
    fetchSkuMaster().then(setSkuMaster).catch(() => {})
    fetchMasterRows('packageType').then(setPackageTypes).catch(() => {})
    fetchMasterRows('vas').then(setVasServices).catch(() => {})
    fetchFormBehavior().then(setBehavior).catch(() => {})
  }, [])
  /* the edit form follows the same Base Modules field configuration */
  const hiddenKey = (k: string) => behavior.hidden.includes(k)
  const [draft, setDraft] = useState<ConsignmentDraft>(() => structuredClone(initial))

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial])

  const setField = <K extends keyof ConsignmentDraft>(k: K, v: ConsignmentDraft[K]) =>
    setDraft((p) => ({ ...p, [k]: v }))
  const setAddr = (party: 'shipTo' | 'shipFrom', k: keyof AddressDraft, v: string | boolean) =>
    setDraft((p) => ({ ...p, [party]: { ...p[party], [k]: v } }))

  // Package unit labels follow the SKU rows, as on staging ("Weight (-)" until known).
  const units = {
    weight: draft.skus[0]?.weightUom || '-',
    length: draft.skus[0]?.uom || '-',
  }
  const skuOptions = draft.skus.map((r) => r.lineItemNo.trim()).filter(Boolean)
  const packInfo = computePackInfo(draft.skus, draft.packages)

  return (
    <div className="fe-nueva fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-warm-900/40 py-8">
      <div className="relative mx-4 w-full max-w-[1080px] rounded-xl bg-surface shadow-ds-overlay">
        <div className="flex items-start justify-between px-6 pt-5 pb-3">
          <div>
            <h3 className="text-[18px] font-bold text-ink">Modify Consignment Details</h3>
            {count > 1 && (
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                Applying to {count} selected consignments.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 px-6">
          {TABS.map((t, i) => {
            const on = i === tab
            const Icon = t.icon
            return (
              <button
                key={t.label} type="button" onClick={() => setTab(i)}
                className={`relative flex items-center gap-2 rounded-md border px-4 py-2.5 text-[14px] transition-colors
                  ${on
                    ? 'border-line bg-brand-50/60 font-bold text-brand-500'
                    : 'border-line bg-surface text-ink-2 hover:text-ink'}`}>
                <Icon size={14} />
                {t.label}
                {on && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-500" />}
              </button>
            )
          })}
        </div>
        <div className="mt-[-1px] h-px bg-line" />

        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
          {tab === 0 && <ConsignmentTab draft={draft} set={setField} hidden={hiddenKey} />}
          {tab === 1 && (
            <AddressTab
              party="shipTo" value={draft.shipTo}
              onChange={(k, v) => setAddr('shipTo', k, v)}
            />
          )}
          {tab === 2 && (
            <AddressTab
              party="shipFrom" value={draft.shipFrom}
              onChange={(k, v) => setAddr('shipFrom', k, v)}
            />
          )}
          {tab === 3 && (
            <RepeatableList
              bare title="SKU" addNoun="SKU"
              icon={<Barcode size={15} className="text-brand-500" />}
              caption="Line items on this consignment. Quantities and weights roll up into the totals below."
              cardLabel={(i) => `SKU ${i + 1}`}
              rows={draft.skus} incomplete={skuIncomplete} summary={SkuSummary}
              onAdd={() => setField('skus', [...draft.skus, newSku()])}
              onRemove={(i) => setField('skus', draft.skus.filter((_, j) => j !== i))}
              body={(row, i) => (
                <SkuBody
                  row={row} master={skuMaster} hidden={hiddenKey}
                  onChange={(k, v) => setField('skus',
                    draft.skus.map((r, j) => (j === i ? { ...r, [k]: v } : r)))}
                />
              )}
              totals={draft.skus.length > 0 ? <SkuTotals rows={draft.skus} /> : undefined}
            />
          )}
          {tab === 4 && (
            <PackageBoxes
              bare rows={draft.packages} skuInfo={packInfo} units={units} packageTypes={packageTypes}
              hidden={hiddenKey}
              caption="Every update replaces the existing package list in full — send all active packages, not just the changed ones."
              onAdd={() => setField('packages', [...draft.packages, newPackage()])}
              onRemove={(i) => setField('packages', draft.packages.filter((_, j) => j !== i))}
              onDuplicate={(i) => setField('packages', [...draft.packages, {
                ...draft.packages[i],
                packageId: newPackage().packageId,
                trackingNumber: '',
                contents: draft.packages[i].contents.map((c) => ({ ...c })),
              }])}
              onChange={(i, k, v) => setField('packages',
                draft.packages.map((r, j) => (j === i ? { ...r, [k]: v } : r)))}
              onContents={(i, contents) => setField('packages',
                draft.packages.map((r, j) => (j === i ? { ...r, contents } : r)))}
            />
          )}
          {tab === 5 && (
            <RepeatableList
              bare title="Value Added Services" addNoun="Service"
              icon={<Wrench size={15} className="text-brand-500" />}
              caption="Services attached to this consignment, a package or a SKU line."
              cardLabel={(i) => `VAS ${i + 1}`}
              rows={draft.vas} incomplete={vasIncomplete} summary={VasSummary}
              onAdd={() => setField('vas', [...draft.vas, newVas()])}
              onRemove={(i) => setField('vas', draft.vas.filter((_, j) => j !== i))}
              body={(row, i) => (
                <VasBody
                  row={row} skuOptions={skuOptions} services={vasServices}
                  onChange={(k, v) => setField('vas',
                    draft.vas.map((r, j) => (j === i ? { ...r, [k]: v } : r)))}
                />
              )}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <span className="text-[12.5px] text-ink-3">
            {dirty ? 'Unsaved changes' : 'No changes yet'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="text" onClick={onClose}>Cancel</Button>
            <Button disabled={!dirty} onClick={() => onConfirm(draft)}>Confirm</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- pieces ---- */

/** A quiet group heading with a hairline, so the eye can find the blocks. */
function Group({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2 border-b border-line pb-1.5">
        <h4 className="text-[11.5px] font-bold uppercase tracking-wide text-ink-3">{title}</h4>
        {note && <span className="text-[12px] text-ink-3">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Lbl({ children, required, info }: { children: string; required?: boolean; info?: boolean }) {
  return (
    <label className="mb-1.5 flex items-center gap-1 text-[14px] text-ink">
      {children}
      {required && <span className="text-brand-500">*</span>}
      {info && <Info size={12} className="text-brand-500" />}
    </label>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0">{children}</div>
}

function ReadOnly({ value }: { value: string }) {
  return (
    <div className="flex h-9 items-center rounded-md border border-warm-200 bg-warm-100/70 px-3 text-[14px] text-ink-2">
      {value}
    </div>
  )
}

function SwitchRow({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
      <span className="text-[14px] leading-tight text-ink">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </label>
  )
}

function ConsignmentTab({ draft, set, hidden = () => false }: {
  draft: ConsignmentDraft
  set: <K extends keyof ConsignmentDraft>(k: K, v: ConsignmentDraft[K]) => void
  hidden?: (key: string) => boolean
}) {
  const handVisible = !hidden('schedulingConfirmation') || !hidden('dedicateTruck') || !hidden('clearanceRequired')
  return (
    <div className="grid gap-6">
      <Group title="Identifiers" note="set at creation, not editable">
        <div className="grid grid-cols-3 gap-x-5 gap-y-4">
          <Cell>
            <Lbl required>Order / Reference Number</Lbl>
            <ReadOnly value={draft.referenceNumber} />
          </Cell>
          <Cell>
            <Lbl>Consignment Number</Lbl>
            <ReadOnly value={draft.consignmentNumber} />
          </Cell>
          <Cell>
            <Lbl required>Consignment Type</Lbl>
            <div className="flex h-9 items-center justify-between rounded-md border border-warm-300 bg-surface px-3">
              <span className="flex items-center gap-2 text-[14px] text-ink">
                <ArrowRight size={13} className="text-ink-3" />{draft.consignmentType}
              </span>
              <button onClick={() => set('consignmentType', '')} className="text-warm-400 hover:text-ink-2">
                <X size={13} />
              </button>
            </div>
          </Cell>
        </div>
      </Group>

      <Group title="Service">
        <div className="grid grid-cols-3 gap-x-5 gap-y-4">
          <Cell>
            <Lbl required>Ship By Date</Lbl>
            <Input type="date" value={draft.shipByDate} onChange={(v) => set('shipByDate', v)} />
          </Cell>
          {!hidden('serviceType') && <Cell>
            <Lbl>Service Type</Lbl>
            <Select
              value={draft.serviceType} options={['Standard', 'Express']}
              onChange={(v) => set('serviceType', v)}
            />
          </Cell>}
          {!hidden('labelFormat') && <Cell>
            <Lbl>Label Format</Lbl>
            <Select value={draft.labelFormat} options={['PDF', 'ZPL']} onChange={(v) => set('labelFormat', v)} />
          </Cell>}
          {!hidden('tags') && <Cell>
            <Lbl info>Tags</Lbl>
            <Input value={draft.tags} placeholder="eg, Ambient" onChange={(v) => set('tags', v)} />
          </Cell>}
        </div>
      </Group>

      {handVisible && <Group title="Handling">
        <div className="grid grid-cols-4 gap-x-5 gap-y-3">
          {!hidden('schedulingConfirmation') && <SwitchRow
            label="Scheduling Confirmation" checked={draft.schedulingConfirmationRequired}
            onChange={(v) => set('schedulingConfirmationRequired', v)}
          />}
          {!hidden('dedicateTruck') && <SwitchRow
            label="Dedicate Truck" checked={draft.dedicateTruck}
            onChange={(v) => set('dedicateTruck', v)}
          />}
          {!hidden('clearanceRequired') && <SwitchRow
            label="Clearance Required" checked={draft.clearanceRequired}
            onChange={(v) => set('clearanceRequired', v)}
          />}
          {!hidden('dedicateTruck') && <Cell>
            <Lbl>Total Loading Time (min)</Lbl>
            <Input
              type="number" value={draft.totalLoadingTime} placeholder="minutes"
              onChange={(v) => set('totalLoadingTime', v)}
            />
          </Cell>}
        </div>
      </Group>}

      <Group title="Consignment Category" note="applies to the whole shipment">
        <div className="grid grid-cols-3 gap-x-5 gap-y-3">
          {CATEGORY_KEYS.map((k) => (
            <SwitchRow
              key={k} label={CATEGORY_LABELS[k]} checked={draft.category[k]}
              onChange={(v) => set('category', { ...draft.category, [k]: v })}
            />
          ))}
        </div>
        <p className="mt-2.5 text-[12px] text-ink-3">
          A SKU flagged hazmat raises the consignment flag on its own; the reverse does not
          happen. Set Hazmat here when the shipment is regulated without an individual hazmat
          line item.
        </p>
      </Group>

      {!hidden('specialInstructions') && <Group title="Instructions">
        <textarea
          rows={3} value={draft.specialInstructions} placeholder="eg, lorem ipsum"
          onChange={(e) => set('specialInstructions', e.target.value)}
          className="w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[14px] text-ink
                     placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20"
        />
      </Group>}
    </div>
  )
}

function AddressTab({ party, value, onChange }: {
  party: 'shipTo' | 'shipFrom'
  value: AddressDraft
  onChange: (k: keyof AddressDraft, v: string | boolean) => void
}) {
  const isTo = party === 'shipTo'

  return (
    <div className="grid gap-6">
      <Group title="Contact">
        <div className="grid grid-cols-4 gap-x-5 gap-y-4">
          <Cell>
            <Lbl required>{isTo ? 'Customer Name' : 'Sender Name'}</Lbl>
            <Input value={value.name} onChange={(v) => onChange('name', v)} />
          </Cell>
          <Cell>
            <Lbl>Company Name</Lbl>
            <Input
              value={value.companyName} placeholder="eg, Riverside Retail Group"
              onChange={(v) => onChange('companyName', v)}
            />
          </Cell>
          <Cell>
            <Lbl>Email</Lbl>
            <Input
              value={value.email} placeholder="eg, johndoe@xyz.com"
              onChange={(v) => onChange('email', v)}
            />
          </Cell>
          <Cell>
            <Lbl required={isTo}>Contact Number</Lbl>
            <div className="flex gap-2">
              <div className="w-[84px] shrink-0">
                <Select
                  value={value.countryCode} placeholder=" "
                  options={['+1', '+44', '+61', '+91', '+31']}
                  onChange={(v) => onChange('countryCode', v)}
                />
              </div>
              <Input value={value.contactNumber} onChange={(v) => onChange('contactNumber', v)} />
            </div>
          </Cell>
        </div>
      </Group>

      <Group title="Street">
        <div className="grid grid-cols-3 gap-x-5 gap-y-4">
          <Cell>
            <Lbl required>Address Line 1</Lbl>
            <Input value={value.line1} placeholder="eg, Building No." onChange={(v) => onChange('line1', v)} />
          </Cell>
          <Cell>
            <Lbl>Address Line 2</Lbl>
            <Input value={value.line2} placeholder="eg, Street 1 A" onChange={(v) => onChange('line2', v)} />
          </Cell>
          <Cell>
            <Lbl>Address Line 3</Lbl>
            <Input value={value.line3} placeholder="eg, Behind High School" onChange={(v) => onChange('line3', v)} />
          </Cell>
          <Cell>
            <Lbl>Landmark</Lbl>
            <Input
              value={value.landmark} placeholder="eg, Near Lotus Garden"
              onChange={(v) => onChange('landmark', v)}
            />
          </Cell>
        </div>
      </Group>

      <Group title="Region" note="narrowest to widest">
        <div className="grid grid-cols-3 gap-x-5 gap-y-4">
          <Cell>
            <Lbl>Suburb / County</Lbl>
            <Input value={value.county} onChange={(v) => onChange('county', v)} />
          </Cell>
          <Cell>
            <Lbl>City</Lbl>
            <Input value={value.city} onChange={(v) => onChange('city', v)} />
          </Cell>
          <Cell>
            <Lbl>State</Lbl>
            <Input value={value.state} onChange={(v) => onChange('state', v)} />
          </Cell>
          <Cell>
            <Lbl>Postal Code</Lbl>
            <Input value={value.postalCode} onChange={(v) => onChange('postalCode', v)} />
          </Cell>
          <Cell>
            <Lbl>Country</Lbl>
            <Input value={value.country} onChange={(v) => onChange('country', v)} />
          </Cell>
        </div>
        <button type="button" className="mt-3.5 w-fit text-[14px] font-bold text-brand-500 hover:underline">
          Update Location on Map
        </button>
      </Group>

      {isTo && (
        <Group title="Site Access" note="drives service time and crew">
          <div className="grid grid-cols-3 gap-x-5 gap-y-4">
            <Cell>
              <Lbl>Floor Number</Lbl>
              <Input value={value.floorNumber} onChange={(v) => onChange('floorNumber', v)} />
            </Cell>
            <SwitchRow
              label="Lift Available" checked={value.liftAvailable}
              onChange={(v) => onChange('liftAvailable', v)}
            />
          </div>
        </Group>
      )}
    </div>
  )
}


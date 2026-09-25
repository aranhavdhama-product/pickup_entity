/**
 * Settings (`/grow/orders/settings?tab=account|packages|users|email|storefront`)
 * — the live portal's `/account-settings/` (research 2026-09-25 §7,
 * screenshots 20–24). Tabs Account · Saved Packages · User Management · Email ·
 * Store Front Integration; the last three were NOT captured, so they show an
 * empty state.
 *
 * Account (as captured): left column Personal Information (⋮ Edit · Disable
 * Account (disabled)) and Business Information (⋮ Edit) cards; each Edit swaps
 * the tab body for its own "←" edit view (`&edit=personal|business`). Right
 * column: Pickup Address card — Sync pickup address + search in its header, a
 * dashed "+ Add New Address" tile, then one card per pickup address with a
 * Default chip and ⋮ (Set as default; Edit / Remove disabled — the store has no
 * update/remove). The Add New Address form was not captured: ours is invented
 * and saves through `growOrderActions.addStore`.
 * Saved Packages: search + Add New Package → grid NAME · PACKAGE WEIGHT ·
 * PACKAGE DIMENSIONS · ACTIONS (⋮ Edit · Remove) → the "← Add Saved Package"
 * view (`&pkg=new|<id>`). Saved packages join the order form's package presets.
 * Data: `growOrders/merchantSettings.ts` (per merchant code).
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Building2, Mail, MapPinPlus, Package, RefreshCw, Store, UserRound, Users, Warehouse,
} from 'lucide-react'
import {
  Button, Checkbox, EmptyState, Input, KebabMenu, MenuSelect, Modal, PageHeader, Panel, Toggle, type Column,
} from '../../nueva/components'
import { LocalPage, LocalTabs, SearchBox } from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { growOrderActions, useGrowOrders } from '../../growOrders/store'
import { blankParty } from '../../growOrders/seed'
import { currentMerchant, refreshMasters, useMasters, useMerchantCode } from '../../growOrders/masters'
import {
  newSavedPackageId, PROJECTED_VOLUMES, saveMerchantSettings, useMerchantSettings,
  type BusinessInfo, type MerchantSettings, type PersonalInfo, type SavedPackage,
} from '../../growOrders/merchantSettings'
import { volumetricKg } from '../../growOrders/rates'
import type { Party } from '../../growOrders/types'
import { usePickupLocations } from './pickupLocations'
import { MField, MGrid, MSection, NumInput } from './merchantFormBits'
import { partyLine } from './utils'
import { InfoLine, MenuCard, PagedTable, plural } from './accountBits'

const TABS = [
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'packages', label: 'Saved Packages', icon: Package },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'storefront', label: 'Store Front Integration', icon: Store },
]

const yesNo = (v: boolean) => (v ? 'Yes' : 'No')
const r2 = (n: number) => Math.round(n * 100) / 100

function useMerchantCtx() {
  const masters = useMasters()
  const merchant = currentMerchant(masters.merchants, useMerchantCode())
  const code = merchant?.code ?? ''
  const settings = useMerchantSettings(code, merchant?.name ?? '', merchant?.party)
  const save = (patch: Partial<MerchantSettings>) => saveMerchantSettings(code, settings, patch)
  return { merchant, code, settings, save }
}

/* ============================================================== Account === */

function PersonalEdit({ value, onSave, onBack }: { value: PersonalInfo; onSave: (v: PersonalInfo) => void; onBack: () => void }) {
  const [v, setV] = useState(value)
  const [tried, setTried] = useState(false)
  const phoneBad = !!v.contact && !/^\+?[0-9 ]{7,15}$/.test(v.contact) ? 'Phone number is not valid for country Philippines' : ''
  const nameBad = !v.name.trim() ? 'Name is a required field' : ''
  return (
    <div className="max-w-[960px]">
      <PageHeader title="Personal Information" subtitle="Update your personal details here" onBack={onBack} />
      <MSection id="personal-edit" title="Personal details">
        <MGrid cols={2}>
          <MField label="Name" required error={tried && nameBad}><Input value={v.name} onChange={(name) => setV({ ...v, name })} /></MField>
          <MField label="Email" hint="Your sign-in email — contact support to change it"><Input value={v.email} disabled /></MField>
          <MField label="Contact Number" error={tried && phoneBad}><Input value={v.contact} onChange={(contact) => setV({ ...v, contact })} placeholder="eg, 9171234567" /></MField>
          <MField label="Notifications Preference">
            <div className="flex h-8 items-center gap-5">
              <Checkbox checked={v.notifyEmail} onChange={(notifyEmail) => setV({ ...v, notifyEmail })} label="Email" />
              <Checkbox checked={v.notifyBrowser} onChange={(notifyBrowser) => setV({ ...v, notifyBrowser })} label="Browser" />
            </div>
          </MField>
          <MField label="2-Step Authentication" hint={v.twoFactor ? 'A code is asked at every sign-in' : 'Disabled'}>
            <div className="flex h-8 items-center"><Toggle checked={v.twoFactor} onChange={(twoFactor) => setV({ ...v, twoFactor })} /></div>
          </MField>
        </MGrid>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onBack}>Cancel</Button>
          <Button onClick={() => { setTried(true); if (nameBad || phoneBad) return; onSave(v) }}>Update</Button>
        </div>
      </MSection>
    </div>
  )
}

function BusinessEdit({ value, onSave, onBack }: { value: BusinessInfo; onSave: (v: BusinessInfo) => void; onBack: () => void }) {
  const [v, setV] = useState(value)
  const [tried, setTried] = useState(false)
  const set = (k: keyof BusinessInfo) => (x: string) => setV({ ...v, [k]: x })
  const req = { line1: !v.line1.trim() && 'Address Line 1 is a required field', postal: !v.postalCode.trim() && 'Postal Code is a required field' }
  return (
    <div className="max-w-[960px]">
      <PageHeader title="Business Information" subtitle="Update your Business details here" onBack={onBack} />
      <MSection id="business-edit" title="Business details">
        <MGrid cols={2}>
          <MField label="Business Name"><Input value={v.businessName} onChange={set('businessName')} /></MField>
          <MField label="Trading Name"><Input value={v.tradingName} onChange={set('tradingName')} /></MField>
          <MField label="ABN Number"><Input value={v.abn} onChange={set('abn')} /></MField>
          <MField label="Email Id"><Input value={v.email} onChange={set('email')} /></MField>
          <MField label="Country"><Input value={v.country} disabled /></MField>
          <MField label="Address Line 1" required error={tried && req.line1}><Input value={v.line1} onChange={set('line1')} /></MField>
          <MField label="Address Line 2"><Input value={v.line2} onChange={set('line2')} /></MField>
          <MField label="Postal Code" required error={tried && req.postal}>
            <MenuSelect value={v.postalCode} placeholder="Select postal code" options={[...new Set(['4000', '5000', v.postalCode].filter(Boolean))]} creatable searchable onChange={set('postalCode')} />
          </MField>
        </MGrid>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onBack}>Cancel</Button>
          <Button onClick={() => { setTried(true); if (req.line1 || req.postal) return; onSave(v) }}>Update</Button>
        </div>
      </MSection>
    </div>
  )
}

function AddPickupAddressDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (code: string) => void }) {
  const [label, setLabel] = useState('')
  const [p, setP] = useState<Party>(() => ({ ...blankParty(), country: 'Philippines' }))
  const [def, setDef] = useState(false)
  const [tried, setTried] = useState(false)
  const set = (k: keyof Party) => (x: string) => setP((c) => ({ ...c, [k]: x }))
  const req = {
    label: !label.trim() && 'Location name is a required field', name: !p.name.trim() && 'Name is a required field',
    contact: !p.contactNumber.trim() && 'Contact Number is a required field', line1: !p.line1.trim() && 'Address Line 1 is a required field',
    postal: !p.postalCode.trim() && 'Postal Code is a required field',
  }
  const save = () => {
    setTried(true)
    if (Object.values(req).some(Boolean)) return
    const code = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'STORE'
    const s = growOrderActions.addStore({ code, name: label.trim(), party: { ...p, city: p.city || (p.postalCode === '4000' ? 'San Pablo' : p.postalCode === '5000' ? 'Iloilo City' : '') } })
    toast.success(`${s.name} added to your pickup addresses`)
    onSaved(def ? s.code : '')
  }
  return (
    <Modal open title="Add New Address" subtitle="A place your parcels are collected from." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="pb-4 pt-1">
        <MGrid cols={2}>
          <MField label="Location name" required error={tried && req.label}><Input value={label} onChange={setLabel} placeholder="e.g. BDO" /></MField>
          <MField label="Name" required error={tried && req.name} hint="The person the driver asks for"><Input value={p.name} onChange={set('name')} /></MField>
          <MField label="Contact Number" required error={tried && req.contact}><Input value={p.contactNumber} onChange={set('contactNumber')} /></MField>
          <MField label="Email Id" hint="Used for communication"><Input value={p.email} onChange={set('email')} /></MField>
          <MField label="Business Name"><Input value={p.businessName} onChange={set('businessName')} /></MField>
          <MField label="Country"><Input value="Philippines" disabled /></MField>
          <MField label="Address Line 1" required error={tried && req.line1}><Input value={p.line1} onChange={set('line1')} /></MField>
          <MField label="Address Line 2"><Input value={p.line2} onChange={set('line2')} /></MField>
          <MField label="Postal Code" required error={tried && req.postal}>
            <MenuSelect value={p.postalCode} placeholder="Select postal code" options={['4000', '5000']} creatable searchable onChange={set('postalCode')} />
          </MField>
          <MField label="Default">
            <div className="flex h-8 items-center"><Checkbox checked={def} onChange={setDef} label="Use as default address" /></div>
          </MField>
        </MGrid>
      </div>
    </Modal>
  )
}

function PickupAddressCard({ settings, save }: { settings: MerchantSettings; save: (p: Partial<MerchantSettings>) => void }) {
  const db = useGrowOrders()
  const pickup = usePickupLocations(db.stores)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const defCode = pickup.stores.some((s) => s.code === settings.defaultStoreCode) ? settings.defaultStoreCode : pickup.stores[0]?.code
  const shown = pickup.stores.filter((s) => !q.trim() || [s.name, partyLine(s.party)].some((v) => v.toLowerCase().includes(q.trim().toLowerCase())))
  return (
    <MenuCard title="Pickup Address" icon={<Warehouse size={17} />}
      right={<div className="flex items-center gap-2">
        <Button variant="outline" size="sm" icon={<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}
          onClick={() => { setSyncing(true); void refreshMasters().finally(() => { setSyncing(false); toast.info('Pickup addresses synced') }) }}>Sync pickup address</Button>
        <div className="w-40 min-w-0 [&_.pfp-search]:w-full [&_input]:w-full [&_input]:min-w-0"><SearchBox value={q} onChange={setQ} placeholder="Search" /></div>
      </div>}>
      <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-2">
        <button type="button" onClick={() => setAdding(true)}
          className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-warm-300 bg-warm-25 text-[13px] font-bold text-ink-2 transition-colors hover:border-warm-400 hover:bg-warm-50">
          <MapPinPlus size={22} className="text-ink-3" />Add New Address
        </button>
        {shown.map((s) => {
          const on = s.code === defCode
          return (
            <div key={s.code} className={`min-w-0 rounded-md border px-4 py-3 ${on ? 'border-ink bg-warm-50' : 'border-line bg-surface'}`}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 truncate text-[13px] font-bold text-ink" title={s.name}>{s.name}</p>
                {on && <span className="shrink-0 rounded-full bg-success-bg px-2 py-px text-[11px] font-bold text-success-fg">Default</span>}
                <span className="ml-auto"><KebabMenu items={[
                  { label: 'Set as default', disabled: on, reason: 'Already the default', onClick: () => { save({ defaultStoreCode: s.code }); toast.success(`${s.name} is now your default pickup address`) } },
                  { label: 'Edit', disabled: true, reason: 'Pickup addresses are maintained in the Location Master' },
                  { label: 'Remove', disabled: true, reason: 'Pickup addresses are maintained in the Location Master' },
                ]} /></span>
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] text-ink-2">{partyLine(s.party) || '—'}</p>
              <div className="mt-2 border-t border-line pt-2 text-[12px] text-ink-3">
                <p className="truncate">• {s.party.email || 'No email'}</p>
                <p className="truncate">• {s.party.contactNumber || 'No phone'}</p>
              </div>
            </div>
          )
        })}
      </div>
      {shown.length === 0 && q && <p className="pt-3 text-[13px] text-ink-3">No pickup address matches “{q}”.</p>}
      {adding && <AddPickupAddressDialog onClose={() => setAdding(false)}
        onSaved={(code) => { setAdding(false); if (code) save({ defaultStoreCode: code }) }} />}
    </MenuCard>
  )
}

function AccountTab({ edit, setEdit }: { edit: string | null; setEdit: (e: string | null) => void }) {
  const { settings, save } = useMerchantCtx()
  const p = settings.personal, b = settings.business
  if (edit === 'personal') return <PersonalEdit value={p} onBack={() => setEdit(null)} onSave={(v) => { save({ personal: v }); toast.success('Personal details updated'); setEdit(null) }} />
  if (edit === 'business') return <BusinessEdit value={b} onBack={() => setEdit(null)} onSave={(v) => { save({ business: v }); toast.success('Business details updated'); setEdit(null) }} />
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,420px)_1fr]">
      <div className="flex min-w-0 flex-col gap-4">
        <MenuCard title="Personal Information" icon={<UserRound size={17} />}
          menu={[{ label: 'Edit', onClick: () => setEdit('personal') }, { label: 'Disable Account', disabled: true, reason: 'Contact support to disable your account' }]}>
          <InfoLine label="Name">{p.name || '—'}</InfoLine>
          <InfoLine label="Email">{p.email || '—'}</InfoLine>
          <InfoLine label="Contact No">{p.contact || '—'}</InfoLine>
          <InfoLine label="Notifications Preference">Email {yesNo(p.notifyEmail)} · Browser {yesNo(p.notifyBrowser)}</InfoLine>
          <InfoLine label="2-Step Authentication">{p.twoFactor ? 'Enabled' : 'Disabled'}</InfoLine>
        </MenuCard>
        <MenuCard title="Business Information" icon={<Building2 size={17} />} menu={[{ label: 'Edit', onClick: () => setEdit('business') }]}>
          <InfoLine label="Business Name">{b.businessName || '—'}</InfoLine>
          <InfoLine label="Trading Name">{b.tradingName || '—'}</InfoLine>
          <InfoLine label="ABN Number">{b.abn || '—'}</InfoLine>
          <InfoLine label="Projected Volume per Week">{b.projectedVolume || PROJECTED_VOLUMES[1]}</InfoLine>
          <InfoLine label="Merchant Account Number">{b.accountNumber}</InfoLine>
          <InfoLine label="Email">{b.email || '—'}</InfoLine>
          <InfoLine label="Account Type">{b.accountType}</InfoLine>
          <InfoLine label="Payment Type">{b.paymentType}</InfoLine>
          <InfoLine label="Billing address">{[b.line1, b.line2, b.postalCode].filter(Boolean).join(', ') || '—'}</InfoLine>
          <InfoLine label="Country">{b.country}</InfoLine>
        </MenuCard>
      </div>
      <PickupAddressCard settings={settings} save={save} />
    </div>
  )
}

/* ======================================================= Saved Packages === */

function PackageForm({ value, onBack, onSave }: { value: SavedPackage | null; onBack: () => void; onSave: (p: SavedPackage) => void }) {
  const [v, setV] = useState<SavedPackage>(value ?? { id: newSavedPackageId(), name: '', weightKg: 0, l: 0, w: 0, h: 0 })
  const [tried, setTried] = useState(false)
  const vol = r2(volumetricKg(v))
  const errs = { name: !v.name.trim() && 'Item Information is a required field', dims: !(v.l > 0 && v.w > 0 && v.h > 0) && 'Package dimensions are required' }
  const valid = !errs.name && !errs.dims
  return (
    <div className="max-w-[960px]">
      <PageHeader title={value ? 'Edit Saved Package' : 'Add Saved Package'} subtitle="Enter the details to be used as your package." onBack={onBack} />
      <MSection id="package" title="Package Details" caption="1. Item Information">
        <MGrid cols={4}>
          <MField label="Item Information" required error={tried && errs.name} className="sm:col-span-2 xl:col-span-4">
            <Input value={v.name} onChange={(name) => setV({ ...v, name })} placeholder="e.g. Flyer" />
          </MField>
          <MField label="Weight"><NumInput value={v.weightKg} onChange={(weightKg) => setV({ ...v, weightKg })} unit="kg" blankZero placeholder="0" /></MField>
          <MField label="Length" required error={tried && errs.dims}><NumInput value={v.l} onChange={(l) => setV({ ...v, l })} unit="cm" blankZero placeholder="L" /></MField>
          <MField label="Width" required><NumInput value={v.w} onChange={(w) => setV({ ...v, w })} unit="cm" blankZero placeholder="W" /></MField>
          <MField label="Height" required><NumInput value={v.h} onChange={(h) => setV({ ...v, h })} unit="cm" blankZero placeholder="H" /></MField>
        </MGrid>
        <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">
          Total Weight: <b className="text-ink">{r2(v.weightKg)} kg</b><span className="text-ink-3"> · </span>
          Volumetric Weight: <b className="text-ink">{vol} kg</b><span className="text-ink-3"> · </span>
          Total Quantity: <b className="text-ink">1</b>
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onBack}>Cancel</Button>
          <Button disabled={tried && !valid} onClick={() => { setTried(true); if (valid) onSave({ ...v, name: v.name.trim() }) }}>{value ? 'Update' : 'Add'}</Button>
        </div>
      </MSection>
    </div>
  )
}

function PackagesTab({ pkg, setPkg }: { pkg: string | null; setPkg: (p: string | null) => void }) {
  const { settings, save } = useMerchantCtx()
  const [q, setQ] = useState('')
  const rows = useMemo(() => settings.packages.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())), [settings.packages, q])
  if (pkg) {
    const existing = settings.packages.find((p) => p.id === pkg) ?? null
    return <PackageForm key={pkg} value={existing} onBack={() => setPkg(null)} onSave={(p) => {
      save({ packages: existing ? settings.packages.map((x) => (x.id === p.id ? p : x)) : [...settings.packages, p] })
      toast.success(existing ? `${p.name} updated` : `${p.name} saved — it is now a package preset on your orders`)
      setPkg(null)
    }} />
  }
  const columns: Column[] = [
    { key: 'name', label: 'Name', render: (p: SavedPackage) => <b className="text-ink">{p.name}</b> },
    { key: 'weight', label: 'Package Weight', width: 180, render: (p: SavedPackage) => `${p.weightKg} kg` },
    { key: 'dims', label: 'Package Dimensions', width: 260, render: (p: SavedPackage) => `${p.l}cm X ${p.w}cm X ${p.h}cm` },
    {
      key: 'actions', label: 'Actions', width: 100, render: (p: SavedPackage) => (
        <span onClick={(e) => e.stopPropagation()}><KebabMenu items={[
          { label: 'Edit', onClick: () => setPkg(p.id) },
          { label: 'Remove', tone: 'danger', onClick: () => { save({ packages: settings.packages.filter((x) => x.id !== p.id) }); toast.success(`${p.name} removed`) } },
        ]} /></span>
      ),
    },
  ]
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ink">Create and manage your standard packages here</p>
          <p className="text-[12px] text-ink-3">Use the “Save Package” feature to store commonly used package details.</p>
        </div>
        <div className="w-52 [&_.pfp-search]:w-full [&_input]:w-full [&_input]:min-w-0"><SearchBox value={q} onChange={setQ} placeholder="Search packages" /></div>
        <Button icon={<Package size={15} />} onClick={() => setPkg('new')}>Add New Package</Button>
      </div>
      {settings.packages.length === 0
        ? <Panel><EmptyState icon={<Package size={32} />} title="No saved packages" hint="Save a package you use often to pick it on every order." /></Panel>
        : <PagedTable rows={rows} columns={columns} onRowClick={(p) => setPkg(p.id)} resetKey={q} />}
      <p className="mt-2 text-[12px] text-ink-3">{plural(settings.packages.length, 'saved package')} · offered as presets in the order form’s Package type.</p>
    </div>
  )
}

/* ================================================================= page === */

export default function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'account'
  const patch = (fn: (n: URLSearchParams) => void) => setParams((p) => { const n = new URLSearchParams(p); fn(n); return n })
  const setTab = (id: string) => patch((n) => { n.set('tab', id); n.delete('edit'); n.delete('pkg') })
  const t = TABS.find((x) => x.id === tab)!
  return (
    <LocalPage>
      <LocalTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'account' && <AccountTab edit={params.get('edit')} setEdit={(e) => patch((n) => { if (e) n.set('edit', e); else n.delete('edit') })} />}
        {tab === 'packages' && <PackagesTab pkg={params.get('pkg')} setPkg={(p) => patch((n) => { if (p) n.set('pkg', p); else n.delete('pkg') })} />}
        {(tab === 'users' || tab === 'email' || tab === 'storefront') && (
          <Panel><EmptyState icon={<t.icon size={32} />} title={t.label} hint="Not captured yet — this tab's live content was not recorded, so it is not built." /></Panel>
        )}
      </div>
    </LocalPage>
  )
}

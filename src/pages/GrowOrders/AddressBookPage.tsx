/**
 * Address Book (`/grow/orders/address-book`, `/add`, `/:id`, `/:id/edit`) — the
 * live portal's `/address/` pages (research 2026-09-25 §5, screenshots 11–13):
 * saved RECEIVER addresses.
 *
 * List: toolbar = Errors toggle (rows that failed validation) · Source (ours:
 * the list also shows the Location Master's delivery rows and past receivers,
 * read-only, so the merchant sees everything the order form offers) · Clear →
 * right: search · download · Sync addresses · Add ▾ (Single Address · Bulk
 * Upload) → grid NAME · ADDRESS · EMAIL ID · CONTACT NUMBER · BUSINESS NAME ·
 * STORE NAME (+ Source) → Delete as the selection action → rows per page 10.
 * Add / Edit: the live 2-column form field for field (Name* · Contact Number ·
 * Email Id · Business Name · Country (fixed) · Address Line 1* · Address Line 2 ·
 * Postal Code*), errors only after Save. View: the same fields read-only + Edit.
 * Data: `growOrders/addressBook.ts`; `receiverBook()` lists saved rows first.
 */
import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { BookUser, ChevronDown, Download, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Button, EmptyState, Input, MenuSelect, Modal, PageHeader, Panel, type Column } from '../../nueva/components'
import { Chip, ClearFilters, FilterLine, FilterSelect, IconBtn, LocalPage, SearchBox } from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { useGrowOrders } from '../../growOrders/store'
import { blankParty } from '../../growOrders/seed'
import { refreshMasters, useMasters, useMerchantCode, currentMerchant } from '../../growOrders/masters'
import { addressBookActions, addressById, addressError, useAddressBook, type AddressEntry } from '../../growOrders/addressBook'
import { splitCsvLine } from '../../growOrders/bulkCsv'
import type { Party } from '../../growOrders/types'
import { downloadCsv } from '../LocalPFP/adapter'
import { receiverBook } from './pickupLocations'
import { MField, MGrid, MSection } from './merchantFormBits'
import { partyLine } from './utils'
import { PagedTable, ReadField, plural } from './accountBits'

/** The live form's postal codes (2GO_PH staging) — the select also offers every code already in the book. */
const POSTAL_CITY: Record<string, string> = { '4000': 'San Pablo', '5000': 'Iloilo City' }

type Source = 'Saved' | 'Location Master' | 'Past order'
interface Row { id: string; party: Party; storeName: string; error: string; source: Source; entry?: AddressEntry }

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const CSV_HEAD = ['Name', 'Contact Number', 'Email Id', 'Business Name', 'Address Line 1', 'Address Line 2', 'Postal Code', 'City', 'Country']
const toCsv = (rows: Row[]) => [CSV_HEAD.join(','), ...rows.map((r) => [r.party.name, r.party.contactNumber, r.party.email, r.party.businessName,
  r.party.line1, r.party.line2, r.party.postalCode, r.party.city, r.party.country].map(csvCell).join(','))].join('\n')

/* ------------------------------------------------------------------ list -- */

function AddMenu({ onSingle, onBulk }: { onSingle: () => void; onBulk: () => void }) {
  const [open, setOpen] = useState(false)
  const item = (label: string, go: () => void) => (
    <button type="button" onClick={() => { setOpen(false); go() }} className="w-full px-4 py-2 text-left text-[13px] text-ink hover:bg-warm-50">{label}</button>
  )
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <Button icon={<BookUser size={15} />} onClick={() => setOpen((v) => !v)}>Add Address <ChevronDown size={14} /></Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 min-w-[180px] rounded-lg border border-line bg-surface py-1.5 shadow-ds-overlay">
          {item('Single Address', onSingle)}
          {item('Bulk Upload', onBulk)}
        </div>
      )}
    </div>
  )
}

function BulkAddressDialog({ onClose }: { onClose: () => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<Party[] | null>(null)
  const [name, setName] = useState('')
  const read = async (f: File) => {
    const lines = (await f.text()).split(/\r?\n/).filter((l) => l.trim())
    const head = splitCsvLine(lines[0] ?? '').map((h) => h.trim().toLowerCase())
    const at = (cells: string[], h: string) => { const i = head.indexOf(h.toLowerCase()); return i < 0 ? '' : (cells[i] ?? '').trim() }
    setName(f.name)
    setParsed(lines.slice(1).map((l) => {
      const c = splitCsvLine(l)
      const postal = at(c, 'Postal Code')
      return { ...blankParty(), name: at(c, 'Name'), contactNumber: at(c, 'Contact Number'), email: at(c, 'Email Id'), businessName: at(c, 'Business Name'),
        line1: at(c, 'Address Line 1'), line2: at(c, 'Address Line 2'), postalCode: postal, city: at(c, 'City') || POSTAL_CITY[postal] || '', country: at(c, 'Country') || 'Philippines' }
    }))
  }
  const bad = parsed?.filter((p) => addressError(p)).length ?? 0
  return (
    <Modal open title="Bulk Upload addresses" subtitle="Upload a CSV with one receiver per row." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!parsed?.length} onClick={() => { const n = addressBookActions.addMany(parsed ?? []); toast.success(`${plural(n, 'address')} imported${bad ? ` · ${bad} with errors` : ''}`); onClose() }}>Import</Button></>}>
      <div className="space-y-4 pb-4 pt-1 text-[13px] text-ink-2">
        <p>Columns: {CSV_HEAD.join(' · ')}. Name, Address Line 1 and Postal Code are required — rows missing them land under <b className="text-ink">Errors</b>.</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={<Download size={15} />} onClick={() => downloadCsv('address-book-template.csv', `${CSV_HEAD.join(',')}\n`)}>Download template</Button>
          <Button variant="outline" icon={<Upload size={15} />} onClick={() => file.current?.click()}>Choose file</Button>
          <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f) }} />
        </div>
        {parsed && <p className="text-ink">{name}: {plural(parsed.length, 'row')}{bad ? <span className="text-danger-fg"> · {bad} with errors</span> : null}</p>}
      </div>
    </Modal>
  )
}

export default function AddressBookPage() {
  const nav = useNavigate()
  const db = useGrowOrders()
  const saved = useAddressBook()
  const masters = useMasters()
  const merchant = currentMerchant(masters.merchants, useMerchantCode())
  const [q, setQ] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [source, setSource] = useState('')
  const [bulk, setBulk] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const all = useMemo<Row[]>(() => {
    const mine: Row[] = saved.map((e) => ({ id: e.id, party: e.party, storeName: e.storeName, error: e.error, source: 'Saved', entry: e }))
    /* everything else the order form's receiver search offers, read-only */
    const others = receiverBook(masters, merchant?.code ?? null, db.orders, saved).filter((b) => b.tag !== 'Address book')
      .map((b, i): Row => ({ id: `rb${i}`, party: b.party, storeName: '', error: '', source: b.tag ? 'Location Master' : 'Past order' }))
    return [...mine, ...others]
  }, [saved, masters, merchant?.code, db.orders])
  const errorCount = saved.filter((e) => e.error).length
  const rows = all.filter((r) => (!errorsOnly || r.error) && (!source || r.source === source)
    && (!q.trim() || [r.party.name, r.party.line1, r.party.email, r.party.contactNumber, r.party.businessName, r.party.postalCode]
      .some((v) => v.toLowerCase().includes(q.trim().toLowerCase()))))
  const filtersOn = !!(q || errorsOnly || source)
  const open = (r: Row) => (r.entry ? nav(`/grow/orders/address-book/${r.id}`) : nav('/grow/orders/address-book/add', { state: { party: r.party } }))

  const columns: Column[] = [
    { key: 'name', label: 'Name', width: 160, render: (r: Row) => <span className="block truncate font-bold text-ink" title={r.party.name}>{r.party.name || '—'}</span> },
    {
      key: 'address', label: 'Address', render: (r: Row) => (
        <span className="block min-w-0">
          <span className="block truncate" title={partyLine(r.party)}>{partyLine(r.party) || '—'}</span>
          {r.error && <span className="block truncate text-[12px] text-danger-fg">{r.error}</span>}
        </span>
      ),
    },
    { key: 'email', label: 'Email ID', width: 180, render: (r: Row) => <span className="block truncate">{r.party.email || '—'}</span> },
    { key: 'phone', label: 'Contact Number', width: 130, render: (r: Row) => r.party.contactNumber || '—' },
    { key: 'biz', label: 'Business Name', width: 150, render: (r: Row) => <span className="block truncate">{r.party.businessName || '—'}</span> },
    { key: 'store', label: 'Store Name', width: 100, render: (r: Row) => r.storeName || '—' },
    { key: 'source', label: 'Source', width: 120, render: (r: Row) => <span className="text-[12px] text-ink-3">{r.source}</span> },
  ]

  return (
    <LocalPage>
      <FilterLine right={<>
        <SearchBox value={q} onChange={setQ} placeholder="Search addresses" />
        <IconBtn title="Download (CSV)" onClick={() => { downloadCsv('address-book.csv', toCsv(rows)); toast.success(`${plural(rows.length, 'address')} exported`) }}><Download size={16} /></IconBtn>
        <Button variant="outline" icon={<RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />}
          onClick={() => { setSyncing(true); void refreshMasters().finally(() => { setSyncing(false); toast.info('Addresses synced with the Location Master') }) }}>Sync addresses</Button>
        <AddMenu onSingle={() => nav('/grow/orders/address-book/add')} onBulk={() => setBulk(true)} />
      </>}>
        <Chip active={errorsOnly} count={errorCount} tone="danger" onClick={() => setErrorsOnly((v) => !v)}>Errors</Chip>
        <FilterSelect value={source} placeholder="Source" options={['Saved', 'Location Master', 'Past order']} width={170} onChange={setSource} />
        <ClearFilters active={filtersOn} onClick={() => { setQ(''); setErrorsOnly(false); setSource('') }} />
      </FilterLine>
      <div className="mt-4">
        {rows.length === 0 ? (
          <Panel><EmptyState icon={<BookUser size={32} />} title={filtersOn ? 'No addresses match these filters' : 'No saved addresses'} hint="Add a receiver address to reuse it on your orders." /></Panel>
        ) : (
          <PagedTable rows={rows} columns={columns} onRowClick={open} selectable resetKey={`${q}|${errorsOnly}|${source}`}
            selectionActions={(sel, clear) => {
              const mine = sel.filter((r) => r.entry)
              return [{
                label: mine.length === sel.length ? 'Delete' : `Delete (${mine.length} saved)`, icon: <Trash2 size={14} />,
                disabled: mine.length === 0, reason: 'Only saved addresses can be deleted',
                onClick: () => { addressBookActions.remove(mine.map((r) => r.id)); clear(); toast.success(`${plural(mine.length, 'address')} deleted`) },
              }]
            }} />
        )}
      </div>
      {bulk && <BulkAddressDialog onClose={() => setBulk(false)} />}
    </LocalPage>
  )
}

/* ------------------------------------------------------------ add / edit -- */

export function AddressFormPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { party?: Party } }
  const book = useAddressBook()
  const existing = id ? addressById(id) : undefined
  const [p, setP] = useState<Party>(() => existing?.party ?? { ...blankParty(), country: 'Philippines', ...(loc.state?.party ?? {}) })
  const [storeName, setStoreName] = useState(existing?.storeName ?? '')
  const [tried, setTried] = useState(false)
  const set = (k: keyof Party) => (v: string) => setP((x) => ({ ...x, [k]: v }))
  const postalOptions = useMemo(() => [...new Set([...Object.keys(POSTAL_CITY), ...book.map((e) => e.party.postalCode).filter(Boolean)])].sort(), [book])
  const back = () => nav(existing ? `/grow/orders/address-book/${existing.id}` : '/grow/orders/address-book')
  const req = { name: !p.name.trim() && 'Name is a required field', line1: !p.line1.trim() && 'Address Line 1 is a required field', postal: !p.postalCode.trim() && 'Postal Code is a required field' }
  const phoneBad = !!p.contactNumber && !/^\+?[0-9 ]{7,15}$/.test(p.contactNumber) && 'Please enter a valid Contact Number'
  const emailBad = !!p.email && !/^\S+@\S+\.\S+$/.test(p.email) && 'Please enter a valid Email Id'
  const missing = [req.name, req.line1, req.postal].filter(Boolean).length
  const save = () => {
    setTried(true)
    if (missing || phoneBad || emailBad) return
    const party = { ...p, city: p.city || POSTAL_CITY[p.postalCode] || '' }
    if (existing) { addressBookActions.update(existing.id, party, storeName); toast.success('Address updated'); nav(`/grow/orders/address-book/${existing.id}`) }
    else { const e = addressBookActions.add(party, storeName); toast.success(`${party.name} saved to the address book`); nav(`/grow/orders/address-book/${e.id}`) }
  }
  if (id && !existing) return <NotFound id={id} />
  return (
    <div className="mx-auto max-w-[960px]">
      <PageHeader title={existing ? 'Edit Address' : 'Add Address'} subtitle="Receiver Addresses" onBack={back} />
      <MSection id="address" title="Receiver details" caption={missing ? `${plural(missing, 'required field')} left` : 'All required fields complete'}>
        <MGrid cols={2}>
          <MField label="Name" required error={tried && req.name}><Input value={p.name} onChange={set('name')} placeholder="Receiver name" /></MField>
          <MField label="Contact Number" hint="Required for delivery driver" error={tried && phoneBad}><Input value={p.contactNumber} onChange={set('contactNumber')} placeholder="eg, 9171234567" /></MField>
          <MField label="Email Id" hint="Used for communication" error={tried && emailBad}><Input value={p.email} onChange={set('email')} placeholder="name@example.com" /></MField>
          <MField label="Business Name"><Input value={p.businessName} onChange={set('businessName')} /></MField>
          <MField label="Country"><Input value={p.country || 'Philippines'} disabled /></MField>
          <MField label="Store Name"><Input value={storeName} onChange={setStoreName} placeholder="Optional" /></MField>
          <MField label="Address Line 1" required error={tried && req.line1}><Input value={p.line1} onChange={set('line1')} /></MField>
          <MField label="Address Line 2"><Input value={p.line2} onChange={set('line2')} /></MField>
          <MField label="Postal Code" required error={tried && req.postal} hint={POSTAL_CITY[p.postalCode]}>
            <MenuSelect value={p.postalCode} placeholder="Select postal code" options={postalOptions} searchable creatable onChange={set('postalCode')} />
          </MField>
        </MGrid>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={back}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </MSection>
    </div>
  )
}

/* ------------------------------------------------------------------ view -- */

function NotFound({ id }: { id: string }) {
  const nav = useNavigate()
  return (
    <div>
      <PageHeader title="Address" onBack={() => nav('/grow/orders/address-book')} />
      <Panel><EmptyState title="Address not found" hint={`No saved address ${id} in this browser.`} /></Panel>
    </div>
  )
}

export function AddressViewPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  useAddressBook()
  const e = addressById(id)
  if (!e) return <NotFound id={id} />
  const p = e.party
  return (
    <div className="mx-auto max-w-[960px]">
      <PageHeader title="View Address" subtitle={p.name} onBack={() => nav('/grow/orders/address-book')}
        right={<Button variant="outline" icon={<Pencil size={15} />} onClick={() => nav(`/grow/orders/address-book/${e.id}/edit`)}>Edit Details</Button>} />
      <MSection id="address-view" title="Receiver details" caption={e.error ? <span className="text-danger-fg">{e.error}</span> : undefined}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <ReadField label="Name" value={p.name} />
          <ReadField label="Contact Number" value={p.contactNumber} />
          <ReadField label="Email Id" value={p.email} />
          <ReadField label="Business Name" value={p.businessName} />
          <ReadField label="Country" value={p.country} />
          <ReadField label="Store Name" value={e.storeName} />
          <ReadField label="Address Line 1" value={p.line1} />
          <ReadField label="Address Line 2" value={p.line2} />
          <ReadField label="Postal Code" value={p.postalCode} />
          <ReadField label="City" value={p.city} />
        </div>
      </MSection>
    </div>
  )
}

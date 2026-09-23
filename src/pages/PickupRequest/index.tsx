/**
 * CFT Pickup Request listing.
 *
 * Toolbar/table grammar is the Consignment Order one (tabs + icon actions on the
 * first row, filters left / search + primary action right on the second, then the
 * bordered table card). Everything reads from the local `src/pickup` demo store —
 * no staging calls — and every mutation goes through `pickupActions`.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, CheckCircle2, Inbox, Layers, Plus, Route, RotateCcw,
  Settings as SettingsIcon, Truck, Zap,
} from 'lucide-react'
import {
  Button, Checkbox, ClearFilters, IconButton, MenuSelect, Modal, SearchInput, StatusPill, Tabs, Toggle,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { consignmentsForPr, pickupActions, pickupProgress, usePickupDb } from '../../pickup/store'
import { CARRIER_LIST, CARRIERS, LOCATION_LIST, MERCHANT_LIST, locationsForMerchant } from '../../pickup/seed'
import type { PickupRequest, PRStatus } from '../../pickup/types'

/* ---------------------------------------------------------------- vocabulary ---- */

const STATUS_TONE: Record<PRStatus, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  OPEN: 'info',
  PLANNED: 'neutral',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  COMPLETED_SHORT: 'warning',
  FAILED: 'danger',
  CANCELLED: 'neutral',
}
const STATUS_LABEL: Record<PRStatus, string> = {
  OPEN: 'Open',
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  COMPLETED_SHORT: 'Completed Short',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}
const STATUS_ORDER: PRStatus[] = [
  'OPEN', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_SHORT', 'FAILED', 'CANCELLED',
]

const POLICY_LABEL: Record<string, string> = {
  ONE_OPEN: 'One open request per location',
  ONE_PER_SLOT: 'One request per location, per slot',
  UNLIMITED: 'Unlimited requests',
}
const POLICY_HINT: Record<string, string> = {
  ONE_OPEN: 'A location may hold a single live pickup request at a time — a second raise is offered a merge instead.',
  ONE_PER_SLOT: 'A location may hold one live request per time slot — raising a second one for the same slot offers a merge.',
  UNLIMITED: 'Every raise creates a new request — duplicates are never detected.',
}

/** Progress only means something once the driver has been on site. */
const RAN: PRStatus[] = ['IN_PROGRESS', 'COMPLETED', 'COMPLETED_SHORT', 'FAILED']

const TABS: { label: string; test: (p: PickupRequest) => boolean }[] = [
  { label: 'All', test: () => true },
  { label: 'Open', test: (p) => p.status === 'OPEN' || p.status === 'PLANNED' },
  { label: 'In Progress', test: (p) => p.status === 'IN_PROGRESS' },
  { label: 'Completed', test: (p) => p.status === 'COMPLETED' || p.status === 'COMPLETED_SHORT' },
  // cancelled rows share this tab so every status has a home — the label says so
  { label: 'Failed / Cancelled', test: (p) => p.status === 'FAILED' || p.status === 'CANCELLED' },
]
const TAB_ICONS = [Layers, Inbox, Truck, CheckCircle2, AlertTriangle]

/* ------------------------------------------------------------------- helpers ---- */

function slotDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (isNaN(d.getTime())) return iso
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Small neutral chip — pickup type markers, source, counts. */
function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold
      ${tone === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-warm-100 text-ink-2'}`}>
      {children}
    </span>
  )
}

function typeChips(pr: PickupRequest): string[] {
  const out: string[] = []
  if (pr.blind) out.push('Blind')
  out.push(pr.scannable ? 'Scan' : 'Count')
  if (pr.skuMode) out.push('SKU')
  return out
}

/* ---------------------------------------------------------------------- page ---- */

export default function PickupRequestList() {
  const db = usePickupDb()
  const navigate = useNavigate()

  const [tab, setTab] = useState(0)
  const [status, setStatus] = useState('')
  const [merchant, setMerchant] = useState('')
  const [query, setQuery] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [planOpen, setPlanOpen] = useState(false)
  const [planCarrier, setPlanCarrier] = useState('')

  const all = useMemo(
    () => [...db.pickupRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db.pickupRequests],
  )

  /* filters apply BEFORE the tab counts, exactly like the Consignment page */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((p) => {
      if (status && p.status !== status) return false
      if (merchant && p.merchantCode !== merchant) return false
      if (!q) return true
      return [p.id, p.merchantName, p.locationName, p.source, p.createdBy]
        .some((v) => (v ?? '').toLowerCase().includes(q))
    })
  }, [all, status, merchant, query])

  const counts = TABS.map((t) => filtered.filter(t.test).length)
  const rows = filtered.filter(TABS[tab].test)

  const filtersActive = !!status || !!merchant
  const clearFilters = () => { setStatus(''); setMerchant('') }

  /* -------- routing selection: only OPEN PRs can be planned -------- */
  const selectableIds = rows.filter((p) => p.status === 'OPEN').map((p) => p.id)
  const selectedPrs = selected
    .map((id) => db.pickupRequests.find((p) => p.id === id))
    .filter((p): p is PickupRequest => !!p && p.status === 'OPEN')
  const allOpenSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id))
  const toggleRow = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleAll = () =>
    setSelected(allOpenSelected ? [] : selectableIds)
  const clearSelection = () => setSelected([])

  const selConsignments = selectedPrs.flatMap((p) => consignmentsForPr(db, p.id))
  const selConsignmentCount = selConsignments.length
  const selWeight = selConsignments.reduce((n, c) => n + c.weightKg, 0)
  // default carrier for the plan = the selection's carrier when uniform
  const selCarrierCodes = [...new Set(selectedPrs.map((p) => p.carrierCode ?? ''))]
  const uniformCarrier = selCarrierCodes.length === 1 ? selCarrierCodes[0] : ''

  const assignCarrier = (pr: PickupRequest, code: string) => {
    const res = pickupActions.assignCarrier(pr.id, code)
    if (res) toast.success(`${pr.id} assigned to ${res.carrierName}.`)
  }

  const sendToLoadPlanning = () => {
    toast.info(`${selectedPrs.length} pickup request(s) queued for load planning (LOAD_PLANNING).`)
    clearSelection()
  }

  const carrierName = (code: string) => CARRIERS[code]?.name ?? code
  const openPlan = () => { setPlanCarrier(uniformCarrier); setPlanOpen(true) }
  const plan = () => {
    const trip = pickupActions.planTrip({
      prIds: selectedPrs.map((p) => p.id),
      consignmentIds: [],
      carrierCode: planCarrier || undefined,
    })
    setPlanOpen(false)
    clearSelection()
    toast.success(`${trip.id} planned — ${trip.stops.length} stop${trip.stops.length === 1 ? '' : 's'}.`)
    navigate('/local/pickup')
  }

  const reattempt = (pr: PickupRequest) => {
    const next = pickupActions.reattemptPickupRequest(pr.id)
    if (!next) { toast.error(`Could not re-attempt ${pr.id}.`); return }
    toast.success(`${next.id} raised — attempt ${next.attempt} of ${next.maxAttempts}.`)
    navigate(next.id)
  }

  const cancel = (pr: PickupRequest) => {
    pickupActions.cancelPickupRequest(pr.id, 'Cancelled from the pickup request list')
    setConfirmCancel(null)
    toast.success(`${pr.id} cancelled — its consignments are back in the pending pool.`)
  }

  return (
    <div className="fe-nueva bg-canvas min-h-full p-5">
      {/* tabs first — filters sit one level under them */}
      <div className="mb-3 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <Tabs
            tabs={TABS.map((t, i) => `${t.label}: ${counts[i]}`)}
            icons={TAB_ICONS}
            active={tab}
            onChange={setTab}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pb-1">
          <IconButton icon={<SettingsIcon size={15} />} title="Auto-create rules"
            onClick={() => setRulesOpen(true)} />
        </div>
      </div>

      {/* single-line toolbar: filters left, search + primary action right */}
      <div className="mb-3 flex flex-nowrap items-center gap-2">
        <div className="w-44 shrink-0">
          <MenuSelect
            value={status} placeholder="All statuses"
            options={['', ...STATUS_ORDER]}
            labels={(v) => (v === '' ? 'All statuses' : STATUS_LABEL[v as PRStatus] ?? v)}
            onChange={setStatus}
          />
        </div>
        <div className="w-52 shrink-0">
          <MenuSelect
            value={merchant} placeholder="All merchants"
            options={['', ...MERCHANT_LIST.map((m) => m.code)]}
            labels={(v) => (v === '' ? 'All merchants' : MERCHANT_LIST.find((m) => m.code === v)?.name ?? v)}
            onChange={setMerchant}
          />
        </div>
        <ClearFilters active={filtersActive} onClick={clearFilters} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="w-52">
            <SearchInput value={query} placeholder="Search pickup requests" onChange={setQuery} />
          </div>
          <Button icon={<Plus size={15} />} onClick={() => navigate('add')}>Create Pickup Request</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line bg-thead">
                <th className="w-10 px-4 py-2.5 text-left">
                  <Checkbox
                    checked={allOpenSelected}
                    indeterminate={selected.length > 0 && !allOpenSelected}
                    onChange={toggleAll}
                  />
                </th>
                {['PR ID', 'Merchant / Location', 'Slot', 'Type', 'Consignments', 'Progress',
                  'Source', 'Carrier', 'Status', 'Attempt', ''].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-[12px] font-bold text-ink-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((pr) => {
                const prog = pickupProgress(db, pr.id)
                const ran = RAN.includes(pr.status)
                const isOpen = pr.status === 'OPEN'
                const isSel = selected.includes(pr.id)
                const canAssign = pr.status === 'OPEN' || pr.status === 'PLANNED'
                return (
                  <tr key={pr.id} onClick={() => navigate(pr.id)}
                    className={`cursor-pointer border-b border-line transition-colors last:border-0 ${isSel ? 'bg-brand-50' : 'hover:bg-warm-50'}`}>
                    {/* only OPEN requests can be planned into a route */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {isOpen
                        ? <Checkbox checked={isSel} onChange={() => toggleRow(pr.id)} />
                        : <span className="block h-3.5 w-3.5" />}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[12px] font-bold text-brand-500">{pr.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block whitespace-nowrap text-ink">{pr.merchantName}</span>
                      <span className="block whitespace-nowrap text-[12px] text-ink-3">{pr.locationName}</span>
                    </td>
                    <td className="px-4 py-3">
                      {pr.slot ? (
                        <span className="block whitespace-nowrap tabular-nums">
                          <span className="block text-ink">{slotDay(pr.slot.date)}</span>
                          <span className="block text-[12px] text-ink-3">{pr.slot.start}–{pr.slot.end}</span>
                        </span>
                      ) : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-1">
                        {typeChips(pr).map((c) => <Chip key={c}>{c}</Chip>)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-2">
                      {pr.blind
                        ? <span className="text-ink-3">Blind · {pr.expectedPieces ?? '?'} expected</span>
                        : pr.consignmentIds.length}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-2">
                      {ran ? `${prog.collected}/${prog.expected}` : <span className="text-warm-400">—</span>}
                    </td>
                    <td className="px-4 py-3"><Chip>{pr.source}</Chip></td>
                    <td className="whitespace-nowrap px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {canAssign ? (
                        <div className="w-44">
                          <MenuSelect
                            value={pr.carrierCode ?? ''} placeholder="Assign carrier"
                            options={['', ...CARRIER_LIST.map((c) => c.code)]}
                            labels={(v) => (v === '' ? 'Unassigned' : carrierName(v))}
                            onChange={(v) => v && assignCarrier(pr, v)}
                          />
                        </div>
                      ) : pr.carrierName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Truck size={13} className="text-ink-3" />
                          <span className="text-ink-2">{pr.carrierName}</span>
                        </span>
                      ) : <Chip>Unassigned</Chip>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill label={STATUS_LABEL[pr.status]} tone={STATUS_TONE[pr.status]} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12px] text-ink-3">
                      {pr.attempt > 1 || pr.status === 'FAILED'
                        ? `Attempt ${pr.attempt}/${pr.maxAttempts}`
                        : <span className="text-warm-400">—</span>}
                    </td>
                    {/* row-level actions never navigate — the cell swallows the click */}
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {pr.status === 'FAILED' && !pr.reattemptPrId && (
                        <Button size="sm" variant="outline" icon={<RotateCcw size={13} />}
                          onClick={() => reattempt(pr)}>Re-attempt</Button>
                      )}
                      {pr.status === 'OPEN' && (
                        confirmCancel === pr.id ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-[12px] text-ink-3">Cancel?</span>
                            <button onClick={() => cancel(pr)}
                              className="h-7 rounded-md border border-brand-500 px-2 text-[12px] font-bold text-brand-500 hover:bg-brand-50">
                              Yes
                            </button>
                            <button onClick={() => setConfirmCancel(null)}
                              className="h-7 rounded-md px-2 text-[12px] font-bold text-ink-3 hover:bg-warm-100">
                              No
                            </button>
                          </span>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(pr.id)}>Cancel</Button>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-ink-3">
                    No pickup requests match this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />}
          onClick={() => { pickupActions.resetDemo(); toast.info('Demo data reset to the seed scenario.') }}>
          Reset demo data
        </Button>
      </div>

      {/* routing from the pickup-request list — same two modes as Pending for Planning */}
      {selectedPrs.length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full border border-line bg-surface px-5 py-2.5 shadow-ds-2">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-500 px-2 text-[12px] font-bold text-white">{selectedPrs.length}</span>
          <span className="whitespace-nowrap text-[13px] text-ink-2">
            pickup request{selectedPrs.length === 1 ? '' : 's'} · {selConsignmentCount} consignment{selConsignmentCount === 1 ? '' : 's'} · ~{Math.round(selWeight)} kg
          </span>
          <span className="h-5 w-px bg-line" />
          <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
          <Button size="sm" variant="outline" onClick={sendToLoadPlanning}>Send to Load Planning</Button>
          <Button size="sm" icon={<Route size={14} />} onClick={openPlan}>Plan Route</Button>
        </div>
      )}

      <Modal title="Plan a route" open={planOpen} onClose={() => setPlanOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button icon={<Route size={14} />} onClick={plan}>Create trip</Button>
          </div>
        }>
        <div className="space-y-4 pb-1">
          <p className="text-[13px] text-ink-2">
            Planning <b>{selectedPrs.length}</b> pickup request{selectedPrs.length === 1 ? '' : 's'} as
            the first leg. Their {selConsignmentCount} consignment{selConsignmentCount === 1 ? '' : 's'} become
            the last-leg delivery load on the same trip.
          </p>
          <div className="rounded-md border border-line bg-surface">
            {selectedPrs.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <span className="font-mono text-[12px] font-bold text-brand-500">{p.id}</span>
                <span className="truncate text-[12.5px] text-ink-2">{p.merchantName} · {p.locationName}</span>
                <span className="ml-auto text-[12px] text-ink-3">{p.slot ? `${p.slot.start}–${p.slot.end}` : 'Any time'}</span>
              </div>
            ))}
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-bold text-ink-2">Carrier</label>
            <div className="w-72">
              <MenuSelect
                value={planCarrier} placeholder="Choose a carrier"
                options={['', ...CARRIER_LIST.map((c) => c.code)]}
                labels={(v) => (v === '' ? 'Auto (from request)' : `${carrierName(v)} · ${CARRIERS[v]?.driver ?? ''}`)}
                onChange={setPlanCarrier}
              />
            </div>
            <p className="mt-1.5 text-[12px] text-ink-3">
              The trip's driver and vehicle come from the chosen carrier.
              {uniformCarrier && ` Defaulting to ${carrierName(uniformCarrier)} from the selection.`}
            </p>
          </div>
        </div>
      </Modal>

      <AutoRulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  )
}

/* ------------------------------------------------------- auto-create rules ---- */

/**
 * Scheduler simulation. `autoCreateFromRules` deliberately skips any
 * merchant+location that already holds a live PR, so on pristine seed data it
 * creates nothing — that zero is reported as copy, not as a failure.
 */
function AutoRulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = usePickupDb()
  const [merchant, setMerchant] = useState('ALL')
  const [location, setLocation] = useState('')

  const rules = db.config.autoCreateRules
  const locOptions = locationsForMerchant(merchant).map((l) => l.code)
  const locName = (code: string) => LOCATION_LIST.find((l) => l.code === code)?.name ?? code
  const merchName = (code: string) =>
    code === 'ALL' ? 'All merchants' : MERCHANT_LIST.find((m) => m.code === code)?.name ?? code

  const addRule = () => {
    if (!location) { toast.error('Pick a pickup location for the rule.'); return }
    if (rules.some((r) => r.merchantCode === merchant && r.locationCode === location)) {
      toast.info('That rule already exists.')
      return
    }
    // ids are upserted by value — a length-based id would overwrite AR-1
    pickupActions.upsertAutoRule({ id: `AR-${Date.now()}`, merchantCode: merchant, locationCode: location, enabled: true })
    toast.success(`Rule added — ${merchName(merchant)} @ ${locName(location)}.`)
    setLocation('')
  }

  const run = () => {
    const made = pickupActions.autoCreateFromRules()
    if (!made.length) {
      toast.info('No pickup requests created — no unlinked consignments matched the enabled rules.')
      return
    }
    toast.success(`${made.length} pickup request${made.length === 1 ? '' : 's'} created — ${made.map((p) => p.id).join(', ')}.`)
  }

  return (
    <Modal title="Auto-create rules" open={open} onClose={onClose}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-5 pb-2">
        {/* duplicate-raise policy */}
        <section>
          <p className="mb-1.5 text-[13px] font-bold text-ink">Multiple pickup requests</p>
          <div className="w-80">
            <MenuSelect
              value={db.config.multiPrPolicy}
              options={['ONE_OPEN', 'ONE_PER_SLOT', 'UNLIMITED']}
              labels={(v) => POLICY_LABEL[v] ?? v}
              onChange={(v) => {
                pickupActions.setConfig({ multiPrPolicy: v as 'ONE_OPEN' | 'ONE_PER_SLOT' | 'UNLIMITED' })
                toast.success('Pickup policy updated.')
              }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">{POLICY_HINT[db.config.multiPrPolicy]}</p>
        </section>

        <div className="h-px bg-line" />

        {/* rules */}
        <section>
          <p className="mb-2 text-[13px] font-bold text-ink">Rules</p>
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id}
                className="flex items-center gap-3 rounded-md border border-line bg-surface px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{merchName(r.merchantCode)}</p>
                  <p className="truncate text-[12px] text-ink-3">{locName(r.locationCode)} · {r.locationCode}</p>
                </div>
                <span className="text-[12px] text-ink-3">{r.enabled ? 'Enabled' : 'Disabled'}</span>
                <Toggle checked={r.enabled}
                  onChange={(v) => {
                    pickupActions.upsertAutoRule({ ...r, enabled: v })
                    toast.success(`Rule ${v ? 'enabled' : 'disabled'}.`)
                  }} />
              </div>
            ))}
            {rules.length === 0 && (
              <p className="rounded-md border border-dashed border-warm-300 px-4 py-4 text-center text-[12.5px] text-ink-3">
                No rules yet — add one below.
              </p>
            )}
          </div>

          {/* add-rule row */}
          <div className="mt-3 flex items-end gap-2 rounded-md border border-dashed border-warm-300 px-4 py-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-[12px] font-bold text-ink-2">Merchant</label>
              <MenuSelect
                value={merchant} options={['ALL', ...MERCHANT_LIST.map((m) => m.code)]}
                labels={merchName}
                onChange={(v) => { setMerchant(v); setLocation('') }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-[12px] font-bold text-ink-2">Pickup location</label>
              <MenuSelect value={location} placeholder="Select location" options={locOptions}
                labels={locName} onChange={setLocation} />
            </div>
            <Button variant="outline" icon={<Plus size={14} />} onClick={addRule}>Add rule</Button>
          </div>
        </section>

        <div className="h-px bg-line" />

        <section className="flex items-start gap-3 rounded-md bg-warm-25 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-ink">Run rules now</p>
            <p className="mt-0.5 text-[12px] text-ink-3">
              Simulates the scheduler: every enabled rule raises a request for the unlinked
              first-mile consignments at its location. Locations that already hold a live
              request are skipped.
            </p>
          </div>
          <Button icon={<Zap size={14} />} onClick={run}>Run rules now</Button>
        </section>
      </div>
    </Modal>
  )
}

/**
 * Scan to Inbound (LOCAL) — the hub in-scan.
 *
 * One big input: a label read (order id, consignment number or tracking
 * number) + Enter → `planningActions.hubInScan(code, { hubCode, damaged })`.
 * The outcome shown per scan is read from the store's result plus what the
 * parcel looked like just before the scan (was it already picked? which hub is
 * it bound for?). Spec §3.4, §6.5 H2/H3/H6, §9.1 #16–19.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import {
  Button, EmptyState, Field, Input, MenuSelect, Modal, PageHeader, Panel, SimpleTable, StatusPill, Toggle,
} from '../../nueva/components'
import { growOrdersSnapshot, pickupRequestById } from '../../growOrders/store'
import { INBOUND_HUBS } from '../../growOrders/hubs'
import { isOpenPr } from '../../growOrders/tabs'
import { planningActions } from '../LocalPFP/planningStore'

type Outcome = 'Received' | 'Marked picked · PR pending' | 'Unknown · overage held' | 'Already scanned'
  | 'Already closed — logged' | 'Not picked · no change' | 'Misroute' | 'Damaged'
const OUTCOMES: Outcome[] = ['Received', 'Marked picked · PR pending', 'Misroute', 'Damaged', 'Already scanned', 'Already closed — logged', 'Not picked · no change', 'Unknown · overage held']
const TONE: Record<Outcome, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  Received: 'success',
  'Marked picked · PR pending': 'info',
  'Unknown · overage held': 'warning',
  'Already scanned': 'neutral',
  'Already closed — logged': 'neutral',
  'Not picked · no change': 'warning',
  Misroute: 'danger',
  Damaged: 'danger',
}

interface ScanEntry {
  n: number
  code: string
  at: string
  hubCode: string
  outcome: Outcome
  consignment: string
  prNumber: string
  detail: string
}

const findOrder = (code: string) => {
  const key = code.trim().toLowerCase()
  return growOrdersSnapshot().orders.find((x) => x.id === code.trim() || x.orderNumber.toLowerCase() === key
    || (!!x.trackingNumber && x.trackingNumber.toLowerCase() === key))
}

/** Three codes from the current data a reviewer can try: one that lands, one already in, one not picked. */
function sampleCodes(): string[] {
  const db = growOrdersSnapshot()
  const num = (id: string) => db.orders.find((o) => o.id === id)?.orderNumber
  const out: string[] = []
  const pending = db.pickupRequests.flatMap((p) => [...new Set([...p.pickedOrderIds, ...p.handover.driverScanned])]
    .filter((i) => !p.handover.hubScanned.includes(i)))
  const already = db.pickupRequests.flatMap((p) => p.handover.hubScanned)
  const notPicked = db.pickupRequests.filter((p) => isOpenPr(p.status) && p.handover.mode !== 'hub').flatMap((p) => p.orderIds)
  for (const list of [pending, already, notPicked]) {
    const n = list.map(num).find((x): x is string => !!x && !out.includes(x))
    if (n) out.push(n)
  }
  return out
}

export default function InboundScanner() {
  const nav = useNavigate()
  const [hub, setHub] = useState(INBOUND_HUBS[0].code)
  const [damaged, setDamaged] = useState(false)
  const [code, setCode] = useState('')
  const [scans, setScans] = useState<ScanEntry[]>([])
  const [summary, setSummary] = useState(false)
  const [samples] = useState(sampleCodes)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { box.current?.querySelector('input')?.focus() }, [])

  const scan = () => {
    const raw = code.trim()
    if (!raw) return
    const before = findOrder(raw)
    const prBefore = before ? pickupRequestById(before.pickedInRequestId ?? before.pickupRequestId) : undefined
    const wasPicked = !!(before && prBefore?.pickedOrderIds.includes(before.id))
    const r = planningActions.hubInScan(raw, { hubCode: hub, damaged })
    const pr = r.prId ? pickupRequestById(r.prId) : prBefore
    let outcome: Outcome
    let detail = ''
    switch (r.kind) {
      case 'unknown': outcome = 'Unknown · overage held'; detail = r.hubOverageId ? 'No consignment matches — held as a hub overage (Inbound → Overage).' : 'No consignment matches this label.'; break
      case 'already': outcome = 'Already scanned'; detail = 'No state change.'; break
      case 'closed': outcome = 'Already closed — logged'; detail = `${pr?.number ?? 'The request'}'s handover is closed — the scan is recorded in its log, nothing else changes.`; break
      case 'not-picked':
        outcome = 'Not picked · no change'
        detail = pr ? `${pr.number} is ${pr.status}; the parcel was not collected on it.` : 'Not in any pickup request.'
        break
      default:
        if (damaged) { outcome = 'Damaged'; detail = 'Received and flagged damaged.' }
        else if (before?.inboundHubCode && before.inboundHubCode !== hub) { outcome = 'Misroute'; detail = `Bound for ${before.inboundHubCode} — forward it.` }
        else if (!wasPicked && pr && isOpenPr(pr.status)) { outcome = 'Marked picked · PR pending'; detail = `Hub scan recorded the pickup; ${pr.number} is still ${pr.status}.` }
        else { outcome = 'Received'; detail = wasPicked ? 'Handover recorded.' : 'Recorded as picked by the hub scan.' }
    }
    setScans((s) => [{ n: s.length + 1, code: raw, at: new Date().toISOString(), hubCode: hub, outcome,
      consignment: before?.orderNumber ?? '—', prNumber: pr?.number ?? '—', detail }, ...s])
    setCode('')
  }

  const tally = useMemo(() => OUTCOMES.map((o) => [o, scans.filter((s) => s.outcome === o).length] as const), [scans])

  return (
    <div className="p-6">
      <PageHeader title="Scan to Inbound" onBack={() => nav('/local/inbound')}
        right={<Button variant="outline" icon={<BarChart3 size={15} />} onClick={() => setSummary(true)}>View Summary</Button>} />

      <Panel>
        <div className="grid grid-cols-[1fr_220px_auto] items-end gap-4 px-5 py-4">
          <div ref={box}>
            <Field label="Scan or type a consignment number">
              <Input size="lg" value={code} onChange={setCode} placeholder="Scan barcode and press Enter"
                onKeyDown={(e) => { if (e.key === 'Enter') scan() }} />
            </Field>
          </div>
          <Field label="Hub">
            <MenuSelect size="lg" value={hub} options={INBOUND_HUBS.map((h) => h.code)}
              labels={(c) => `${INBOUND_HUBS.find((h) => h.code === c)?.name ?? c} (${c})`} onChange={setHub} />
          </Field>
          <label className="flex h-11 items-center gap-2 text-[13px] text-ink-2">
            <Toggle checked={damaged} onChange={setDamaged} /> Mark as damaged
          </label>
        </div>
        {samples.length > 0 && (
          <p className="px-5 pb-4 text-[12.5px] text-ink-3">
            Try: {samples.map((s, i) => (
              <span key={s}>
                {i > 0 && ', '}
                <button type="button" className="font-mono font-bold text-brand-500 hover:underline" onClick={() => setCode(s)}>{s}</button>
              </span>
            ))}{', '}<button type="button" className="font-mono font-bold text-brand-500 hover:underline" onClick={() => setCode('UNKNOWN-0001')}>UNKNOWN-0001</button>
          </p>
        )}
      </Panel>

      <div className="mt-4">
        <Panel title={`Scanned (${scans.length})`}>
          {scans.length === 0
            ? <EmptyState title="Nothing scanned yet" hint="Each scan appears here with its outcome." />
            : (
              <SimpleTable rows={scans} rowKey={(s) => s.n} columns={[
                { label: '#', render: (s) => <span className="tabular-nums text-ink-3">{s.n}</span> },
                { label: 'Scanned', render: (s) => <span className="font-mono font-bold text-ink">{s.code}</span> },
                { label: 'Consignment', render: (s) => <span className="font-mono">{s.consignment}</span> },
                { label: 'PR', render: (s) => <span className="font-mono">{s.prNumber}</span> },
                { label: 'Hub', render: (s) => s.hubCode },
                { label: 'Outcome', render: (s) => <StatusPill label={s.outcome} tone={TONE[s.outcome]} /> },
                { label: 'Detail', render: (s) => <span className="text-ink-3">{s.detail}</span> },
                { label: 'Time', render: (s) => new Date(s.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
              ]} />
            )}
        </Panel>
      </div>

      <Modal open={summary} title="Scan summary" onClose={() => setSummary(false)}
        footer={<Button onClick={() => setSummary(false)}>Close</Button>}>
        <div className="grid grid-cols-4 gap-3 pb-4">
          <div className="rounded-md border border-line px-3 py-2">
            <p className="text-[12px] text-ink-3">Total scans</p>
            <p className="text-[17px] font-bold text-ink tabular-nums">{scans.length}</p>
          </div>
          {tally.map(([o, n]) => (
            <div key={o} className="rounded-md border border-line px-3 py-2">
              <StatusPill label={o} tone={TONE[o]} />
              <p className="mt-1 text-[17px] font-bold text-ink tabular-nums">{n}</p>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}

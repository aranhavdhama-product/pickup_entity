/**
 * View Pickup Request — the right-side drawer a pickup row opens.
 *
 * Built to be the SAME SURFACE as View Consignment, not a cousin of it: the same
 * `.pfp-overlay` shell, the same header, the same left rail of tabs, the same
 * `Section` → four-column grid inside the pane. A reader moving between a
 * consignment row and a pickup row should not have to re-learn where anything
 * is; only the tab names and the field inventory change, because the underlying
 * things genuinely differ.
 *
 * Where it differs is where a booking differs from a parcel — and those are the
 * tabs a consignment has no use for:
 *
 *  - **Orders** — what the booking covers, each marked picked or not.
 *  - **Reconciliation** — booked against actually collected. This is the tab
 *    that exists because `pickedOrderIds` may contain ids that are NOT in
 *    `orderIds`: a parcel booked under another request can be handed over here,
 *    which is precisely the fact a parent/child tree could not express.
 *  - **Overages** — barcodes scanned at the handover that matched no order in
 *    the system. Each one is a missing record, so they are listed, not counted.
 *
 * A Reserved booking's weight and piece count are the merchant's ESTIMATE, made
 * before any order existed. They render with a `~` and say so in words.
 */
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { PR_STATUSES } from '../../growOrders/tabs'
import type { GrowPickupRequest, PickupRequestStatus } from '../../growOrders/types'
import {
  ArrowLeft, ClipboardList, Close, ListTree, MapPin,
} from './icons'
import { EmptyState, StatusPill } from '../../nueva/components'
import { useGrowOrders } from '../../growOrders/store'
import { cancelReasonLabel, failureReasonLabel } from '../../growOrders/pickupReasons'
import { toPickupRow } from './adapter'
import { prTypeLabel } from '../LocalPickup/prModel'
import { fmtDateTime, pickupSummary, prOrders, prOutcomeWords } from '../GrowOrders/utils'
import { ArrowRight } from './icons'
import { Section } from './overlayBits'
import { dash, stamp } from './overlayFormat'
import { cssVars } from './stagingTokens'
import './pfpChrome.css'

/**
 * THREE tabs, not six.
 *
 * Summary and Booking described one thing from two angles, and Orders /
 * Reconciliation / Overages were three views of the same handover — what was
 * booked, what actually came, and what turned up with no record. Splitting them
 * made a reader visit three tabs to answer one question. The merchant portal
 * keeps them together on one card for the same reason; so does this.
 */
const TABS = ['Summary', 'Orders', 'Events']

/** the handover scan mode, in the settings page's own words */
const HANDOVER_MODE: Record<GrowPickupRequest['handover']['mode'], string> = {
  driver: 'Driver scan', hub: 'Hub scan', both: 'Driver + hub scan',
}
const TAB_ICONS = [ClipboardList, ListTree, MapPin]

/**
 * `basePath` = the list the drawer sits over (Pending For Planning by default;
 * the Pickup page passes `/local/pickup`). Outside the PFP tree the drawer
 * carries the PFP token variables itself, so it renders identically there.
 */
export default function ViewPickup({ basePath = '/local/pending-for-planning' }: { basePath?: string } = {}) {
  /* both PFP variants (current + `-replica`) already carry the token vars */
  const inPfp = basePath.startsWith('/local/pending-for-planning')
  return inPfp ? <ViewPickupBody basePath={basePath} /> : (
    <div className="fe-nueva" style={cssVars}><ViewPickupBody basePath={basePath} /></div>
  )
}

function ViewPickupBody({ basePath }: { basePath: string }) {
  const { prId } = useParams()
  const nav = useNavigate()
  const { search } = useLocation()
  const db = useGrowOrders()
  const [tab, setTab] = useState(0)

  /* back to the list on the tab it was opened from (`?tab=` rides along) */
  const back = () => nav(`${basePath}${search}`)

  const pr = db.pickupRequests.find((p) => p.id === prId)
  const row = useMemo(() => (pr ? toPickupRow(pr, db) : null), [pr, db])
  const byId = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders])
  /* owner, 2026-09-25: on Pending for Planning a booked order opens its
     consignment overlay; pushed (not replaced), so Back returns here */
  const inPfp = basePath.startsWith('/local/pending-for-planning')
  const orderLink = (id: string, number: string) => (inPfp ? (
    <button type="button" className="pfp-order pfp-orderlist-num" title={`View ${number}`}
      onClick={() => nav(`${basePath}/${id}${search}`, { state: { fromPickup: true } })}>
      <ArrowRight size={16} />{number}
    </button>
  ) : <span className="pfp-orderlist-num">{number}</span>)

  if (!pr || !row) {
    return (
      <>
        <div className="pfp-overlay-scrim" onClick={back} />
        <aside className="pfp-overlay" role="dialog" aria-label="Pickup request">
          <header className="pfp-overlay-head">
            <button type="button" className="pfp-iconbtn" aria-label="Back" onClick={back}><ArrowLeft size={16} /></button>
            <span className="pfp-overlay-title">Pickup request</span>
          </header>
          <div className="pfp-overlay-body" style={{ padding: 24 }}>
            <EmptyState title="This pickup request no longer exists." />
          </div>
        </aside>
      </>
    )
  }

  const summary = pickupSummary(pr)
  const booked = prOrders(pr, byId)
  const bookedIds = new Set(pr.orderIds)
  /* collected here but booked elsewhere — the fact a tree cannot show */
  const extra = pr.pickedOrderIds.filter((id) => !bookedIds.has(id))
  const reserved = row.rowType === 'Reserved Pickup'
  const ftl = row.rowType === 'FTL Pickup'

  const weight = row.weightKnown
    ? `${row.weightApprox ? '~ ' : ''}${row.weightKg.toFixed(1)} KG`
    : '—'
  const qty = row.qtyKnown
    ? `${row.qtyApprox ? '~ ' : ''}${row.qty} ${row.qtyUnit}${row.qty === 1 ? '' : 's'}`
    : '—'

  return (
    <>
      <div className="pfp-overlay-scrim" onClick={back} />
      <aside className="pfp-overlay" role="dialog" aria-label={`Pickup request ${row.reference}`}>
        <header className="pfp-overlay-head">
          <button type="button" className="pfp-iconbtn" aria-label="Back" onClick={back}>
            <ArrowLeft size={16} />
          </button>
          <span className="pfp-overlay-title">{row.reference}</span>
          <span className="pfp-pill">{row.state}</span>
          <span className="pfp-kindtag" data-tone="pickup">Pickup request</span>
          {row.overdue && <span className="pfp-kindtag" data-tone="danger">Overdue</span>}
          {/* from the Pickup page the full request page (actions, handover) is one click away */}
          {basePath === '/local/pickup' && (
            <button type="button" className="pfp-btn" style={{ marginLeft: 'auto' }} onClick={() => nav(`/local/pickup/${pr.id}`)}>
              Open full page
            </button>
          )}
          <button type="button" className="pfp-iconbtn" aria-label="Close" style={basePath === '/local/pickup' ? undefined : { marginLeft: 'auto' }} onClick={back}>
            <Close size={16} />
          </button>
        </header>

        <div className="pfp-overlay-body">
          <nav className="pfp-overlay-rail" aria-label="Pickup request sections">
            {TABS.map((t, i) => {
              const Icon = TAB_ICONS[i]
              /* the count rides the tab, so you can see there is something to
                 look at before you open it */
              const badge = t === 'Orders' ? booked.length + pr.overages.length : undefined
              return (
                <button key={t} type="button" className="pfp-overlay-tab"
                  aria-selected={tab === i} onClick={() => setTab(i)}>
                  <Icon size={16} />{t}
                  {badge !== undefined && badge > 0 && (
                    <span className="pfp-tab-badge">{badge}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="pfp-overlay-pane">
            <div className="flex flex-col gap-3">

              {TABS[tab] === 'Summary' && (
                <>
                  {reserved && (
                    <p className="pfp-note">
                      Reserved booking — made before any order existed. The weight and piece count
                      are the merchant&rsquo;s estimate, not a sum over real orders.
                    </p>
                  )}
                  <Section title="Summary" pairs={[
                    ['Request Number', row.reference],
                    ['Type', prTypeLabel(pr)],
                    ['Status', <StatusPill key="s" label={row.state} tone="info" />],
                    ['Secondary Status', dash(row.secondaryState)],
                    ['Merchant', row.merchant],
                    ['Shipment Type', pr.shipmentType],
                    ['Overdue', row.overdue ? 'Yes' : 'No'],
                    ['Created At', stamp(row.createdAt)],
                  ]} />
                  <Section title="Collection" pairs={[
                    ['Pickup Point', row.shipFromName],
                    ['Address', row.shipFromAddress],
                    ['Window Start', stamp(row.pickupWindow.start)],
                    ['Window End', stamp(row.pickupWindow.end)],
                    ['Same Day', row.sameDayWindow ? 'Yes' : 'No — crosses midnight'],
                    ['Driver Instructions', dash(row.instructions)],
                    ['Contact Name', dash(pr.contactName)],
                    ['Contact Number', dash(pr.contactNumber)],
                  ]} />
                  <Section title="Execution" pairs={[
                    ['Attempt', `${pr.attempt} / ${pr.maxAttempts}`],
                    ['Driver', dash(pr.driverName)],
                    ['Carrier', pr.carrierName
                      ? `${pr.carrierName}${pr.carrierMode ? ` (${pr.carrierMode === 'CARRIER' ? '3PL' : 'Fleet'})` : ''}`
                      : '—'],
                    ['Trip', pr.tripId
                      ? (
                        <button key="trip" type="button" className="pfp-order"
                          onClick={() => nav(`/local/control-tower/trips/${pr.tripId}`)}>
                          {pr.tripId}
                        </button>
                      )
                      : 'Not routed'],
                    ['Failure Reason', dash(failureReasonLabel(pr.failureReason))],
                    ['Cancel Reason', dash(cancelReasonLabel(pr.cancelReason))],
                    ['Handover', `${HANDOVER_MODE[pr.handover.mode]} · driver ${pr.handover.driverScanned.length}`
                      + ` · hub ${pr.handover.hubScanned.length}${pr.handover.closedAt ? ' · closed' : ''}`],
                    ['Manifest Ref', dash(pr.handover.manifestRef)],
                  ]} />
                  <Section title={ftl ? 'Ship To' : 'Destination'} pairs={[
                    [ftl ? 'Consignee' : 'Inbound Hub', row.shipToName],
                    ['Address', dash(row.shipToAddress)],
                    ['Facility Code', dash(pr.destinationCode)],
                  ]} />
                  <Section title="Load" pairs={[
                    ['Weight', weight],
                    [ftl ? 'Units' : 'Pieces', qty],
                    ['Orders Booked', String(pr.orderIds.length)],
                    ['Size Class', dash(row.sizeClass)],
                    ['Vehicle Type', dash(row.vehicleType)],
                    ['Number of Vehicles', row.vehicleUnit != null ? String(row.vehicleUnit) : '—'],
                    ['Expected Pieces', pr.expectedPieces != null ? String(pr.expectedPieces) : '—'],
                    ['Expected Weight', pr.expectedWeightKg != null ? `${pr.expectedWeightKg} KG` : '—'],
                  ]} />
                </>
              )}

              {/* ONE handover, read end to end: what was booked, how it
                  reconciled, and what arrived with no record behind it */}
              {TABS[tab] === 'Orders' && (
                <>
                  {row.pickedVsBooked && (
                    <Section title="Reconciliation" pairs={[
                      ['Booked', String(summary.booked)],
                      ['Picked', String(summary.picked)],
                      ['Left behind', String(Math.max(0, summary.booked - summary.picked))],
                      ['Collected here only', String(extra.length)],
                      ['Overage scans', pr.overages.length > 0 ? String(pr.overages.length) : '—'],
                      ['Outcome', dash(prOutcomeWords(pr) || row.state)],
                    ]} />
                  )}

                  <div>
                    <h3 className="pfp-section-title">Booked orders ({booked.length})</h3>
                    {booked.length === 0 ? (
                      <p className="pfp-empty-note">
                        {reserved
                          ? 'Nothing attached yet — this booking was made before the orders existed.'
                          : 'Nothing is booked into this collection.'}
                      </p>
                    ) : (
                      <ul className="pfp-orderlist">
                        {booked.map((o) => {
                          const picked = pr.pickedOrderIds.includes(o.id)
                          return (
                            <li key={o.id}>
                              {orderLink(o.id, o.orderNumber)}
                              <span className="pfp-orderlist-to">{o.receiver.name}</span>
                              <span className="pfp-kindtag" data-tone={picked ? 'ok' : undefined}>
                                {picked ? 'Picked' : 'Not picked'}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  {extra.length > 0 && (
                    <div>
                      <h3 className="pfp-section-title">Collected here only ({extra.length})</h3>
                      <p className="pfp-empty-note">
                        Booked under another request and handed over here. An order can have two
                        parents — which is exactly why the list is flat and not a tree.
                      </p>
                      <ul className="pfp-orderlist">
                        {extra.map((id) => {
                          const o = byId.get(id)
                          return (
                            <li key={id}>
                              {o ? orderLink(o.id, o.orderNumber) : <span className="pfp-orderlist-num">{id}</span>}
                              <span className="pfp-orderlist-to">{o?.receiver.name ?? ''}</span>
                              <span className="pfp-kindtag" data-tone="warn">Picked here</span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="pfp-section-title">Overages ({pr.overages.length})</h3>
                    {pr.overages.length === 0 ? (
                      <p className="pfp-empty-note">
                        Every barcode scanned at the handover matched an order in the system.
                      </p>
                    ) : (
                      <>
                        <p className="pfp-empty-note">
                          Scanned and matched no order. Each is a missing record, not a number — it
                          stays here until someone creates the order it belongs to.
                        </p>
                        <ul className="pfp-orderlist">
                          {pr.overages.map((ov) => (
                            <li key={ov.id}>
                              <span className="pfp-orderlist-num">{ov.barcode}</span>
                              <span className="pfp-orderlist-to">
                                {ov.note || (ov.weightKg != null ? `${ov.weightKg} kg` : '—')}
                              </span>
                              <span className="pfp-kindtag" data-tone={ov.orderId ? 'ok' : 'danger'}>
                                {ov.orderId ? 'Resolved' : 'Unresolved'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </>
              )}

              {TABS[tab] === 'Events' && <Events pr={pr} />}
            </div>
          </div>
        </div>
      </aside>

    </>
  )
}

/* ------------------------------------------------------------------ bits --- */

/**
 * The booking's progress, drawn as the merchant portal draws it: the WHOLE
 * status flow as a stepper, reached steps filled and joined, the rest waiting.
 *
 * A flat log of what happened cannot show what has NOT happened yet, which on a
 * collection is usually the thing you opened the drawer to find out. Several
 * events can share one status — attaching, removing and rescheduling all stamp
 * the state the request is already in — so a step keeps the FIRST time it was
 * reached and gathers every note written against it.
 *
 * The two terminal exits, Pickup Failed and Cancelled, are hidden unless the
 * booking actually reached one; showing them as pending steps would read as a
 * plan to fail.
 */
function Events({ pr }: { pr: GrowPickupRequest }) {
  const seen = new Map<PickupRequestStatus, { at: string; notes: string[] }>()
  pr.statusHistory.forEach((e: { status: PickupRequestStatus; at: string; note?: string }) => {
    const row = seen.get(e.status)
    if (row) { if (e.note) row.notes.push(e.note) } else seen.set(e.status, { at: e.at, notes: e.note ? [e.note] : [] })
  })
  const isExit = (s: PickupRequestStatus) => s === 'Pickup Failed' || s === 'Cancelled'
  const steps = PR_STATUSES.filter((s) => !isExit(s) || seen.has(s))
  const reached = steps.reduce((n, s, i) => (seen.has(s) ? i : n), -1)

  return (
    <ol className="pfp-events">
      {steps.map((label, i) => {
        const at = seen.get(label)
        const last = i === steps.length - 1
        return (
          <li key={label}>
            <span className="pfp-events-rail">
              <span className="pfp-events-dot" data-done={!!at || undefined} />
              {!last && <span className="pfp-events-line" data-done={i < reached || undefined} />}
            </span>
            <span className="pfp-events-body" data-last={last || undefined}>
              <span className="pfp-events-label" data-done={!!at || undefined}>{label}</span>
              {at && <span className="pfp-events-at">{fmtDateTime(at.at)}</span>}
              {at?.notes.map((n, k) => <span key={k} className="pfp-events-note">{n}</span>)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

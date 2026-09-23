/**
 * Inbound buckets (spec §3.4), DERIVED from the Grow store's requests and their
 * handover blocks plus planningStore's trips — nothing here is stored.
 *
 *   Incoming  — collected (picked / driver-scanned), not hub-scanned, truck not
 *               yet at the hub: trip In Transit (or no fleet trip — 3PL / manual
 *               pickups arrive without one);
 *   Pending   — collected, not hub-scanned, and the truck is at the hub
 *               (`handover.arrivedAtHubAt`, set by debrief / end trip) — the
 *               parcel should be here and is not (the Discrepancy case);
 *   Misroute  — a hub scan at a hub other than the order's inboundHubCode, until
 *               an in-scan at the right hub (after a forward, it reads Forwarded);
 *   Overage   — a driver overage scan still unresolved, or a Held hub overage
 *               (the hub scanner read a label that matched no order);
 *   Damage    — a hub scan flagged damaged;
 *   Completed — every hub scan.
 * The page applies its date range to each row's event day.
 */
import type { GrowOrdersDb, GrowPickupRequest, StoreLocation } from '../../growOrders/types'
import type { LocalTrip } from '../LocalPFP/planningStore'
import { localDay } from '../../growOrders/datetime'

export const INBOUND_TABS = ['Incoming', 'Pending', 'Misroute', 'Overage', 'Damage', 'Completed'] as const
export type InboundTab = (typeof INBOUND_TABS)[number]

export type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

export interface InboundRow {
  key: string
  tab: InboundTab
  /** null for an overage scan — there is no order yet */
  orderId: string | null
  code: string
  /** '' for a hub overage — nobody booked it */
  prId: string
  prNumber: string
  /** set on a Held hub overage row (the scanner read a label that matched nothing) */
  hubOverageId?: string
  /** a misroute row: the hub the parcel should be forwarded to, and whether it was */
  forwardTo?: string
  forwarded?: boolean
  merchant: string
  pickupPoint: string
  hubCode: string
  pickedAt: string | null
  scannedAt: string | null
  scannedBy: string | null
  status: string
  tone: Tone
  /** YYYY-MM-DD the date range filters on */
  day: string
}

const dayOf = (iso: string | null | undefined, fallback: string) => {
  if (!iso) return fallback
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? fallback : localDay(d)
}

export const merchantOf = (storeCode: string, stores: StoreLocation[]) =>
  stores.find((s) => s.code === storeCode)?.party.businessName?.trim() || storeCode

export const pickupPointOf = (pr: GrowPickupRequest, stores: StoreLocation[]) => {
  const store = stores.find((s) => s.code === pr.storeCode)
  const line = pr.shipFrom?.line1 || store?.party.line1 || ''
  return [store?.name ?? pr.storeCode, line].filter(Boolean).join(' — ')
}

/** When the collection closed: the FIRST Completed event (later notes — a hub
 *  scan, a forward — are stamped with the same status), else the first driver scan. */
export function pickedAtOf(pr: GrowPickupRequest): string | null {
  const done = pr.statusHistory.find((e) => e.status === 'Completed')
  return done?.at ?? pr.handover.scanLog.find((s) => s.by === 'driver')?.at ?? null
}

export function inboundRows(db: GrowOrdersDb, trips: LocalTrip[]): InboundRow[] {
  const out: InboundRow[] = []
  const orderOf = (id: string) => db.orders.find((o) => o.id === id)
  for (const pr of db.pickupRequests) {
    const base = {
      prId: pr.id, prNumber: pr.number,
      merchant: merchantOf(pr.storeCode, db.stores),
      pickupPoint: pickupPointOf(pr, db.stores),
    }
    const pickedAt = pickedAtOf(pr)
    const trip = trips.find((t) => t.id === pr.tripId)
    const hubScanned = new Set(pr.handover.hubScanned)

    /* collected but not at the hub yet */
    if (!pr.handover.closedAt) {
      const collected = [...new Set([...pr.pickedOrderIds, ...pr.handover.driverScanned])].filter((i) => !hubScanned.has(i))
      /* the truck reached the hub at debrief (`arrivedAtHubAt`) — from then on a
         missing hub scan is a discrepancy, not a parcel still en route */
      const debriefed = !!pr.handover.arrivedAtHubAt || trip?.status === 'Completed'
      const onRoad = !debriefed && (trip ? trip.status === 'In Transit' || trip.status === 'Yet to debrief' : pr.status === 'Completed')
      if (onRoad || debriefed) {
        for (const oid of collected) {
          const o = orderOf(oid)
          const driverScan = pr.handover.scanLog.find((s) => s.by === 'driver' && s.orderId === oid)
          out.push({
            ...base, key: `${debriefed ? 'P' : 'I'}-${pr.id}-${oid}`, tab: debriefed ? 'Pending' : 'Incoming',
            orderId: oid, code: o?.orderNumber ?? oid, hubCode: o?.inboundHubCode ?? pr.destinationCode ?? '',
            pickedAt, scannedAt: driverScan?.at ?? null, scannedBy: driverScan ? 'Driver' : null,
            status: debriefed ? 'Hub scan missing' : trip ? `On the road · ${trip.id}` : 'Awaiting arrival',
            tone: debriefed ? 'danger' : 'warning',
            day: dayOf(pickedAt, pr.date),
          })
        }
      }
    }

    /* every hub IN-scan → Completed, plus Misroute / Damage views of it. A
       `forwarded` entry is not an in-scan: it marks a misroute as sent on. */
    const inScans = pr.handover.scanLog.filter((s) => s.by === 'hub' && !s.forwarded)
    for (const s of inScans) {
      const o = orderOf(s.orderId)
      const expectedHub = o?.inboundHubCode ?? pr.destinationCode ?? ''
      const row = {
        ...base, orderId: s.orderId, code: o?.orderNumber ?? s.orderId, hubCode: expectedHub,
        pickedAt, scannedAt: s.at, scannedBy: `Hub${s.hubCode ? ` · ${s.hubCode}` : ''}`,
        day: dayOf(s.at, pr.date),
      }
      out.push({ ...row, key: `C-${pr.id}-${s.orderId}-${s.at}`, tab: 'Completed',
        status: s.damaged ? 'Received · damaged' : 'Received', tone: s.damaged ? 'warning' : 'success' })
      if (s.hubCode && expectedHub && s.hubCode !== expectedHub) {
        const later = pr.handover.scanLog.filter((x) => x.by === 'hub' && x.orderId === s.orderId && x.at > s.at)
        /* a later in-scan at the right hub closes the misroute */
        const landed = later.some((x) => !x.forwarded && x.hubCode === expectedHub)
        const fwd = later.find((x) => x.forwarded)
        if (!landed) {
          out.push({ ...row, key: `M-${pr.id}-${s.orderId}-${s.at}`, tab: 'Misroute',
            forwardTo: expectedHub, forwarded: !!fwd,
            status: fwd ? `Forwarded to ${fwd.hubCode ?? expectedHub}` : `Misrouted · belongs to ${expectedHub}`,
            tone: fwd ? 'info' : 'danger' })
        }
      }
      if (s.damaged) out.push({ ...row, key: `D-${pr.id}-${s.orderId}-${s.at}`, tab: 'Damage', status: 'Damaged', tone: 'danger' })
    }

    for (const ov of pr.overages) {
      if (ov.orderId) continue
      out.push({
        ...base, key: `O-${pr.id}-${ov.id}`, tab: 'Overage', orderId: null, code: ov.barcode,
        hubCode: pr.destinationCode ?? '', pickedAt, scannedAt: ov.scannedAt, scannedBy: 'Driver',
        status: 'Unresolved overage', tone: 'warning', day: dayOf(ov.scannedAt, pr.date),
      })
    }
  }

  /* labels the hub scanner read that matched no consignment — Held until ops
     attaches, creates or rejects (the settled ones leave the bucket) */
  for (const v of db.hubOverages ?? []) {
    if (v.status !== 'Held') continue
    out.push({
      key: `HO-${v.id}`, tab: 'Overage', orderId: null, code: v.code, prId: '', prNumber: '—',
      merchant: '—', pickupPoint: 'Unbooked label at the hub', hubCode: v.hubCode, pickedAt: null,
      scannedAt: v.at, scannedBy: `Hub${v.hubCode ? ` · ${v.hubCode}` : ''}`, hubOverageId: v.id,
      status: v.damaged ? 'Held · damaged' : 'Held', tone: 'warning', day: dayOf(v.at, ''),
    })
  }
  return out
}

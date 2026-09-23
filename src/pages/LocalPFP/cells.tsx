/**
 * One cell renderer per registry key, for BOTH row kinds.
 *
 * The registry (fieldRegistry.ts) is data only — it says what a column is, not
 * how it draws. This module is the other half: `cellFor(key, row)` returns the
 * cell, branching on `row.rowType`.
 *
 * Three rules, all from the workbook's Column mapping sheet:
 *  - A column the row's kind does not carry renders the field's documented
 *    `pickupDefault`, or an em dash. A dash means "no such value for this row
 *    type" and is deliberately distinct from a blank ("not yet known").
 *  - Never render 0 for an absent measurement — zero is a measurement.
 *  - A number that is the merchant's ESTIMATE rather than a sum over real
 *    orders is prefixed '~', because a number nobody counted must say so.
 *
 * A key with no entry here renders its `pickupDefault` / dash rather than
 * `undefined`: the registry declares 78 fields and the local demo store cannot
 * fill them all, and an empty cell is a better lie than `[object Object]`.
 */
/* eslint-disable react-refresh/only-export-components --
   This module is a TABLE OF CELL RENDERERS, not a component module: its exports
   are functions the grid calls per cell. TwoLine is a private JSX helper, never
   mounted by a consumer, so the fast-refresh boundary the rule protects does not
   apply here. */
import type { ReactNode } from 'react'
/* icons come from the tree's own extracted set — this route drops the lucide icon package */
import { WarningTriangle as AlertTriangle, ArrowDownLeft, ArrowUpRight } from './icons'
import { StatusPill, Tooltip } from '../../nueva/components'
import { isPickupRow, stateTone, pickupStateTone, type LocalConsignmentRow, type LocalPickupRow, type UnifiedRow } from './adapter'
import { FIELD_BY_KEY, ROW_TYPE_SHORT, type RowType } from './fieldRegistry'

const DASH = '—'

export function rowTypeTone(t: RowType): 'info' | 'warning' | 'neutral' | 'success' {
  if (t === 'Consignment') return 'info'
  if (t === 'FTL Pickup') return 'neutral'
  if (t === 'Reserved Pickup') return 'warning'
  return 'success'
}

const dt = (v: string) => (v ? v.replace('T', ', ') : DASH)
const or = (v: string | number | null | undefined, fallback: ReactNode = DASH): ReactNode =>
  v === '' || v === null || v === undefined ? fallback : v

/** Two lines in one cell — the shape every composite column uses. */
function TwoLine({ top, bottom, caption }: { top: ReactNode; bottom?: ReactNode; caption?: string }) {
  return (
    <>
      <span className="block truncate leading-tight">{top}</span>
      {bottom !== undefined && bottom !== '' && bottom !== null && (
        <span className="block truncate text-[12px] leading-tight text-ink-3">{bottom}</span>
      )}
      {caption && <span className="block truncate text-[11px] leading-tight text-warm-400">{caption}</span>}
    </>
  )
}

/* ------------------------------------------------------- consignment side -- */

function consignmentCell(key: string, r: LocalConsignmentRow): ReactNode | undefined {
  switch (key) {
    case 'rowType':
      return <StatusPill label="Consignment" tone={rowTypeTone('Consignment')} />
    case 'orderNumber':
      return (
        <TwoLine
          top={
            <span className="inline-flex items-center gap-1.5 font-bold text-ink">
              {r.exception && (
                <Tooltip text={r.exception}><AlertTriangle size={12} className="text-danger-fg" /></Tooltip>
              )}
              {r.orderTypeLabel === 'Forward'
                ? <ArrowUpRight size={12} className="text-ink-3" />
                : <ArrowDownLeft size={12} className="text-ink-3" />}
              {r.orderNumber}
            </span>
          }
          bottom={r.pickupRequestNumber || r.orderTypeLabel}
        />
      )
    case 'state':
      return (
        <>
          <StatusPill label={String(r.state)} tone={stateTone(String(r.state))} />
          {r.secondaryState && (
            <span className="mt-0.5 block truncate text-[12px] leading-tight text-ink-3">{r.secondaryState}</span>
          )}
        </>
      )
    /* the merged Window column shows a consignment's DELIVERY window */
    case 'window':
      return r.deliveryWindow
        ? <TwoLine top={`${dt(r.deliveryWindow.start)} → ${r.deliveryWindow.end.slice(11)}`} caption="Delivery" />
        : <TwoLine top={DASH} caption="Delivery" />
    case 'shipFromName':
      return <TwoLine top={r.origin} bottom={r.shipFromCode} />
    case 'shipToName':
      return <TwoLine top={r.shipToName} bottom={r.address} />
    case 'totalWeight':
      return <TwoLine top={`${r.weightKg} kg`} bottom={`${r.pieces} pc${r.pieces === 1 ? '' : 's'}`} />

    case 'referenceNumber': return r.referenceNumber
    case 'consignmentNumber': return r.consignmentNumber
    case 'secondaryState': return or(r.secondaryState)
    case 'exceptionState': return or(r.exception)
    case 'exceptionReason': return or(r.exception)
    case 'totalVolume': return r.volumeMm3.toLocaleString()
    case 'palletQuantity': return r.palletSpaces ?? 1
    case 'sku': return r.skuCount
    case 'serviceTime': return r.serviceTimeMin
    case 'shipByDate': return or(r.shipByDate)
    case 'merchant': return r.merchant
    case 'orderType': return r.orderTypeLabel
    case 'createdAt': return dt(r.order.createdAt)
    case 'ageing': return r.ageingDays
    case 'carrier': return r.carrier
    case 'dispatchDate': return dt(r.dispatchDate)
    case 'tags': return or(r.tag)
    case 'specialInstructions': return or(r.specialInstructions)
    case 'paymentMode': return r.order.paymentMode
    case 'codAmount': return r.order.codAmount > 0 ? r.order.codAmount.toLocaleString() : DASH
    case 'shipFromAddress': return r.origin
    case 'shipFromCode': return r.shipFromCode
    case 'shipToAddress': return r.address
    case 'shipToCode': return r.shipToCode
    case 'shipToPinCode': return or(r.shipToPincode)
    case 'shipToCity': return or(r.shipToCity)
    case 'shipToCounty': return or(r.shipToCounty)
    case 'serviceType': return r.serviceType
    case 'trackingNumber': return or(r.order.trackingNumber)
    case 'totalQuantity': return r.pieces
    case 'destinationFacilityCode': return or(r.destination)
    case 'address': return r.address
    case 'pickupWindow': return r.pickupWindow ? `${dt(r.pickupWindow.start)} → ${r.pickupWindow.end.slice(11)}` : DASH
    case 'deliveryWindow': return r.deliveryWindow ? `${dt(r.deliveryWindow.start)} → ${r.deliveryWindow.end.slice(11)}` : DASH
    case 'pickupRequestNumber': return or(r.pickupRequestNumber)
    case 'pickedIn': return or(r.pickedInNumber)
    case 'vehicleType': return or(r.order.vehicleType)
    case 'vehicleUnit': return or(r.order.vehicleUnit)
    case 'flags':
      return r.flags.length
        ? <span className="truncate">{r.flags.join(', ')}</span>
        : DASH
    default:
      return undefined
  }
}

/* ------------------------------------------------------------ pickup side -- */

function pickupCell(key: string, r: LocalPickupRow): ReactNode | undefined {
  /* '~' marks a number the merchant estimated on a Reserved booking */
  const weight = r.weightKnown ? `${r.weightApprox ? '~ ' : ''}${r.weightKg.toFixed(1)} kg` : DASH
  const qty = r.qtyKnown
    ? `${r.qtyApprox ? '~ ' : ''}${r.qty} ${r.qtyUnit}${r.qty === 1 ? '' : 's'}`
    : ''

  switch (key) {
    case 'rowType':
      return (
        <Tooltip text={r.rowType}>
          <span><StatusPill label={ROW_TYPE_SHORT[r.rowType]} tone={rowTypeTone(r.rowType)} /></span>
        </Tooltip>
      )
    case 'orderNumber':
      return (
        <TwoLine
          top={
            <span className="inline-flex items-center gap-1.5 font-bold text-ink">
              {r.exception && (
                <Tooltip text={r.exception}><AlertTriangle size={12} className="text-danger-fg" /></Tooltip>
              )}
              {r.reference}
            </span>
          }
          bottom={r.tags.join(' · ')}
        />
      )
    case 'state':
      return (
        <>
          <span className="inline-flex items-center gap-1">
            <StatusPill label={r.state} tone={pickupStateTone(r.request)} />
            {r.overageCount > 0 && (
              <Tooltip text={`${r.overageCount} scan${r.overageCount === 1 ? '' : 's'} matched no order`}>
                <span className="rounded-full border border-danger-fg/40 bg-danger-bg px-1 text-[10px] font-bold text-danger-fg">
                  +{r.overageCount}
                </span>
              </Tooltip>
            )}
          </span>
          {(r.secondaryState || r.overdue) && (
            <span className="mt-0.5 block truncate text-[12px] leading-tight text-ink-3">
              {r.overdue ? 'Overdue' : r.secondaryState}
            </span>
          )}
        </>
      )
    /* a pickup row's Window is the COLLECTION window — the caption says so */
    case 'window':
      return <TwoLine top={r.windowLabel} caption="Pickup" />
    case 'shipFromName':
      return <TwoLine top={r.shipFromName} bottom={r.shipFromAddress} />
    case 'shipToName':
      return (
        <TwoLine
          top={
            <span className="inline-flex items-center gap-1.5">
              {r.shipToName}
              {r.shipToIsHub && (
                <span className="rounded bg-warm-100 px-1 text-[10px] font-bold text-ink-3">Hub</span>
              )}
            </span>
          }
          bottom={r.shipToAddress}
        />
      )
    case 'totalWeight':
      return <TwoLine top={weight} bottom={qty} />

    case 'secondaryState': return or(r.secondaryState)
    case 'exceptionState': return or(r.exception)
    case 'merchant': return r.merchant
    case 'createdAt': return dt(r.createdAt)
    case 'ageing': return r.ageingDays
    case 'tags': return r.tags.length ? r.tags.join(', ') : DASH
    case 'specialInstructions': return or(r.instructions)
    case 'shipFromAddress': return r.shipFromAddress
    case 'shipToAddress': return or(r.shipToAddress)
    case 'shipToCode': return or(r.request.destinationCode)
    case 'destinationFacilityCode': return r.shipToIsHub ? r.shipToName : 'To be confirmed'
    case 'address': return r.shipFromAddress
    case 'totalQuantity': return r.qtyKnown ? qty : DASH
    case 'pickupWindow': return r.windowLabel
    case 'shipByDate': return r.pickupWindow.start.slice(0, 10)
    case 'pickupStartDateTime': return dt(r.pickupWindow.start)
    case 'pickupEndDateTime': return dt(r.pickupWindow.end)
    case 'pickupRequestNumber': return r.reference
    case 'pickedVsBooked': return or(r.pickedVsBooked)
    case 'overages': return r.overageCount > 0 ? r.overageCount : DASH
    case 'orders': return r.orderCount
    case 'vehicleType': return or(r.vehicleType)
    case 'vehicleUnit': return or(r.vehicleUnit)
    case 'sizeClass': return or(r.sizeClass)
    case 'schedulingConfirmed': return r.request.status === 'Requested' ? 'No' : 'Yes'
    default:
      return undefined
  }
}

/* ------------------------------------------------------------ the switch --- */

/**
 * The cell for `key` on `row`, honouring the column's EFFECTIVE applies-to
 * (the user's narrowing, or the declared capability when they made none).
 */
export function cellFor(col: { key: string; effectiveAppliesTo: string }, row: UnifiedRow): ReactNode {
  const def = FIELD_BY_KEY.get(col.key)
  const pickup = isPickupRow(row)

  /* narrowed away from this row kind → a dash, not a blank */
  const applies = col.effectiveAppliesTo
  if (applies !== 'both' && (pickup ? applies !== 'pickup' : applies !== 'consignment')) return DASH

  const value = pickup
    ? pickupCell(col.key, row)
    : consignmentCell(col.key, row as LocalConsignmentRow)

  if (value !== undefined) return value
  /* no renderer: the documented stand-in for this row kind */
  return pickup ? (def?.pickupDefault ?? DASH) : DASH
}

/**
 * Service Type — the LAST section of the merchant order form (owner, 2026-09-25: "it is being
 * derived from the OD pair"). The live Grow portal's block: a white card titled "Service Type"
 * with a pencil top-right; one full-width card per service — the name (17 bold), a house icon +
 * "Delivery by N DAY", a banknote icon + the rate. The selected card carries a 2px brand OUTLINE
 * and no fill; once chosen the list collapses to that card and the pencil reopens it.
 *
 * Above the cards: Shared vehicle (LTL) | Full vehicle (FTL). Full vehicle adds vehicle cards in
 * the same grammar (type · capacity · rate per vehicle · count stepper) from the Ship From hub's
 * fleet. Every rate is ESTIMATED (growOrders/rates).
 */
import { useState, type ReactNode } from 'react'
import { Banknote, Boxes, Home, Pencil, Truck } from 'lucide-react'
import type { ServiceQuote } from '../../growOrders/rates'
import { money } from './utils'
import { CountStepper, MSection, Segment } from './merchantFormBits'

export type BookingMode = 'ltl' | 'ftl'

/** One vehicle a merchant can book at the Ship From hub, with its rate on this lane. */
export interface FleetVehicle { code: string; name: string; payloadKg: number; capacity: string; rate: number }

const dayName = (iso: string) => {
  const d = new Date(`${iso}T00:00`)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** The card anatomy both lists share (also the read-only service card on the Grow View Consignment). */
export function RateCard({ title, left, right, trailing, selected, onClick, inert }: {
  title: ReactNode; left: ReactNode; right: ReactNode; trailing?: ReactNode; selected: boolean; onClick?: () => void
  /** not selectable yet (the route / packages are incomplete) */
  inert?: boolean
}) {
  return (
    <div role="radio" aria-checked={selected} aria-disabled={inert || undefined} tabIndex={inert ? -1 : 0} onClick={inert ? undefined : onClick}
      onKeyDown={(e) => { if (!inert && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick?.() } }}
      className={`w-full rounded-xl bg-surface text-left transition-colors
        focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/20
        ${selected ? 'cursor-pointer border-2 border-brand-500 px-[19px] py-[15px]'
          : inert ? 'cursor-default border border-line px-5 py-4'
          : 'cursor-pointer border border-line px-5 py-4 hover:border-warm-400'}`}>
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-[17px] font-bold leading-6 text-ink">{title}</p>
        {trailing}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">{left}</p>
        <p className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <Banknote size={16} className="shrink-0 text-ink-3" />{right}
        </p>
      </div>
    </div>
  )
}

export function ServiceTypeSection({
  ready, mode, onMode, modeLocked, quotes, selected, onSelect, currency, fleet, counts, onCount, fleetNote,
  showErrors, serviceLocked, children,
}: {
  /** OD pair + a weight exist — until then the cards show without rates and cannot be picked */
  ready: boolean
  /** null = no load type chosen yet: only the two choice cards show */
  mode: BookingMode | null
  onMode: (m: BookingMode) => void
  /** an overage order (always shared) or an FTL pickup request (always full) */
  modeLocked?: boolean
  quotes: ServiceQuote[]
  selected: string
  onSelect: (code: string) => void
  currency: string
  fleet: FleetVehicle[]
  counts: Record<string, number>
  onCount: (code: string, n: number) => void
  /** where the fleet came from ("Vehicles configured at San Pablo Hub") */
  fleetNote: string
  showErrors: boolean
  /** Service Type hidden by the consignment settings: only the default service is offered */
  serviceLocked?: boolean
  /** extra full-vehicle fields (loading time) */
  children?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const chosen = quotes.find((q) => q.code === selected)
  const collapsed = !!chosen && !editing
  const shown = collapsed ? [chosen] : quotes
  const vehicles = Object.values(counts).reduce((n, c) => n + c, 0)
  const pick = (code: string) => { onSelect(code); setEditing(false) }
  return (
    <MSection id="sec-service" title="Service Type"
      caption={mode ? 'Services and rates for this route. Pick one.' : 'Choose how it travels — the services for that option appear below.'}
      action={ready && chosen && !serviceLocked && quotes.length > 1 ? (
        <button type="button" title={editing ? 'Done' : 'Change service'} onClick={() => setEditing((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-warm-100">
          <Pencil size={14} />
        </button>
      ) : undefined}>
      <div className="max-w-[1060px]">
        <Segment<BookingMode> value={(mode ?? '') as BookingMode} onChange={onMode} disabled={modeLocked} options={[
          { value: 'ltl', label: 'Shared vehicle (LTL)', sub: 'Your packages travel with other shipments', icon: <Boxes size={18} /> },
          { value: 'ftl', label: 'Full vehicle (FTL)', sub: 'A whole vehicle just for this order', icon: <Truck size={18} /> },
        ]} />
        {!mode ? null : !quotes.length ? (
          <p className="mt-4 text-[13px] text-ink-3">
            No service offers a {mode === 'ftl' ? 'full vehicle' : 'shared vehicle'} on this route. Try the other option.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-3" role="radiogroup" aria-label="Service Type">
              {shown.map((q) => (
                <RateCard key={q.code} selected={ready && q.code === selected} inert={!ready} onClick={() => pick(q.code)}
                  title={q.name}
                  left={<><Home size={16} className="shrink-0 text-brand-500" />Delivery by <b className="text-ink">{q.days} DAY</b>
                    {ready && <span className="text-ink-3">· {dayName(q.deliveryBy)}</span>}</>}
                  right={ready ? money(q.net, currency) : '—'} />
              ))}
            </div>
            {showErrors && ready && !chosen && <p className="mt-2 text-[12px] text-danger-fg">Choose a service.</p>}
          </>
        )}

        {ready && mode === 'ftl' && chosen && (
          <div className="mt-6">
            <p className="text-[13px] font-bold text-ink">Vehicles</p>
            <p className="mt-0.5 text-[12px] text-ink-3">{fleetNote}</p>
            {fleet.length ? (
              <div className="mt-3 flex flex-col gap-3">
                {fleet.map((v) => {
                  const n = counts[v.code] ?? 0
                  return (
                    <RateCard key={v.code} selected={n > 0} onClick={() => onCount(v.code, n > 0 ? n : 1)}
                      title={v.name}
                      trailing={<CountStepper label={v.name} value={n} onChange={(x) => onCount(v.code, x)} />}
                      left={<><Truck size={16} className="shrink-0 text-brand-500" />{v.capacity || (v.payloadKg ? `Payload ${v.payloadKg.toLocaleString()} kg` : 'Capacity not configured')}</>}
                      right={<>{money(v.rate, currency)}<span className="text-[12px] font-normal text-ink-3">/ vehicle</span></>} />
                  )
                })}
              </div>
            ) : <p className="mt-3 text-[13px] text-ink-3">No vehicles are configured for this pickup location.</p>}
            {showErrors && vehicles === 0 && <p className="mt-2 text-[12px] text-danger-fg">Add at least one vehicle.</p>}
            {children}
          </div>
        )}
        {ready && quotes.length > 0 && (
          <p className="mt-4 text-[12px] text-ink-3">Estimated rates, before tax. The carrier confirms the final charge.</p>
        )}
      </div>
    </MSection>
  )
}

/**
 * Service Type — chosen on Grow's step 2 (checkout, owner 2026-10-06), the lane's cards; the form builder
 * previews it under "Next step" (owner, 2026-09-25: "it is being
 * derived from the OD pair"). The live Grow portal's block: a white card titled "Service Type"
 * with a pencil top-right; one full-width card per service — the name (17 bold), a house icon +
 * "Delivery by N DAY", a banknote icon + the rate. The selected card carries a 2px brand OUTLINE
 * and no fill; once chosen the list collapses to that card and the pencil reopens it.
 *
 * Above the cards: Shared vehicle (LTL) | Full vehicle (FTL). Full vehicle adds vehicle cards in
 * the same grammar (type · capacity · rate per vehicle · count stepper) from the Ship From hub's
 * fleet. Every rate is ESTIMATED (growOrders/rates).
 *
 * `layout="menu"` (owner, 2026-10-07: "Service Type a compact dropdown", the default): ONE dropdown — each line the service
 * name, the carrier and the rate; the chosen one is read back under it. No cards, so the second step stays short.
 *
 * `layout="grid"` (owner, 2026-10-05, the form builder's Services choice, the default): the live portal's compact
 * "Services" block — the cards two per row (inside one quiet frame only when the chooser shows its own load-type
 * segment; with `hideMode` they sit on the host's card): a radio, the name + the carrier, the rate (no transit days since
 * 2026-10-06). Nothing is preselected and nothing collapses (the grid is short enough to stay open). Not priced yet
 * (`ready` false) = the cards are faded, with no rate.
 */
import { useState, type ReactNode } from 'react'
import { Banknote, Boxes, Pencil, Truck } from 'lucide-react'
import type { ServiceQuote } from '../../growOrders/rates'
import { money } from './utils'
import { MenuSelect } from '../../nueva/components'
import { CountStepper, Segment } from './merchantFormBits'

export type BookingMode = 'ltl' | 'ftl'

/** One vehicle a merchant can book at the Ship From hub, with its rate on this lane. */
export interface FleetVehicle { code: string; name: string; payloadKg: number; capacity: string; rate: number }


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
          : inert ? 'cursor-default border border-line px-5 py-4 opacity-60'
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

/** One service in the grid: a radio, the name and the carrier on the left, the rate on the right (owner, 2026-10-06: no
    transit days on Grow's service cards). */
function ServiceChoice({ q, carrier, selected, inert, onClick, currency }: {
  q: ServiceQuote; carrier: string; selected: boolean; inert: boolean; onClick: () => void; currency: string
}) {
  return (
    <div role="radio" aria-checked={selected} aria-disabled={inert || undefined} tabIndex={inert ? -1 : 0} onClick={inert ? undefined : onClick}
      onKeyDown={(e) => { if (!inert && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick() } }}
      className={`flex min-w-0 items-center gap-4 rounded-lg bg-surface text-left transition-colors
        focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/20
        ${selected ? 'cursor-pointer border-2 border-brand-500 px-[19px] py-[15px]'
          : inert ? 'cursor-default border border-line px-5 py-4 opacity-60'
          : 'cursor-pointer border border-line px-5 py-4 hover:border-warm-400'}`}>
      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brand-500' : 'border-warm-400'}`}>
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold leading-6 text-ink">{q.name}</span>
        <span className="block truncate text-[13px] text-ink-3">{carrier}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[15px] font-bold leading-6 tabular-nums text-ink">{inert ? '' : money(q.net, currency)}</span>
      </span>
    </div>
  )
}

/** The body of the Grow form's Service Type card (the card itself is the form's own — AddConsignmentV2 merchant mode). */
export function ServiceTypeChooser({
  ready, mode, onMode, modeLocked, quotes, selected, onSelect, currency, fleet, counts, onCount, fleetNote,
  showErrors, serviceLocked, children, hideMode, layout = 'list', carrier = '', servicesHidden = false, vehiclesElsewhere = false,
}: {
  /** the vehicles are booked in their own card (the form's Vehicle Details, owner 2026-10-06) — no steppers here */
  vehiclesElsewhere?: boolean
  /** Service Type is hidden on the form: no service list (the default is booked) — only a full vehicle's vehicles show */
  servicesHidden?: boolean
  /** the load type is asked elsewhere (the form's Handling card) — no segment here */
  hideMode?: boolean
  /** 'grid' = two compact cards per row (the builder's default for Grow), 'list' = one full-width card each */
  layout?: 'menu' | 'grid' | 'list'
  /** who carries it — the line under each service's name in the grid */
  carrier?: string
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
  const grid = layout === 'grid'
  const menu = layout === 'menu'
  const chosen = quotes.find((q) => q.code === selected)
  const collapsed = !grid && !menu && !!chosen && !editing
  const shown = collapsed ? [chosen] : quotes
  const vehicles = Object.values(counts).reduce((n, c) => n + c, 0)
  const pick = (code: string) => { onSelect(code); setEditing(false) }
  return (
    <>
      {!grid && !menu && !servicesHidden && ready && chosen && !serviceLocked && quotes.length > 1 && (
        <div className="-mt-2 mb-3 flex justify-end">
          <button type="button" onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-500 hover:text-brand-600">
            <Pencil size={13} />{editing ? 'Done' : 'Change service'}
          </button>
        </div>
      )}
      <div className={grid ? '' : 'max-w-[1060px]'}>
        {!hideMode && <Segment<BookingMode> value={(mode ?? '') as BookingMode} onChange={onMode} disabled={modeLocked} options={[
          { value: 'ltl', label: 'Shared vehicle (LTL)', sub: 'Your packages travel with other shipments', icon: <Boxes size={18} /> },
          { value: 'ftl', label: 'Full vehicle (FTL)', sub: 'A whole vehicle just for this order', icon: <Truck size={18} /> },
        ]} />}
        {!mode ? null : !quotes.length ? (
          <p className="mt-4 text-[13px] text-ink-3">
            {servicesHidden ? 'No service can be booked on this route — please contact support.'
              : `No service offers a ${mode === 'ftl' ? 'full vehicle' : 'shared vehicle'} on this route. Try the other option.`}
          </p>
        ) : servicesHidden ? null : (
          <>
            {menu ? (
              <div className={hideMode ? '' : 'mt-4'}>
                <div className="max-w-[460px]">
                  <MenuSelect value={chosen?.code ?? ''} placeholder={ready ? 'Choose a service' : 'Add the route and packages first'} disabled={!ready}
                    options={quotes.map((q) => q.code)} labels={(c) => quotes.find((q) => q.code === c)?.name ?? c} onChange={pick}
                    renderOption={(c) => {
                      const q = quotes.find((x) => x.code === c)
                      return q ? (
                        <span className="flex w-full items-center justify-between gap-4">
                          <span className="min-w-0"><span className="block truncate font-bold text-ink">{q.name}</span>
                            <span className="block truncate text-[12px] text-ink-3">{carrier || 'Carrier assigned at booking'}</span></span>
                          <span className="shrink-0 font-bold text-ink">{money(q.net, currency)}</span>
                        </span>
                      ) : c
                    }}
                    renderValue={(c) => {
                      const q = quotes.find((x) => x.code === c)
                      return q ? <span className="flex w-full items-center justify-between gap-3"><span className="truncate">{q.name}</span><span className="shrink-0 font-bold">{money(q.net, currency)}</span></span> : c
                    }} />
                </div>
                {chosen && <p className="mt-2 text-[12px] text-ink-3">Carried by {carrier || 'the carrier assigned at booking'}.</p>}
              </div>
            ) : grid ? (
              /* inside the form's own card (hideMode) the cards sit on it directly — no second frame */
              <div className={hideMode ? '' : 'mt-4 rounded-xl border border-line p-5'}>
                <div className="grid gap-4 lg:grid-cols-2" role="radiogroup" aria-label="Service Type">
                  {quotes.map((q) => (
                    <ServiceChoice key={q.code} q={q} carrier={carrier} currency={currency} selected={ready && q.code === selected} inert={!ready}
                      onClick={() => pick(q.code)} />
                  ))}
                </div>
              </div>
            ) : (
            <div className={`${hideMode ? '' : 'mt-4 '}flex flex-col gap-3`} role="radiogroup" aria-label="Service Type">
              {shown.map((q) => (
                <RateCard key={q.code} selected={ready && q.code === selected} inert={!ready} onClick={() => pick(q.code)}
                  title={q.name}
                  left={<><Truck size={16} className="shrink-0 text-brand-500" />{carrier || 'Carrier assigned at booking'}</>}
                  right={ready ? money(q.net, currency) : ''} />
              ))}
            </div>
            )}
            {showErrors && ready && !chosen && <p className="mt-2 text-[12px] text-danger-fg">Choose a service.</p>}
          </>
        )}

        {ready && mode === 'ftl' && chosen && !vehiclesElsewhere && (
          <div className={servicesHidden ? '' : 'mt-6'}>
            {/* hidden services: the card itself is titled "Vehicles" */}
            {!servicesHidden && <p className="text-[13px] font-bold text-ink">Vehicles</p>}
            <p className="mt-0.5 text-[12px] text-ink-3">{fleetNote}</p>
            {fleet.length ? (
              <div className={`mt-3 ${grid ? 'grid gap-4 lg:grid-cols-2' : 'flex flex-col gap-3'}`}>
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
    </>
  )
}

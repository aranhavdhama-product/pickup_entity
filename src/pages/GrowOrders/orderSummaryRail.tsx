/**
 * Order summary — the sticky right rail of the merchant order form (the accepted Grow
 * "Order Summary" rail): pickup → delivery, what is being sent, the chosen service with its
 * promised date, the rate breakdown (freight · drops · value-added services · tax · total), and
 * the two exits — Continue to checkout, Save for later. Until a rate exists it says what is
 * still missing instead of a number.
 */
import type { ReactNode } from 'react'
import { ArrowRight, MapPin, Package, Truck } from 'lucide-react'
import { Button } from '../../nueva/components'
import type { Party } from '../../growOrders/types'
import type { ServiceQuote } from '../../growOrders/rates'
import { money } from './utils'

const where = (p: Party) => [p.name || p.businessName, [p.city, p.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')

function Block({ icon, label, children, onEdit }: { icon: ReactNode; label: string; children: ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex gap-3 border-b border-line py-3 last:border-b-0">
      <span className="mt-0.5 text-ink-3">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-bold text-ink-3">{label}</p>
          {onEdit && <button type="button" onClick={onEdit} className="text-[12px] font-bold text-brand-500 hover:text-brand-600">Edit</button>}
        </div>
        <div className="mt-0.5 text-[13px] text-ink">{children}</div>
      </div>
    </div>
  )
}

export function OrderSummaryRail({
  sender, receivers, boxes, chargeableKg, mode, vehicleLine, quote, priced = true, canContinue = true, currency, missing, onJump, onContinue, onSaveLater, problems,
}: {
  sender: Party
  receivers: Party[]
  boxes: number
  chargeableKg: number
  /** null = no load type chosen yet */
  mode: 'ltl' | 'ftl' | null
  /** false = Continue stays disabled (no service chosen yet) */
  canContinue?: boolean
  /** "2 × 8 Ton Truck" — full vehicle only */
  vehicleLine: string
  quote: ServiceQuote | null
  /** false = a service is chosen but nothing to price yet (a full vehicle with no vehicles) */
  priced?: boolean
  currency: string
  /** what still blocks a rate, in words */
  missing: string[]
  onJump: (sectionId: string) => void
  onContinue: () => void
  onSaveLater?: () => void
  /** after a Continue attempt: how many things are left */
  problems: number
}) {
  const hasFrom = !!(sender.line1 || sender.city)
  const to = receivers.filter((r) => r.line1 || r.city)
  return (
    <aside className="lg:sticky lg:top-4">
      <div className="rounded-xl border border-line bg-surface shadow-ds-1">
        <div className="px-5 pt-4">
          <h2 className="text-[15px] font-bold text-ink">Order summary</h2>
        </div>
        <div className="px-5 pb-2">
          <Block icon={<MapPin size={15} />} label="Pickup" onEdit={() => onJump('sec-from')}>
            {hasFrom ? where(sender) : <span className="text-ink-3">Not chosen yet</span>}
          </Block>
          <Block icon={<MapPin size={15} />} label={to.length > 1 ? `Delivery · ${to.length} addresses` : 'Delivery'} onEdit={() => onJump('sec-to')}>
            {to.length ? to.map((r, i) => <p key={i} className="truncate">{where(r)}</p>) : <span className="text-ink-3">Not entered yet</span>}
          </Block>
          <Block icon={<Package size={15} />} label="Packages" onEdit={() => onJump('sec-packages')}>
            {boxes > 0 && chargeableKg > 0
              ? <>{boxes} box{boxes === 1 ? '' : 'es'} · billed on {chargeableKg.toLocaleString()} kg</>
              : <span className="text-ink-3">Add a weight to see rates</span>}
          </Block>
          <Block icon={<Truck size={15} />} label={mode === 'ftl' ? 'Full vehicle' : mode === 'ltl' ? 'Shared vehicle' : 'Load type'} onEdit={() => onJump('sec-service')}>
            {!mode ? <span className="text-ink-3">Choose a load type</span> : quote ? (
              <>
                <p className="font-bold">{quote.name}</p>
                {mode === 'ftl' && vehicleLine && <p className="text-ink-2">{vehicleLine}</p>}
                <p className="text-ink-2">Delivery by <b className="text-ink">{quote.days} DAY</b> · {new Date(`${quote.deliveryBy}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              </>
            ) : <span className="text-ink-3">Choose a service</span>}
          </Block>
        </div>
        <div className="border-t border-line px-5 py-4">
          {quote && priced ? (
            <div className="space-y-1.5 text-[13px]">
              {quote.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-3"><span className="min-w-0 truncate text-ink-3" title={l.label}>{l.label}</span><span className="tabular-nums text-ink">{money(l.amount, currency)}</span></div>
              ))}
              <div className="flex justify-between gap-3"><span className="text-ink-3">Tax (15%)</span><span className="tabular-nums text-ink">{money(quote.tax, currency)}</span></div>
              <div className="mt-2 flex justify-between gap-3 border-t border-line pt-2 text-[15px] font-bold text-ink">
                <span>Total</span><span className="tabular-nums">{money(quote.total, currency)}</span>
              </div>
              <p className="text-[12px] text-ink-3">Estimated. Paid at checkout.</p>
            </div>
          ) : (
            <div className="text-[13px] text-ink-3">
              <p className="font-bold text-ink-2">No rate yet</p>
              {missing.length > 0
                ? <ul className="mt-1 list-disc pl-4 text-[12px]">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                : <p className="mt-1 text-[12px]">Choose a service to see the rate.</p>}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 [&>button]:w-full">
            <Button onClick={onContinue} disabled={!canContinue} icon={<ArrowRight size={14} />}>Continue to checkout</Button>
            {onSaveLater && <Button variant="text" onClick={onSaveLater}>Save for later</Button>}
          </div>
          {problems > 0 && <p className="mt-2 text-[12px] text-danger-fg">{problems} thing{problems === 1 ? '' : 's'} still need{problems === 1 ? 's' : ''} your attention.</p>}
        </div>
      </div>
    </aside>
  )
}

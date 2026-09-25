/**
 * Get Quote — `/grow/orders/quote`, the live portal's `/rateseta/` page ("Quotes —
 * Check the price for the package and create order"), capture:
 * docs/superpowers/research/2026-09-25-grow-portal-pages.md §3.
 *
 * Live arrangement in our tokens: LEFT (≈60%) — "Where are you sending from?"
 * (the default pickup address + a pencil that swaps in a picker) and "Whom are
 * you sending to?" (Country · Postal Code) in one card, then Package Details
 * (Package 1…n: Quantity · Weight · L × W × H, "+ Add Item", the totals line).
 * RIGHT (≈40%, sticky) — the 4-step progress (From · To · Weight and Volume ·
 * Delivery Options), the price block (Delivery · Total · ETA), Get Quote, Create
 * order now, and the freight-only note.
 *
 * Our one addition: after Get Quote, step 4 lists EVERY bookable service for the
 * lane as the order form's own service cards (`serviceCards.tsx` `RateCard`),
 * priced by the same `rates.ts` `quoteLane` the form and checkout use; the
 * chosen card drives the price block. "Create order now" hands the lane, the
 * packages and the service to the Create Consignment form through the session
 * draft (`grow-order-draft`, the same key checkout's Back uses).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Home, Info, Navigation, Pencil, Plus, Trash2 } from 'lucide-react'
import { useGrowOrders } from '../../growOrders/store'
import { partyFromLocation } from '../../growOrders/masters'
import { DRAFT_KEY, volKg, type OrderDraft, type Parcel } from '../../growOrders/draft'
import { chargeableKg, currencyForHub, quoteLane, shipFromHubOf, type ServiceQuote } from '../../growOrders/rates'
import type { Party } from '../../growOrders/types'
import { Button, Field, Input, MenuSelect } from '../../nueva/components'
import { usePickupLocations, useReceiverBook } from './pickupLocations'
import { RateCard } from './serviceCards'
import { fmtDate, money } from './utils'

interface Pkg { quantity: string; weight: string; l: string; w: string; h: string }
const blankPkg = (): Pkg => ({ quantity: '1', weight: '', l: '', w: '', h: '' })
const num = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }
const pkgOk = (p: Pkg) => num(p.quantity) >= 1 && num(p.l) > 0 && num(p.w) > 0 && num(p.h) > 0
const toParcel = (p: Pkg): Parcel => ({
  cargoType: 'Parcel', itemInfo: '', quantity: Math.max(1, Math.round(num(p.quantity))), weight: num(p.weight),
  l: num(p.l), w: num(p.w), h: num(p.h), weightMode: 'manual',
})
const line = (p: Party) => [p.city, p.state, p.country, p.postalCode].filter(Boolean).join(', ')

/** One postal destination: the known place behind a postal code (city / state drive the lane zone). */
interface Dest { key: string; party: Party }

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line bg-surface px-5 py-4">{children}</div>
}
const H = ({ children }: { children: React.ReactNode }) => <p className="mb-3 text-[15px] font-bold text-ink">{children}</p>

export default function GrowQuotePage() {
  const db = useGrowOrders()
  const nav = useNavigate()
  const pickup = usePickupLocations(db.stores)
  const book = useReceiverBook(db.orders)

  /* ---- from: the default pickup address; the pencil swaps in a picker ---- */
  const [fromCode, setFromCode] = useState<string | null>(null)
  const fromStore = pickup.stores.find((s) => s.code === fromCode) ?? pickup.stores[0] ?? null
  const [editFrom, setEditFrom] = useState(false)
  const [draftFrom, setDraftFrom] = useState('')
  const sender = fromStore?.party ?? partyFromLocation({})
  const country = sender.country || 'Philippines'

  /* ---- to: Country (fixed to the sender's) + Postal Code from known places ---- */
  const dests = useMemo(() => {
    const seen = new Map<string, Dest>()
    for (const p of [...book.map((b) => b.party), ...pickup.stores.map((s) => s.party)]) {
      if (!p.postalCode || (p.country && p.country !== country)) continue
      const key = `${p.postalCode} · ${p.city || p.state}`
      if (!seen.has(key)) seen.set(key, { key, party: partyFromLocation({ country: p.country || country, postalCode: p.postalCode, city: p.city, state: p.state }) })
    }
    return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key))
  }, [book, pickup.stores, country])
  const [destKey, setDestKey] = useState('')
  const dest = dests.find((d) => d.key === destKey) ?? null

  /* ---- packages ---- */
  const [pkgs, setPkgs] = useState<Pkg[]>([blankPkg()])
  const setPkg = (i: number, patch: Partial<Pkg>) => { setPkgs((xs) => xs.map((p, k) => (k === i ? { ...p, ...patch } : p))); setQuotes(null) }
  const parcels = pkgs.map(toParcel)
  const totalWeight = parcels.reduce((n, p) => n + p.weight * p.quantity, 0)
  const totalVol = parcels.reduce((n, p) => n + volKg(p) * p.quantity, 0)
  const totalQty = parcels.reduce((n, p) => n + p.quantity, 0)

  /* ---- the quote ---- */
  const [quotes, setQuotes] = useState<ServiceQuote[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const currency = currencyForHub(shipFromHubOf(fromStore?.code, sender), sender)
  const ready = !!fromStore && !!dest && pkgs.every(pkgOk)
  const getQuote = () => {
    if (!ready || !dest) return
    const qs = quoteLane({ from: sender, to: dest.party, parcels, mode: 'ltl', currency }).sort((a, b) => a.total - b.total)
    setQuotes(qs)
    setPicked(qs[0]?.code ?? null)
  }
  const chosen = quotes?.find((q) => q.code === picked) ?? null

  const createOrder = () => {
    if (!chosen || !dest || !fromStore) return
    const draft: OrderDraft = {
      storeCode: fromStore.code, sender, receiver: dest.party, drops: [], shipmentType: 'Parcel', vehicleType: '',
      vehicleUnit: 1, actualLoad: 0, additionalServices: [], parcels,
      authority: '', instructions: '', secure: false, service: chosen.code, rate: chosen.net, etaDays: chosen.days,
      currency,
    }
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* private mode */ }
    nav('/grow/orders/add')
  }

  const steps: { label: string; value: string | null }[] = [
    { label: 'From', value: fromStore ? [sender.postalCode, sender.country].filter(Boolean).join(', ') || fromStore.name : null },
    { label: 'To', value: dest ? [dest.party.postalCode, dest.party.city, dest.party.country].filter(Boolean).join(', ') : null },
    { label: 'Weight and Volume', value: pkgs.every(pkgOk) ? `${chargeableKg(parcels).chargeable.toFixed(2)} kg chargeable · ${totalQty} pc` : null },
    { label: 'Delivery Options', value: chosen ? chosen.name : null },
  ]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-3">Check the price for the package and create order.</p>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ------------------------------------------------ left ---------- */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <H>Where are you sending from?</H>
            {!editFrom ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warm-100 text-ink-2"><Navigation size={16} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink">{fromStore?.name ?? 'No pickup address yet'}</p>
                  <p className="truncate text-[12px] text-ink-3">{fromStore ? [sender.line1, line(sender)].filter(Boolean).join(' · ') : 'Add one under Settings → Pickup Address'}</p>
                </div>
                <button type="button" title="Change pickup address" aria-label="Change pickup address"
                  onClick={() => { setDraftFrom(fromStore?.code ?? ''); setEditFrom(true) }}
                  className="rounded p-1.5 text-ink-3 hover:bg-warm-50 hover:text-ink"><Pencil size={15} /></button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Field label="Pickup address" required>
                  <MenuSelect value={draftFrom} onChange={setDraftFrom} options={pickup.stores.map((s) => s.code)}
                    labels={(c) => { const s = pickup.stores.find((x) => x.code === c); return s ? `${s.name} · ${line(s.party)}` : c }}
                    searchable={pickup.stores.length > 6} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditFrom(false)}>Cancel</Button>
                  <Button disabled={!draftFrom} onClick={() => { setFromCode(draftFrom); setEditFrom(false); setQuotes(null) }}>Update</Button>
                </div>
              </div>
            )}

            <div className="mt-5">
              <H>Whom are you sending to?</H>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Country" required><Input value={country} disabled /></Field>
                <Field label="Postal Code" required>
                  <MenuSelect value={destKey} placeholder="Select postal code" onChange={(v) => { setDestKey(v); setQuotes(null) }}
                    options={dests.map((d) => d.key)} searchable={dests.length > 8} />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <H>Package Details</H>
            <div className="flex flex-col gap-4">
              {pkgs.map((p, i) => (
                <div key={i} className={i ? 'border-t border-line pt-4' : ''}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[13px] font-bold text-ink">Package {i + 1}</p>
                    {pkgs.length > 1 && (
                      <button type="button" aria-label={`Remove package ${i + 1}`} title="Remove"
                        onClick={() => { setPkgs((xs) => xs.filter((_, k) => k !== i)); setQuotes(null) }}
                        className="rounded p-1 text-ink-3 hover:bg-warm-50 hover:text-ink"><Trash2 size={14} /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    <Field label="Quantity"><Input type="number" value={p.quantity} onChange={(v) => setPkg(i, { quantity: v })} /></Field>
                    <Field label="Weight (kg)"><Input type="number" value={p.weight} placeholder="0" onChange={(v) => setPkg(i, { weight: v })} /></Field>
                    <Field label="Length (cm)" required><Input type="number" value={p.l} placeholder="L" onChange={(v) => setPkg(i, { l: v })} /></Field>
                    <Field label="Width (cm)" required><Input type="number" value={p.w} placeholder="W" onChange={(v) => setPkg(i, { w: v })} /></Field>
                    <Field label="Height (cm)" required><Input type="number" value={p.h} placeholder="H" onChange={(v) => setPkg(i, { h: v })} /></Field>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => { setPkgs((xs) => [...xs, blankPkg()]); setQuotes(null) }}
                className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-500 hover:underline"><Plus size={14} />Add Item</button>
            </div>
            <p className="mt-3 border-t border-line pt-3 text-[13px] text-ink-2">
              Total Weight: <b className="text-ink">{totalWeight.toFixed(2)} kg</b>
              <span className="mx-2 text-warm-300">·</span>Volumetric Weight: <b className="text-ink">{totalVol.toFixed(2)} kg</b>
              <span className="mx-2 text-warm-300">·</span>Total Quantity: <b className="text-ink">{totalQty}</b>
            </p>
          </Card>

          {quotes && (
            <Card>
              <H>Delivery Options</H>
              <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="Delivery options">
                {quotes.map((q) => (
                  <RateCard key={q.code} title={q.name} selected={q.code === picked} onClick={() => setPicked(q.code)}
                    left={<><Home size={15} className="shrink-0 text-ink-3" />Delivery by {fmtDate(q.deliveryBy)} · {q.days} day{q.days === 1 ? '' : 's'}</>}
                    right={money(q.total, q.currency)} />
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ------------------------------------------------ right rail ---- */}
        <div className="lg:sticky lg:top-2">
          <Card>
            <ol className="flex flex-col">
              {steps.map((s, i) => (
                <li key={s.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold
                      ${s.value ? 'bg-ink text-white' : 'bg-warm-100 text-ink-3'}`}>
                      {s.value ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    {i < steps.length - 1 && <span className="my-1 w-px flex-1 bg-line" style={{ minHeight: 18 }} />}
                  </div>
                  <div className="min-w-0 pb-3">
                    <p className="text-[13px] font-bold text-ink">{s.label}</p>
                    <p className="truncate text-[12px] text-ink-3">{s.value ?? '—'}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-1 flex flex-col gap-1 border-t border-line pt-3 text-[13px]">
              <Row label="Delivery" value={chosen ? money(chosen.net, chosen.currency) : `${currency}--`} />
              <Row label="Taxes" value={chosen ? money(chosen.tax, chosen.currency) : `${currency}--`} />
              <Row label="Total" value={chosen ? money(chosen.total, chosen.currency) : `${currency}--`} strong />
              <Row label="ETA" value={chosen ? `${fmtDate(chosen.deliveryBy)} (${chosen.days} day${chosen.days === 1 ? '' : 's'})` : '--'} />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Button disabled={!ready} onClick={getQuote}>Get Quote</Button>
              <Button variant="outline" disabled={!chosen} onClick={createOrder}>Create order now</Button>
            </div>
            {!ready && (
              <p className="mt-2 text-[12px] text-ink-3">
                {!dest ? 'Choose the destination postal code' : 'Enter every package\'s dimensions'} to get a quote.
              </p>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-snug text-ink-3">
              <Info size={13} className="mt-0.5 shrink-0" />
              Quote is inclusive of freight and fuel charges only. Taxes shown are estimated; any other fees are displayed at checkout.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-2">{label}</span>
      <span className={strong ? 'text-[15px] font-bold text-ink' : 'text-ink'}>{value}</span>
    </div>
  )
}

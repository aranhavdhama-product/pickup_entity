/**
 * Rate Calculator — what a booking would cost, before anyone commits to it.
 *
 * It quotes from the SAME rate card the Add Order flow and checkout use
 * (`growOrders/draft.ts`: `parcelQuote`, `ftlQuote`, `withTax`), so a number
 * seen here and the number charged at checkout cannot disagree. That is the
 * whole point of a calculator — one that kept its own prices would be a
 * plausible-looking lie.
 *
 * VOLUMETRIC WEIGHT is shown for parcels because it is the thing merchants get
 * wrong: a light, bulky box is billed on its size, not its scale weight. The
 * chargeable figure is the greater of the two, and both are displayed so the
 * reason is visible rather than assumed.
 */
import { useMemo, useState } from 'react'
import { Calculator, Package, Truck } from 'lucide-react'
import {
  ADDITIONAL_SERVICES, DEFAULT_FTL_SERVICE, EXTRA_DROP_RATE, FTL_SERVICE_CODES, PARCEL_SERVICES, TAX_RATE, VEHICLE_SPECS,
  VEHICLE_UNITS, coerceVehicleType, ftlQuote, parcelQuote, vehiclesFor, volKg, withTax,
} from '../../growOrders/draft'
import { CURRENCY } from '../../growOrders/seed'
import { money } from './utils'
import { Button, Field, Input, MenuSelect, Modal, Tabs } from '../../nueva/components'

const TABS = ['Parcel', 'Vehicle (FTL)'] as const
const TAB_ICONS = [Package, Truck]

const num = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function RateCalculatorDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<string>(TABS[0])

  /* parcel inputs */
  const [weight, setWeight] = useState('')
  const [l, setL] = useState('')
  const [w, setW] = useState('')
  const [h, setH] = useState('')
  const [service, setService] = useState(PARCEL_SERVICES[0].code)

  /* vehicle inputs */
  const [ftlService, setFtlService] = useState(DEFAULT_FTL_SERVICE)
  const [vehicleType, setVehicleType] = useState(vehiclesFor(DEFAULT_FTL_SERVICE)[0].type)
  const pickFtlService = (code: string) => { setFtlService(code); setVehicleType((t) => coerceVehicleType(code, t)) }
  const [units, setUnits] = useState('1')
  const [drops, setDrops] = useState('0')
  const [services, setServices] = useState<string[]>([])

  const parcel = useMemo(() => {
    const actual = num(weight)
    const volumetric = volKg({ l: num(l), w: num(w), h: num(h) } as never)
    const chargeable = Math.max(actual, volumetric)
    const net = parcelQuote(service)
    return { actual, volumetric, chargeable, net, gross: withTax(net) }
  }, [weight, l, w, h, service])

  const ftl = useMemo(() => {
    const net = ftlQuote(vehicleType, num(units) || 1, num(drops), services)
    return { net, gross: withTax(net) }
  }, [vehicleType, units, drops, services])

  const isParcel = tab === TABS[0]
  const quote = isParcel ? parcel : ftl
  const spec = VEHICLE_SPECS.find((v) => v.type === vehicleType)

  return (
    <Modal open title="Rate Calculator" onClose={onClose}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <p className="mb-3 text-[12.5px] text-ink-3">An estimate from the same rate card checkout charges from.</p>
      <Tabs tabs={[...TABS]} active={TABS.indexOf(tab as (typeof TABS)[number])} icons={TAB_ICONS}
        onChange={(i) => setTab(TABS[i])} />

      <div className="flex flex-col gap-4 pb-3 pt-4">
        {isParcel ? (
          <>
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="Actual weight (kg)"><Input type="number" value={weight} onChange={setWeight} placeholder="0" /></Field>
              <Field label="Service">
                <MenuSelect value={service} onChange={setService} options={PARCEL_SERVICES.map((s) => s.code)}
                  labels={(c) => `${c} · ${PARCEL_SERVICES.find((s) => s.code === c)?.days ?? '-'} days`} />
              </Field>
            </div>
            <div className="grid grid-cols-3 items-end gap-3">
              <Field label="Length (cm)"><Input type="number" value={l} onChange={setL} placeholder="0" /></Field>
              <Field label="Width (cm)"><Input type="number" value={w} onChange={setW} placeholder="0" /></Field>
              <Field label="Height (cm)"><Input type="number" value={h} onChange={setH} placeholder="0" /></Field>
            </div>

            {/* the number merchants are surprised by, shown with its working */}
            <div className="rounded-md border border-line px-4 py-3 text-[13px]">
              <Row label="Actual weight" value={`${parcel.actual.toFixed(2)} kg`} />
              <Row label="Volumetric weight" value={`${parcel.volumetric.toFixed(2)} kg`} />
              <Row label="Chargeable" value={`${parcel.chargeable.toFixed(2)} kg`} strong />
              <p className="mt-2 text-[12px] leading-snug text-ink-3">
                Billed on whichever is greater — a light, bulky parcel is charged for the space it
                takes, not what it weighs.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="Service type">
                <MenuSelect value={ftlService} onChange={pickFtlService} options={FTL_SERVICE_CODES} />
              </Field>
            </div>
            <div className="grid grid-cols-2 items-start gap-3">
              <Field label="Vehicle type">
                <MenuSelect value={vehicleType} onChange={setVehicleType} options={vehiclesFor(ftlService).map((v) => v.type)} />
                {spec?.capacity && <p className="mt-1 text-[12px] text-ink-3">{spec.capacity}</p>}
              </Field>
              <Field label="Number of vehicles">
                <MenuSelect value={units} onChange={setUnits} options={VEHICLE_UNITS} />
              </Field>
            </div>
            <div className="grid grid-cols-2 items-start gap-3">
              <Field label="Extra delivery addresses">
                <Input type="number" value={drops} onChange={setDrops} placeholder="0" />
                <p className="mt-1 text-[12px] text-ink-3">{money(EXTRA_DROP_RATE, CURRENCY)} per address after the first</p>
              </Field>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink-2">Additional services</p>
              <div className="flex flex-col gap-2">
                {ADDITIONAL_SERVICES.map((s) => {
                  const on = services.includes(s.code)
                  return (
                    <button key={s.code} type="button"
                      onClick={() => setServices((v) => (on ? v.filter((x) => x !== s.code) : [...v, s.code]))}
                      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-[13px] transition-colors
                        ${on ? 'border-brand-500 bg-brand-50/60' : 'border-line hover:border-warm-300'}`}>
                      <span className="min-w-0">
                        <span className={`block font-bold ${on ? 'text-brand-500' : 'text-ink'}`}>{s.code}</span>
                        <span className="block truncate text-[12px] text-ink-3">{s.note}</span>
                      </span>
                      <span className="shrink-0 text-ink">{money(s.price, CURRENCY)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* the quote itself, with the tax shown rather than folded in */}
        <div className="rounded-md border border-line bg-warm-25 px-4 py-3 text-[13px]">
          <Row label={isParcel ? 'Delivery' : 'Vehicle + extras'} value={money(quote.net, CURRENCY)} />
          <Row label={`Taxes (${Math.round(TAX_RATE * 100)}%)`} value={money(quote.gross - quote.net, CURRENCY)} />
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <span className="text-[14px] font-bold text-ink">Estimated total</span>
            <span className="text-[18px] font-bold text-ink">{money(quote.gross, CURRENCY)}</span>
          </div>
        </div>

        <p className="flex items-start gap-2 text-[12px] leading-snug text-ink-3">
          <Calculator size={14} className="mt-0.5 shrink-0" />
          An estimate. The amount charged is whatever the order carries at checkout — the same rate
          card feeds both, so they should agree.
        </p>
      </div>
    </Modal>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-ink-2">{label}</span>
      <span className={strong ? 'font-bold text-ink' : 'text-ink'}>{value}</span>
    </div>
  )
}

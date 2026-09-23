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
import { Btn, Dialog, OutlinedField, TabStrip } from './ui'

const TABS = ['Parcel', 'Vehicle (FTL)'] as const
const TAB_ICONS = { Parcel: Package, 'Vehicle (FTL)': Truck }

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
    <Dialog open title="Rate Calculator"
      subtitle="An estimate from the same rate card checkout charges from."
      onClose={onClose}
      footer={<Btn variant="outlined" color="neutral" onClick={onClose}>Close</Btn>}>
      <TabStrip tabs={TABS} active={tab} icons={TAB_ICONS} onChange={setTab} />

      <div className="space-y-5 pt-1">
        {isParcel ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <OutlinedField label="Actual weight (kg)" type="number" value={weight} onChange={setWeight} placeholder="0" />
              <OutlinedField label="Service" value={service} onChange={setService}
                options={PARCEL_SERVICES.map((s) => ({ value: s.code, label: `${s.code} · ${s.days} days` }))} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <OutlinedField label="Length (cm)" type="number" value={l} onChange={setL} placeholder="0" />
              <OutlinedField label="Width (cm)" type="number" value={w} onChange={setW} placeholder="0" />
              <OutlinedField label="Height (cm)" type="number" value={h} onChange={setH} placeholder="0" />
            </div>

            {/* the number merchants are surprised by, shown with its working */}
            <div className="rounded-[6px] border border-grow-line px-4 py-3 text-[13px]">
              <Row label="Actual weight" value={`${parcel.actual.toFixed(2)} kg`} />
              <Row label="Volumetric weight" value={`${parcel.volumetric.toFixed(2)} kg`} />
              <Row label="Chargeable" value={`${parcel.chargeable.toFixed(2)} kg`} strong />
              <p className="mt-2 text-[12px] leading-snug text-grow-ink-3">
                Billed on whichever is greater — a light, bulky parcel is charged for the space it
                takes, not what it weighs.
              </p>
            </div>
          </>
        ) : (
          <>
            <OutlinedField label="Service type" value={ftlService} onChange={pickFtlService}
              options={FTL_SERVICE_CODES.map((v) => ({ value: v, label: v }))} />
            <div className="grid grid-cols-2 gap-4">
              <OutlinedField label="Vehicle type" value={vehicleType} onChange={setVehicleType}
                options={vehiclesFor(ftlService).map((v) => ({ value: v.type, label: v.type }))}
                helper={spec?.capacity} />
              <OutlinedField label="Number of vehicles" value={units} onChange={setUnits}
                options={VEHICLE_UNITS.map((v) => ({ value: v, label: v }))} />
            </div>
            <OutlinedField label="Extra delivery addresses" type="number" value={drops} onChange={setDrops}
              placeholder="0" helper={`${money(EXTRA_DROP_RATE, CURRENCY)} per address after the first`} />

            <div>
              <p className="mb-2 text-[14px] font-medium text-grow-ink">Additional services</p>
              <div className="flex flex-col gap-2">
                {ADDITIONAL_SERVICES.map((s) => {
                  const on = services.includes(s.code)
                  return (
                    <button key={s.code} type="button"
                      onClick={() => setServices((v) => (on ? v.filter((x) => x !== s.code) : [...v, s.code]))}
                      className={`flex items-center justify-between gap-3 rounded-[6px] border px-3 py-2 text-left text-[13px] transition-colors
                        ${on ? 'border-grow-accent-2 bg-grow-accent-2/5' : 'border-grow-line hover:border-grow-ink-3'}`}>
                      <span className="min-w-0">
                        <span className="block font-medium text-grow-ink">{s.code}</span>
                        <span className="block truncate text-[12px] text-grow-ink-2">{s.note}</span>
                      </span>
                      <span className="shrink-0 text-grow-ink">{money(s.price, CURRENCY)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* the quote itself, with the tax shown rather than folded in */}
        <div className="rounded-[6px] bg-grow-canvas px-4 py-3">
          <Row label={isParcel ? 'Delivery' : 'Vehicle + extras'} value={money(quote.net, CURRENCY)} />
          <Row label={`Taxes (${Math.round(TAX_RATE * 100)}%)`} value={money(quote.gross - quote.net, CURRENCY)} />
          <div className="mt-2 flex items-center justify-between border-t border-grow-line pt-2">
            <span className="text-[15px] font-semibold text-grow-ink">Estimated total</span>
            <span className="text-[19px] font-semibold text-grow-ink">{money(quote.gross, CURRENCY)}</span>
          </div>
        </div>

        <p className="flex items-start gap-2 text-[12px] leading-snug text-grow-ink-3">
          <Calculator size={14} className="mt-0.5 shrink-0" />
          An estimate. The amount charged is whatever the order carries at checkout — the same rate
          card feeds both, so they should agree.
        </p>
      </div>
    </Dialog>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-grow-ink-2">{label}</span>
      <span className={strong ? 'font-semibold text-grow-ink' : 'text-grow-ink'}>{value}</span>
    </div>
  )
}

/**
 * libphonenumber — live capability demo.
 *
 * Runs Google's actual phone-number library (the `google-libphonenumber` JS port,
 * Apache-2.0) entirely in the browser to showcase: parsing, validation
 * (valid / possible / valid-for-region), number-type classification, the four
 * canonical formats (E.164 / international / national / RFC3966), region + country
 * code detection, as-you-type formatting, and per-country example numbers.
 *
 * Ties back to FarEye: consignment phone fields store input verbatim with only a
 * 16-char cap and no validation — this is what proper handling looks like.
 */
import { useMemo, useState } from 'react'
import { PhoneNumberUtil, PhoneNumberFormat as PF, PhoneNumberType as PT, AsYouTypeFormatter } from 'google-libphonenumber'

const util = PhoneNumberUtil.getInstance()
const regionName = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null } })()
const flag = (cc: string) => /^[A-Z]{2}$/.test(cc) ? cc.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))) : '🏳️'
const nameOf = (cc: string) => { try { return regionName?.of(cc) ?? cc } catch { return cc } }

const REGIONS = util.getSupportedRegions()
  .map((cc) => ({ cc, name: String(nameOf(cc)), calling: util.getCountryCodeForRegion(cc) }))
  .sort((a, b) => a.name.localeCompare(b.name))

const TYPE: Record<number, [string, string]> = {
  [PT.FIXED_LINE]: ['Fixed line', 'sky'],
  [PT.MOBILE]: ['Mobile', 'emerald'],
  [PT.FIXED_LINE_OR_MOBILE]: ['Fixed line or mobile', 'teal'],
  [PT.TOLL_FREE]: ['Toll-free', 'violet'],
  [PT.PREMIUM_RATE]: ['Premium rate', 'amber'],
  [PT.SHARED_COST]: ['Shared cost', 'amber'],
  [PT.VOIP]: ['VoIP', 'indigo'],
  [PT.PERSONAL_NUMBER]: ['Personal number', 'slate'],
  [PT.PAGER]: ['Pager', 'slate'],
  [PT.UAN]: ['UAN', 'slate'],
  [PT.VOICEMAIL]: ['Voicemail', 'slate'],
  [PT.UNKNOWN]: ['Unknown', 'slate'],
}
const TONE: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700', sky: 'bg-sky-100 text-sky-700',
  teal: 'bg-teal-100 text-teal-700', violet: 'bg-violet-100 text-violet-700',
  amber: 'bg-amber-100 text-amber-700', indigo: 'bg-indigo-100 text-indigo-700',
  slate: 'bg-slate-200 text-slate-700',
}

interface Result {
  parsed: boolean; error?: string
  valid?: boolean; possible?: boolean; validForRegion?: boolean
  type?: number; regionCode?: string | null; countryCode?: number; international?: boolean
  e164?: string; intl?: string; nat?: string; rfc?: string
}

function analyze(input: string, region: string): { asYouType: string; res: Result } {
  const ayt = new AsYouTypeFormatter(region)
  let f = ''
  for (const ch of input) if (/[\d+]/.test(ch)) f = ayt.inputDigit(ch)
  if (!input.trim()) return { asYouType: '', res: { parsed: false } }
  try {
    const n = util.parse(input, region)
    return {
      asYouType: f,
      res: {
        parsed: true,
        valid: util.isValidNumber(n),
        possible: util.isPossibleNumber(n),
        validForRegion: util.isValidNumberForRegion(n, region),
        type: util.getNumberType(n),
        regionCode: util.getRegionCodeForNumber(n),
        countryCode: n.getCountryCode(),
        international: input.trim().startsWith('+'),
        e164: util.format(n, PF.E164),
        intl: util.format(n, PF.INTERNATIONAL),
        nat: util.format(n, PF.NATIONAL),
        rfc: util.format(n, PF.RFC3966),
      },
    }
  } catch (e: any) {
    return { asYouType: f, res: { parsed: false, error: String(e?.message ?? e) } }
  }
}

const SAMPLES: [string, string, string][] = [
  ['415-555-2671', 'US', 'US local mobile/fixed'],
  ['1-800-266-8228', 'US', 'US toll-free'],
  ['+44 7911 123456', 'GB', 'UK mobile'],
  ['+91 98765 43210', 'IN', 'India mobile'],
  ['020 7946 0018', 'GB', 'London landline'],
  ['+81 90-1234-5678', 'JP', 'Japan mobile'],
  ['+49 30 123456', 'DE', 'Berlin landline'],
  ['+61 412 345 678', 'AU', 'Australia mobile'],
  ['+971 50 123 4567', 'AE', 'UAE mobile'],
  ['+55 11 91234-5678', 'BR', 'São Paulo mobile'],
  ['12345', 'US', 'too short → invalid'],
  ['+1 900 555 0199', 'US', 'US premium rate'],
]

const GEN_TYPES: [string, number][] = [
  ['Mobile', PT.MOBILE], ['Fixed line', PT.FIXED_LINE], ['Toll-free', PT.TOLL_FREE],
  ['Premium rate', PT.PREMIUM_RATE], ['VoIP', PT.VOIP], ['UAN', PT.UAN],
]

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />{label}: {ok ? 'yes' : 'no'}
    </span>
  )
}

function FmtRow({ label, value }: { label: string; value?: string }) {
  const copy = () => value && navigator.clipboard?.writeText(value)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 py-2">
      <span className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <code className="truncate font-mono text-[13.5px] text-slate-800">{value || '—'}</code>
        {value && <button onClick={copy} className="shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-50">copy</button>}
      </div>
    </div>
  )
}

export default function PhoneDemo() {
  const [region, setRegion] = useState('US')
  const [input, setInput] = useState('4155552671')
  const [genRegion, setGenRegion] = useState('GB')
  const [genType, setGenType] = useState<number>(PT.MOBILE)

  const { asYouType, res } = useMemo(() => analyze(input, region), [input, region])

  const example = useMemo(() => {
    try {
      const n = util.getExampleNumberForType(genRegion, genType as any)
      return n ? { intl: util.format(n, PF.INTERNATIONAL), e164: util.format(n, PF.E164) } : null
    } catch { return null }
  }, [genRegion, genType])

  const typeInfo = res.type != null ? (TYPE[res.type] ?? ['Unknown', 'slate']) : null

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* header */}
      <header className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            <span className="rounded-full bg-white/20 px-2.5 py-0.5">Apache-2.0 · open source</span>
            <a href="https://github.com/google/libphonenumber/" target="_blank" rel="noreferrer" className="rounded-full bg-white/20 px-2.5 py-0.5 hover:bg-white/30">github.com/google/libphonenumber ↗</a>
          </div>
          <h1 className="mt-3 text-[28px] font-black tracking-tight">libphonenumber — live demo</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-indigo-100">
            Google's phone-number library, running in your browser. Parse, validate, classify, format and
            auto-format phone numbers for {REGIONS.length} regions — from per-country metadata, no network calls.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* analyzer */}
        <section className="grid gap-5 md:grid-cols-2">
          {/* input */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[15px] font-bold">Analyze a number</h2>
            <label className="mt-4 block text-[12px] font-semibold uppercase tracking-wide text-slate-400">Default region</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] focus:border-indigo-500 focus:outline-none">
              {REGIONS.map((r) => <option key={r.cc} value={r.cc}>{flag(r.cc)} {r.name} (+{r.calling})</option>)}
            </select>
            <label className="mt-4 block text-[12px] font-semibold uppercase tracking-wide text-slate-400">Phone number</label>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a number…"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[15px] focus:border-indigo-500 focus:outline-none" />
            <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-500">
              <span className="font-semibold uppercase tracking-wide text-slate-400">As you type</span>
              <code className="font-mono text-[13.5px] text-slate-800">{asYouType || '…'}</code>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {[['4155552671', 'US'], ['18002668228', 'US'], ['+447911123456', 'GB'], ['+919876543210', 'IN']].map(([v, r]) => (
                <button key={v} onClick={() => { setRegion(r); setInput(v) }}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-50">{v}</button>
              ))}
            </div>
          </div>

          {/* result */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[15px] font-bold">Result</h2>
            {!res.parsed ? (
              <div className="mt-6 rounded-lg bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">
                {res.error ? `Not parseable yet — ${res.error}` : 'Type a number to see the analysis.'}
              </div>
            ) : (
              <>
                {res.regionCode && (
                  <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-3xl leading-none">{flag(res.regionCode)}</span>
                    <div>
                      <div className="text-[15px] font-bold text-slate-800">{String(nameOf(res.regionCode))} <span className="font-mono text-[13px] text-slate-500">({res.regionCode} · +{res.countryCode})</span></div>
                      <div className="text-[11.5px] text-slate-500">
                        {res.international ? '🔎 Detected from the number — default region ignored' : `Assumed from default region (${region}) — number has no + prefix`}
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Chip ok={!!res.valid} label="Valid" />
                  <Chip ok={!!res.possible} label="Possible" />
                  <Chip ok={!!res.validForRegion} label={`Valid for ${region}`} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
                  {typeInfo && <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONE[typeInfo[1]]}`}>{typeInfo[0]}</span>}
                </div>
                <div className="mt-4">
                  <FmtRow label="E.164" value={res.e164} />
                  <FmtRow label="International" value={res.intl} />
                  <FmtRow label="National" value={res.nat} />
                  <FmtRow label="RFC3966 (URI)" value={res.rfc} />
                </div>
              </>
            )}
          </div>
        </section>

        {/* sample gallery */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-bold">Classification gallery</h2>
          <p className="mt-1 text-[13px] text-slate-500">The same library run over a spread of real-world inputs — note how it tells mobile from landline from toll-free, and rejects the invalid one.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">Input</th><th className="py-2 pr-3">Region</th>
                  <th className="py-2 pr-3">E.164</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Valid</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLES.map(([val, reg, note]) => {
                  const { res: r } = analyze(val, reg)
                  const ti = r.type != null ? (TYPE[r.type] ?? ['Unknown', 'slate']) : null
                  return (
                    <tr key={val + reg} className="border-t border-slate-100">
                      <td className="py-2 pr-3"><code className="font-mono text-slate-800">{val}</code><div className="text-[11px] text-slate-400">{note}</div></td>
                      <td className="py-2 pr-3">{flag(reg)} {reg}</td>
                      <td className="py-2 pr-3 font-mono text-slate-700">{r.e164 ?? '—'}</td>
                      <td className="py-2 pr-3">{ti ? <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${TONE[ti[1]]}`}>{ti[0]}</span> : '—'}</td>
                      <td className="py-2 pr-3">{r.valid ? <span className="text-emerald-600 font-semibold">✓</span> : <span className="text-rose-500 font-semibold">✕</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* example generator */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-bold">Example number generator</h2>
          <p className="mt-1 text-[13px] text-slate-500">The library ships a valid sample number for each region and type — handy for tests and placeholders.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-wide text-slate-400">Region</label>
              <select value={genRegion} onChange={(e) => setGenRegion(e.target.value)}
                className="mt-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] focus:border-indigo-500 focus:outline-none">
                {REGIONS.map((r) => <option key={r.cc} value={r.cc}>{flag(r.cc)} {r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold uppercase tracking-wide text-slate-400">Type</label>
              <select value={genType} onChange={(e) => setGenType(Number(e.target.value))}
                className="mt-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] focus:border-indigo-500 focus:outline-none">
                {GEN_TYPES.map(([label, t]) => <option key={t} value={t}>{label}</option>)}
              </select>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Example</div>
              <code className="font-mono text-[15px] text-slate-800">{example ? example.intl : 'No example for this type'}</code>
            </div>
          </div>
        </section>

        {/* capabilities + fareye tie-in */}
        <section className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[15px] font-bold">What it does</h2>
            <ul className="mt-3 space-y-1.5 text-[13px] text-slate-600">
              {[
                'Parse messy input into a structured number (given a default region)',
                'Validate — full validity, "possible" length check, and valid-for-region',
                'Classify — mobile / fixed / toll-free / premium / VoIP / UAN …',
                'Format — E.164, international, national, RFC3966 tel: URI',
                'Detect region + country calling code from the number',
                'As-you-type formatting for input fields',
                'Generate valid example numbers per region & type',
              ].map((t) => <li key={t} className="flex gap-2"><span className="text-indigo-500">•</span>{t}</li>)}
            </ul>
            <p className="mt-3 text-[12px] text-slate-400">Geocoding, carrier and timezone lookups exist as separate companion modules in the full library.</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
            <h2 className="text-[15px] font-bold text-indigo-900">Why this matters for FarEye</h2>
            <p className="mt-3 text-[13px] text-indigo-900/80">
              FarEye consignment phone fields store whatever is typed <b>verbatim</b> — formatted, alphabetic, even
              <code className="mx-1 rounded bg-white/60 px-1 font-mono">CALL-ME</code> — with only a 16-character cap and
              <b> no validation</b>. Dropping libphonenumber in front of those fields would reject bad numbers at entry,
              normalize everything to <b>E.164</b> for storage, and keep a display format for the UI — the exact gap the
              phone-formatting ticket describes.
            </p>
          </div>
        </section>

        <footer className="pb-6 text-center text-[12px] text-slate-400">
          Runs <code className="font-mono">google-libphonenumber</code> (Apache-2.0) fully client-side. No number leaves the browser.
        </footer>
      </main>
    </div>
  )
}

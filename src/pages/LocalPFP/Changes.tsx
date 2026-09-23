/**
 * What changed in Pending for Planning — the one page that says what this
 * surface does differently from the console's own, and WHY.
 *
 * It exists because the differences are decisions, not drift: each one was
 * forced by the same fact, that this list holds two kinds of thing where the
 * console's holds one. A reader who does not know that reads every change as a
 * bug. The rationale column is the point of the page.
 *
 * Kept as data (`CHANGES`) rather than prose so a new change is one entry, not
 * a rewrite — and so the counts in the header cannot drift from the list.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'

type Area = 'Rows' | 'Columns' | 'Totals' | 'Filters' | 'Actions' | 'Data' | 'Settings'
type Kind = 'added' | 'changed' | 'fixed'

interface Change {
  area: Area
  kind: Kind
  what: string
  why: string
  /** where it lives, for anyone who needs to read the code */
  where?: string
}

const AREAS: Area[] = ['Rows', 'Columns', 'Totals', 'Filters', 'Actions', 'Data', 'Settings']

const KIND_STYLE: Record<Kind, string> = {
  added: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  changed: 'border-amber-200 bg-amber-50 text-amber-700',
  fixed: 'border-sky-200 bg-sky-50 text-sky-700',
}

const CHANGES: Change[] = [
  /* ------------------------------------------------------------------ rows */
  {
    area: 'Rows', kind: 'added',
    what: 'Pickup requests appear in the queue as peer rows, alongside consignments.',
    why: 'Both are things waiting to be planned. Keeping them on two screens meant nobody could see the whole morning at once.',
    where: 'adapter.ts → toPickupRow()',
  },
  {
    area: 'Rows', kind: 'changed',
    what: 'The list is FLAT — a pickup row does not expand into the consignments it covers.',
    why: 'A parcel can be booked into one pickup request and handed over at another (pickedOrderIds may contain ids that are not in orderIds). A tree must pick ONE parent, so it would either hide that fact or duplicate the row under both — which breaks selection counts and totals. Flat rows carry both facts as two columns instead.',
  },
  {
    area: 'Rows', kind: 'added',
    what: 'Four row types, not two: Consignment · Pickup Request · Reserved Pickup · FTL Pickup.',
    why: 'Reserved and FTL behave differently enough from a plain booking — no orders, no destination hub, units instead of orders — that collapsing them into one "Pickup" hides the difference exactly where it matters.',
    where: 'fieldRegistry.ts → ROW_TYPES',
  },
  {
    area: 'Rows', kind: 'changed',
    what: 'Clicking a pickup opens a drawer built on the SAME shell as the consignment one — same header, same left rail of tabs, same four-column field grid.',
    why: 'A pickup row has no order id, so the click used to do nothing at all. Making its drawer a different shape would have been the next problem: someone moving between a consignment row and a pickup row should not have to re-learn where anything is. Only the tab names and the field inventory differ, because the underlying things do. Its six tabs are Summary · Booking · Orders · Reconciliation · Overages · History — the last three being what a consignment drawer has no use for.',
    where: 'ViewPickup.tsx',
  },

  /* --------------------------------------------------------------- columns */
  {
    area: 'Columns', kind: 'changed',
    what: 'Order Type is renamed Type and moved forward to sit just after Reference Number.',
    why: 'The name had to go generic because the column no longer answers only "forward or reverse" — it answers "what kind of thing is this row", across four kinds. And it had to move: at its measured position, 17 columns in, it sat past the right edge of the viewport, so the one column that identifies a row could only be read by scrolling to find it.',
    where: 'stagingTokens.ts → COLUMNS',
  },
  {
    area: 'Columns', kind: 'changed',
    what: 'Type is now two levels: the record kind on top (Consignment / Pickup Request), its sub-classification beneath — LTL · FTL · Reserved for a booking, and direction plus LEG CHAIN for a consignment (Forward · FM-MM-LM).',
    why: 'One label could not answer both "what is this row" and "what does the network have to do with it". The leg chain applies the platform\'s own 12-row topology matrix to local data: LM is always present, MM appears when the origin hub differs from the destination, FM appears when a collection from the merchant is actually booked. The origin hub is derived by running the STORE address through the same inboundHubFor the receiver uses, so "did this parcel change hub" is answered from real geography rather than assumed.',
    where: 'adapter.ts → legsOf() · pickupLoadOf()',
  },
  {
    area: 'Columns', kind: 'changed',
    what: 'Type is tinted on a pickup row and left neutral on a consignment.',
    why: 'Consignments are the ordinary case and should stay quiet; the tint is what lets a mixed list separate at a glance without a second marker saying the same thing.',
  },
  {
    area: 'Columns', kind: 'fixed',
    what: 'The icon column shows at most three flags, with a +n for the rest, and narrowed from 160px to 112px.',
    why: 'There are five category flags, and five 28px discs with their gaps need 188px — so the measured 160px silently clipped a fully-flagged row. Capping the icons makes the cell\'s width independent of how many flags a row carries, which is what lets the column be narrower AND stop losing flags. On an 1152px viewport where the grid already scrolls, the 48px goes back to the columns that carry text.',
    where: 'stagingTokens.ts → FLAGS_WIDTH',
  },
  {
    area: 'Columns', kind: 'changed',
    what: 'Columns a pickup row cannot fill show a dash, not a blank and never a zero.',
    why: 'A dash means "no such value for this kind of row". A blank reads as "not known yet", and a zero is a measurement — "0 delivery attempts" is a different claim from "a pickup has no delivery leg".',
  },
  {
    area: 'Columns', kind: 'added',
    what: 'Pickup Request # and Picked in are available as columns.',
    why: 'They are how a flat list gets grouping without a tree — and Picked in is the column a parent/child tree could not express at all.',
  },

  /* ---------------------------------------------------------------- totals */
  {
    area: 'Totals', kind: 'fixed',
    what: 'Weight, volume and pallet totals count consignment rows ONLY; pickups get their own count.',
    why: 'A pickup request and the orders it covers are the same parcels seen twice. Summing both double-counted every kilogram on screen.',
    where: 'index.tsx → totals',
  },
  {
    area: 'Totals', kind: 'changed',
    what: 'The selection readout switches to "n orders · m pickups" when the selection is mixed.',
    why: 'Same reason — a weight total over a mixed selection would be wrong, so it is not shown at all rather than shown wrong.',
  },

  /* --------------------------------------------------------------- filters */
  {
    area: 'Filters', kind: 'changed',
    what: 'Merchant is a dropdown on the filter row itself, no longer buried in the funnel popover.',
    why: 'On a console that works across merchants it is the dimension you reach for first, so it should not take two clicks to find. It stays bound to the same state the funnel used, so the filter logic is unchanged — the control moved, the behaviour did not — and it is no longer offered in both places.',
  },
  {
    area: 'Filters', kind: 'added',
    what: 'A Row Type filter, and a one-click way back to a consignments-only view.',
    why: 'The most-used control on a mixed list, and the escape hatch for anyone who wants the old screen back verbatim.',
  },
  {
    area: 'Filters', kind: 'changed',
    what: 'The State list is the set difference of both vocabularies, not two lists bolted together.',
    why: 'Six of the eight pickup statuses already existed in the consignment vocabulary. Only Requested and Cancelled are genuinely new values.',
  },
  {
    area: 'Filters', kind: 'added',
    what: 'Filters that cannot apply to a pickup are labelled "Excludes pickups".',
    why: 'Setting Sort Code or Service Type silently halves the list, because no pickup row has one. Silently halving the list is the failure mode; saying so is the fix.',
    where: 'TableSettings.tsx → Filters tab',
  },
  {
    area: 'Filters', kind: 'changed',
    what: 'Quick Filter cards count both kinds, each by its own test.',
    why: 'A card that counted only consignments would report a smaller number than the list it filters to.',
  },
  {
    area: 'Filters', kind: 'added',
    what: 'Exceptions gained Overage and Pickup Failed.',
    why: 'The console\'s exception vocabulary has no word for a barcode that matched no order, or for a collection nobody turned up to.',
  },

  /* --------------------------------------------------------------- actions */
  {
    area: 'Actions', kind: 'changed',
    what: 'Every bulk action shows how many of the selected rows it will actually act on, and greys out at zero.',
    why: 'Each one addresses an order id, and selecting a pickup request does not select the orders it covers. Running against the eligible subset without a word would be a silent partial action; the count says what will happen before you commit to it.',
    where: 'index.tsx → SelectionPanel',
  },
  {
    area: 'Actions', kind: 'fixed',
    what: 'Selecting pickups no longer produces an empty selection.',
    why: 'The panel measured the consignment half only, so a selection of pickup requests read "3 Selected" with zero weight and every action silently doing nothing.',
  },
  {
    area: 'Actions', kind: 'changed',
    what: 'The panel names what is selected by type — "1 consignment · 1 pickup", split further into forward/reverse and Reserved/FTL.',
    why: 'On a mixed list the count alone does not tell you what you are about to act on.',
  },
  {
    area: 'Actions', kind: 'changed',
    what: 'A pickups-only selection shows the pickup actions, not a list of greyed-out consignment ones.',
    why: 'A panel that is mostly disabled makes the reader work out why. Listing only what applies answers the question before it is asked. Disabled entries survive in one place only — a MIXED selection — where you genuinely need to know an action exists and why it is unavailable right now.',
    where: 'index.tsx → SelectionPanel',
  },
  {
    area: 'Actions', kind: 'added',
    what: 'Plan Collection For Routing, Mark Pickup Failed and Cancel Pickup.',
    why: 'A collection IS a routable stop — the driver picks up instead of dropping off — and a booking can be called off or reported as failed. All three are real operations that already existed on the pickup store; the queue simply had no way to reach them.',
  },
  {
    area: 'Totals', kind: 'fixed',
    what: 'A pickups-only selection shows Pickups / Orders covered / Weight instead of three zeros.',
    why: 'Consignment weight, volume and pallet count are not ZERO for a selection of bookings — they are not applicable, and three zeros read as "this weighs nothing". The weight shown is summed over the bookings, carrying a ~ if any of it was a merchant estimate.',
  },
  {
    area: 'Data', kind: 'changed',
    what: 'A planned stop records whether it is a pickup or a delivery.',
    why: 'Once a collection can be routed, a trip that did not say which is which would send a driver to an address without saying what for.',
    where: 'planningStore.ts → PlannedStop.kind',
  },
  {
    area: 'Actions', kind: 'changed',
    what: 'Return to Origin counts forward consignments only.',
    why: 'A reverse order is already travelling back to where it came from, so returning it to origin is not an operation that means anything.',
  },
  {
    area: 'Actions', kind: 'added',
    what: 'The panel states that its weight, volume and pallet totals cover consignment rows only.',
    why: 'They always did. Saying so is the difference between a correct number and a number the reader misreads as covering the whole selection.',
  },
  {
    area: 'Actions', kind: 'changed',
    what: 'CSV export stays consignment-only.',
    why: 'Its columns are the consignment shape; a pickup row would fill half of them with dashes.',
  },

  /* ------------------------------------------------------------------ data */
  {
    area: 'Data', kind: 'added',
    what: 'An estimated weight renders with a ~ prefix; an unknown one renders as a dash.',
    why: 'A Reserved booking\'s weight is what the merchant guessed before any order existed. A number nobody counted has to say so, or it gets planned against as if it were measured.',
    where: 'index.tsx → toDisplay',
  },
  {
    area: 'Data', kind: 'fixed',
    what: 'Volume is now genuinely mm³ (×1000 from the stored centimetres).',
    why: 'The previous expression rounded to three decimals instead of converting, so the column showed centimetres under a mm³ header. Numbers now read 1000× the old ones — the old ones were mislabelled, not the new ones.',
    where: 'adapter.ts → volumeMm3',
  },
  {
    area: 'Data', kind: 'changed',
    what: 'A pickup\'s date is its collection window; a consignment\'s is its ship-by date.',
    why: 'They are the dates each kind is actually planned against, so the date range has to mean one thing per row rather than one thing per list.',
  },

  {
    area: 'Rows', kind: 'added',
    what: 'The drawer\'s grid and panel markup is shared between both detail views.',
    why: 'Two copies of the same layout drift. One module means the pickup drawer cannot quietly stop looking like the consignment drawer.',
    where: 'overlayBits.tsx',
  },

  {
    area: 'Actions', kind: 'added',
    what: 'Create Pickup MOVED OFF this page, onto Consignment Order, where it now asks merchant → that merchant\'s linked address → the merchant portal\'s own booking form.',
    why: 'Pending For Planning is a queue of work already in the network; raising a new collection is not that. The console also has to ask two questions the portal never does — which merchant, and which of its addresses — because the portal is already inside one merchant and can only offer its locations. Everything after those two steps is Grow\'s form, reused rather than rebuilt, so parcel-vs-FTL, overnight windows, reserved bookings and the conflict check stay in one place.',
    where: 'LocalConsignments/index.tsx · LocalPFP/CreatePickup.tsx',
  },
  {
    area: 'Columns', kind: 'changed',
    what: 'The Type cell dropped its pill: the kind is plain bold text, coloured only for a pickup, with the sub-classification muted beneath it.',
    why: 'Every row already carries a State pill. A second pill beside it read as two competing badges and pushed the detail line out of alignment with the label above. Plain text is quieter, lines up, and leaves the pill meaning one thing.',
  },

  {
    area: 'Rows', kind: 'added',
    what: 'A Consignment Order page at /local/consignments — every consignment the merchant has, with the console\'s six status tabs, its column set and its eight bulk actions.',
    why: 'Pending For Planning only ever showed what was waiting to be planned, so there was nowhere to see a consignment once it left the queue. Rows come from the SAME adapter this page uses, so the two lists cannot disagree about what a consignment is. NOT YET PIXEL-MEASURED: unlike this page it is built in our own primitives from the console page\'s inventory, pending staging access for a measurement pass.',
    where: 'LocalConsignments/index.tsx',
  },
  {
    area: 'Actions', kind: 'changed',
    what: 'Of the eight console bulk actions, four are real local mutations and four are labelled demo.',
    why: 'Schedule, Return to Origin, Close and Cancel write to the planning store and the merchant store. Modify Consignment Details reopens the order in the merchant\'s own Add Order flow. Modify Carrier and Print Label say "demo only" in words, because the local store has no carrier master and no label service — a button that silently did nothing would be worse than one that admits what it is.',
  },

  /* -------------------------------------------------------------- settings */
  {
    area: 'Settings', kind: 'added',
    what: 'A table-settings page covering all 78 fields — the console\'s 67 plus 11 a mixed list needs.',
    why: 'Consignment fields and pickup fields are configured in one place, because deciding a column shows for one kind and not the other is a single decision, not two.',
    where: 'TableSettings.tsx',
  },
  {
    area: 'Settings', kind: 'added',
    what: 'Each field declares which row kinds carry it, and can be narrowed within that.',
    why: 'Whether a pickup request has a Carrier is a fact about the data, not a preference — so the control can offer narrowing but can never claim a column applies to a row type that has no such value.',
  },
  {
    area: 'Settings', kind: 'changed',
    what: 'Ordering is by drag; the sequence number is only how it is stored.',
    why: 'The console makes you type numbers into a box that stays disabled until you press Edit Sequence. Dragging is the same result without the ceremony.',
  },
  {
    area: 'Settings', kind: 'changed',
    what: 'Settings save to this browser only — no session, no server.',
    why: 'This whole surface runs without a staging login, so there is nowhere to put them but localStorage.',
    where: 'columnConfig.ts',
  },
]

/* ------------------------------------------------- the column mapping ----- */

/**
 * ONE ROW PER RENDERED COLUMN: what it holds for a consignment, what it holds
 * for a pickup request, and whether the two are really the same thing.
 *
 * Transcribed from `index.tsx → toDisplay`, which is what actually renders — not
 * from the analysis workbook, which says what was planned. If the grid and this
 * table ever disagree, the grid is right and this is stale.
 *
 * `shared` is the honest part:
 *   Yes     — same meaning, same shape, one renderer, no branch.
 *   Partial — one header, but the pickup value is derived, aggregated, or means
 *             something subtly different. These are the ones to read twice.
 *   No      — no analogue on the pickup side; the cell shows a dash.
 */
type Shared = 'Yes' | 'Partial' | 'No'

interface MapRow {
  column: string
  consignment: string
  pickup: string
  shared: Shared
  /** why this one is worth a second look */
  watch?: string
}

const COLUMN_MAP: MapRow[] = [
  { column: 'Flags', consignment: 'Category icons — VIP, Stackable, Hazmat, Fragile, Heavy Weight (max 3, then +n)', pickup: '— (a booking carries no category flags)', shared: 'No' },
  { column: 'Order Number', consignment: 'The order number', pickup: 'The request number, PR-000123', shared: 'Partial', watch: 'One identity column, two number series. The link target differs by row kind.' },
  { column: 'Reference Number', consignment: 'The reference number', pickup: 'The same PR number again', shared: 'Partial', watch: 'Grow has no separate merchant reference, so for a consignment this equals Order Number today.' },
  { column: 'Type', consignment: 'Forward Delivery · Pickup & Delivery · Reverse Pickup · Reverse', pickup: 'Pickup Request · Reserved Pickup · FTL Pickup', shared: 'Yes', watch: 'The discriminator, and the task composition with it. A consignment reading "Pickup & Delivery" carries two legs. Derived from whether a collection is booked — so on the current data only Forward Delivery and Pickup & Delivery actually occur; the two reverse values are supported but unexercised.' },
  { column: 'Ship By Date', consignment: 'The ship-by date', pickup: 'The START date of the collection window', shared: 'Partial', watch: 'THE DATE COLUMN FOR BOTH KINDS — and what the list sorts and date-filters on. A consignment\'s ship-by is a promise; a pickup\'s is a booking. Same column, two kinds of commitment.' },
  { column: 'State', consignment: 'Consignment state — At Facility, Ready To Ship …', pickup: 'Pickup outcome — Requested, Planned, Partially picked …', shared: 'Yes', watch: 'Two vocabularies in one pill. Only Requested and Cancelled are values the consignment side never had.' },
  { column: 'Carrier', consignment: 'The allocated carrier', pickup: '—', shared: 'No', watch: 'A pickup is not carrier-allocated in Grow.' },
  { column: 'Secondary State', consignment: 'The console secondary state', pickup: 'The raw status, but only when the outcome renamed it', shared: 'Partial', watch: 'Blank on a pickup whose outcome and status agree — that is the common case.' },
  { column: 'Dispatch Date', consignment: 'The dispatch date', pickup: '—', shared: 'No' },
  { column: 'Weight', consignment: 'Measured kg', pickup: 'Summed over its orders, or the merchant\'s estimate, prefixed ~', shared: 'Partial', watch: 'A ~ means nobody counted it. A dash means it is genuinely not known yet — never 0.' },
  { column: 'Volume', consignment: 'mm³', pickup: '—', shared: 'No', watch: 'A Reserved or FTL booking has no dimensions.' },
  { column: 'Pallet Spaces', consignment: 'Pallet spaces', pickup: '—', shared: 'No' },
  { column: 'SKU', consignment: 'A count of SKU lines', pickup: '—', shared: 'No' },
  { column: 'Service Time (min)', consignment: 'Minutes', pickup: '—', shared: 'No', watch: 'A pickup\'s dwell is its window length, which is a different measurement.' },
  { column: 'Tag', consignment: 'Routing tags', pickup: 'Derived chips — Reserved, FTL, Overdue', shared: 'Partial', watch: 'The pickup side is richer here than the consignment side.' },
  { column: 'Special Instructions', consignment: 'Order remarks', pickup: '—', shared: 'No', watch: 'Deliberate: a request\'s internal note must never surface, and its driver-facing instructions belong on the drawer.' },
  { column: 'Merchant', consignment: 'The store\'s business name', pickup: 'The same store', shared: 'Yes' },
  { column: 'Ageing (days)', consignment: 'Days since the order was created', pickup: 'Days since the booking was created', shared: 'Yes' },
  { column: 'Address', consignment: 'The DELIVERY address', pickup: 'The PICKUP address', shared: 'Partial', watch: 'The sharpest trap on this page: one header, opposite ends of the journey. Read Ship From / Ship To on the drawer instead of trusting this cell.' },
]

const SHARED_STYLE: Record<Shared, string> = {
  Yes: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Partial: 'border-amber-200 bg-amber-50 text-amber-700',
  No: 'border-warm-300 bg-warm-50 text-ink-3',
}

function ColumnMap() {
  const counts = useMemo(() => ({
    Yes: COLUMN_MAP.filter((r) => r.shared === 'Yes').length,
    Partial: COLUMN_MAP.filter((r) => r.shared === 'Partial').length,
    No: COLUMN_MAP.filter((r) => r.shared === 'No').length,
  }), [])

  return (
    <>
      <p className="mt-4 max-w-[80ch] text-[13.5px] leading-relaxed text-ink-2">
        One row per column the grid renders, and what it actually holds for each kind of row.
        Transcribed from the rendering code, so it says what you will see — not what was planned.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-bold">
        <span className={`rounded-full border px-2 py-0.5 ${SHARED_STYLE.Yes}`}>{counts.Yes} genuinely shared</span>
        <span className={`rounded-full border px-2 py-0.5 ${SHARED_STYLE.Partial}`}>{counts.Partial} partial — read twice</span>
        <span className={`rounded-full border px-2 py-0.5 ${SHARED_STYLE.No}`}>{counts.No} consignment only</span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border border-line">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line bg-warm-25 text-left">
              <th className="whitespace-nowrap px-3 py-2 font-bold text-ink">Column</th>
              <th className="px-3 py-2 font-bold text-ink">On a consignment row</th>
              <th className="px-3 py-2 font-bold text-ink">On a pickup row</th>
              <th className="whitespace-nowrap px-3 py-2 font-bold text-ink">Same thing?</th>
            </tr>
          </thead>
          <tbody>
            {COLUMN_MAP.map((r) => (
              <tr key={r.column} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2.5 font-bold text-ink">{r.column}</td>
                <td className="px-3 py-2.5 text-ink-2">{r.consignment}</td>
                <td className="px-3 py-2.5 text-ink-2">{r.pickup}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${SHARED_STYLE[r.shared]}`}>
                    {r.shared}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-7 text-[15px] font-bold text-ink">Worth reading twice</h2>
      <div className="mt-2 space-y-2">
        {COLUMN_MAP.filter((r) => r.watch).map((r) => (
          <p key={r.column} className="rounded-md border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
            <strong className="text-ink">{r.column}</strong> — {r.watch}
          </p>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------- the page --- */

type View = 'changes' | 'columns'

export default function Changes() {
  const nav = useNavigate()
  const [view, setView] = useState<View>('changes')
  const [area, setArea] = useState<Area | 'All'>('All')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return CHANGES.filter((c) =>
      (area === 'All' || c.area === area)
      && (!needle || `${c.what} ${c.why} ${c.where ?? ''}`.toLowerCase().includes(needle)))
  }, [area, q])

  const counts = useMemo(() => ({
    added: CHANGES.filter((c) => c.kind === 'added').length,
    changed: CHANGES.filter((c) => c.kind === 'changed').length,
    fixed: CHANGES.filter((c) => c.kind === 'fixed').length,
  }), [])

  return (
    <div className="mx-auto max-w-[1000px] p-6">
      <button onClick={() => nav('/local/pending-for-planning')}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-3 hover:text-ink">
        <ArrowLeft size={14} /> Back to Pending for Planning
      </button>

      <h1 className="text-[22px] font-black text-ink">What changed in Pending for Planning</h1>
      <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-2">
        This queue now holds two kinds of thing — consignments and pickup requests — where the
        console&rsquo;s holds one. Every difference below follows from that. They are decisions, not
        drift, so each one is listed with the reason it was made.
      </p>

      {/* two views of the same surface: what changed, and what each column holds */}
      <div className="mt-4 flex items-center gap-1 border-b border-line">
        {([['changes', 'Changes'], ['columns', 'Column mapping']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] font-bold transition-colors
              ${view === v ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-3 hover:text-ink-2'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'columns' && <ColumnMap />}

      {view === 'changes' && (<>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] font-bold">
        <span className={`rounded-full border px-2 py-0.5 ${KIND_STYLE.added}`}>{counts.added} added</span>
        <span className={`rounded-full border px-2 py-0.5 ${KIND_STYLE.changed}`}>{counts.changed} changed</span>
        <span className={`rounded-full border px-2 py-0.5 ${KIND_STYLE.fixed}`}>{counts.fixed} fixed</span>
      </div>

      {/* controls */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(['All', ...AREAS] as const).map((a) => (
          <button key={a} onClick={() => setArea(a)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-bold transition-colors
              ${area === a
                ? 'border-brand-500 bg-brand-50 text-brand-600'
                : 'border-warm-300 bg-surface text-ink-3 hover:border-warm-400'}`}>
            {a}
            {a !== 'All' && <span className="ml-1.5 text-ink-3">{CHANGES.filter((c) => c.area === a).length}</span>}
          </button>
        ))}
        <div className="relative ml-auto w-56">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search changes"
            className="h-8 w-full rounded-md border border-warm-300 bg-surface pl-8 pr-2.5 text-[13px] text-ink outline-none placeholder:text-warm-400 focus:border-brand-500"
          />
        </div>
      </div>

      {/* the list */}
      <div className="mt-4 space-y-2.5">
        {rows.length === 0 && (
          <p className="rounded-md border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-3">
            Nothing matches that search.
          </p>
        )}
        {rows.map((c, i) => (
          <article key={i} className="rounded-md border border-line bg-surface px-4 py-3.5 transition-colors hover:border-warm-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${KIND_STYLE[c.kind]}`}>
                {c.kind}
              </span>
              <span className="rounded bg-warm-100 px-1.5 py-0.5 text-[11px] font-bold text-ink-3">{c.area}</span>
              {c.where && (
                <code className="ml-auto text-[11.5px] text-ink-3">{c.where}</code>
              )}
            </div>
            <p className="mt-2 text-[13.5px] font-bold leading-snug text-ink">{c.what}</p>
            <p className="mt-1 max-w-[80ch] text-[13px] leading-relaxed text-ink-2">{c.why}</p>
          </article>
        ))}
      </div>

      <p className="mt-6 text-[12px] text-ink-3">
        Showing {rows.length} of {CHANGES.length} changes.
      </p>
      </>)}
    </div>
  )
}

/**
 * Help Center content — SAMPLE articles written for this prototype. The live
 * portal's `/faq/` was not reachable during the capture (research doc §11), so
 * nothing here is FarEye's text: every answer describes a flow this prototype
 * actually has, so a reader can follow it through the app.
 */
export interface HelpArticle {
  id: string
  category: HelpCategory
  q: string
  a: string[]
  /** where in the portal the flow lives */
  link?: { label: string; to: string }
}

export const HELP_CATEGORIES = ['Getting started', 'Consignments', 'Pickups', 'Rates & quotes', 'Tracking', 'Reports'] as const
export type HelpCategory = (typeof HELP_CATEGORIES)[number]

export const HELP_ARTICLES: HelpArticle[] = [
  { id: 'switch-merchant', category: 'Getting started', q: 'How do I switch between merchant accounts?',
    a: ['Use the ⇄ button at the top right of every page. The list comes from the Merchant master; the one you pick is remembered in this browser.',
      'Pickup addresses, package presets and the Location Master rows follow the merchant you picked.'] },
  { id: 'dashboard', category: 'Getting started', q: 'What do the Dashboard tiles count?',
    a: ['Pickup Failed counts pickup requests that failed in the selected dates. Schedule Pickup counts shipments that are ready and have no pickup booked yet — the same list as Pickup Requests → Eligible consignments.',
      'On Time Performance is the share of deliveries that landed on or before their EDD.'],
    link: { label: 'Open the Dashboard', to: '/grow/orders/dashboard' } },
  { id: 'create-consignment', category: 'Consignments', q: 'How do I create a consignment?',
    a: ['Consignment Order → Add. Fill Ship From, Ship To, the packages and pick a service; the price comes from the rate card for that lane.',
      'Save for Later keeps it as a draft (State “Draft”). Add Order takes you to checkout; once paid the consignment is Created / Label Generated.'],
    link: { label: 'Add a consignment', to: '/grow/orders/add' } },
  { id: 'ftl', category: 'Consignments', q: 'How do I book a full vehicle (FTL)?',
    a: ['Use Add ▾ → Add FTL consignment, or turn on Dedicate Truck in the form. Choose a service type first — it decides which vehicle types you can book — then add one vehicle per load.'],
    link: { label: 'Add an FTL consignment', to: '/grow/orders/add/vehicle' } },
  { id: 'bulk', category: 'Consignments', q: 'Can I upload many consignments at once?',
    a: ['Yes. On Consignment Order, the upload icon next to Add opens Bulk Upload. Download the CSV template, fill one row per consignment and upload it; rows with errors are listed before anything is created.'] },
  { id: 'cancel', category: 'Consignments', q: 'Why can’t I cancel a shipment?',
    a: ['Once its pickup is assigned to a driver, a shipment can only be cancelled by support — the booking belongs to operations from that point. Delivered and cancelled shipments cannot be cancelled either.'] },
  { id: 'book-pickup', category: 'Pickups', q: 'How do I book a pickup?',
    a: ['Tick the shipments on Consignment Order (or Tracking) and choose Schedule Pickup / Book Pickup. Shipments from the same pickup address are grouped into one request; you can add them to an existing open request instead.',
      'If your account raises pickups automatically, the booking buttons are replaced by an “Auto pickup” pill describing the rule.'],
    link: { label: 'Open Pickup Requests', to: '/grow/orders/pickups' } },
  { id: 'reserved', category: 'Pickups', q: 'What is a Reserved pickup?',
    a: ['A courier slot booked before the consignments exist (Pickup Requests → Add). It shows a Reserved chip; add consignments to it later. If nothing is added it can never complete — it ends as Pickup Failed with “No orders to collect”.'] },
  { id: 'window', category: 'Pickups', q: 'Which pickup windows can I choose?',
    a: ['Any window up to the booking horizon your account allows (7 days by default). Same-day pickups close at the same-day cut-off. A window may run overnight or across several days.'] },
  { id: 'partial', category: 'Pickups', q: 'What does “Partially picked” mean?',
    a: ['The driver collected some but not all of the booked shipments. The request’s Pickup outcome card lists what was picked, what was not, and any extra parcels scanned — you can create an order for an extra scan from there.'] },
  { id: 'failed', category: 'Pickups', q: 'What happens when a pickup fails?',
    a: ['If attempts are left, a re-attempt request is raised automatically and linked to the failed one. The failure reason is shown on the request page.'] },
  { id: 'quote', category: 'Rates & quotes', q: 'How do I check a price before booking?',
    a: ['Get Quote asks where you send from, the destination postal code and the packages. Get Quote lists every service for that lane with its price and delivery date; Create order now opens the consignment form with all of it filled in.'],
    link: { label: 'Get a quote', to: '/grow/orders/quote' } },
  { id: 'volumetric', category: 'Rates & quotes', q: 'Why am I charged more than the parcel’s weight?',
    a: ['Parcels are billed on the greater of the actual weight and the volumetric weight (L × W × H in cm ÷ 3,500). A light, bulky box is charged for the space it takes.'] },
  { id: 'track', category: 'Tracking', q: 'Where do I see where a shipment is?',
    a: ['Tracking lists every booked shipment with its status, state, EDD and rate. Click a row to open the shipment; View Events shows its full event log.'],
    link: { label: 'Open Tracking', to: '/grow/orders/tracking' } },
  { id: 'edd', category: 'Tracking', q: 'How is the EDD worked out?',
    a: ['From the delivery window once the shipment is scheduled; before that, from the day it was created plus the service’s delivery days for the lane (Sundays are skipped).'] },
  { id: 'reports', category: 'Reports', q: 'How do I export my orders?',
    a: ['Reports → Generate Report. Choose Order or Transaction, the date range and the columns (build them manually or from a saved template). The report is ready at once — click Download for a CSV.',
      'Turn on “I want to subscribe this report” to receive it daily, weekly or monthly instead.'],
    link: { label: 'Open Reports', to: '/grow/orders/reports' } },
]

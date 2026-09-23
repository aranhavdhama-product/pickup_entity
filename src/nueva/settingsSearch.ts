/**
 * Deep search index for the Custom Settings sub-nav search.
 *
 * RULE (see CLAUDE.md): every settings surface added to the app MUST be
 * registered here (or derive automatically from MASTERS) so the Settings
 * search finds it at its deepest level — sub-masters, module detail pages,
 * not just the left-nav items.
 *
 * Masters entries derive from the MASTERS tree automatically, so a new
 * sub-master added to mastersTree.ts becomes searchable with no extra work.
 * Base-module cards are enumerated here (their listing is static SPA config,
 * mirrored from staging — see BaseModules.tsx). NB: the "General Settings" card
 * shares its label with the Integrations nav item, so the sub-nav's label dedupe
 * hides this hit behind that (different) nav entry.
 */
import { MASTERS } from './mastersTree'

export type SettingsHit = {
  label: string
  /** breadcrumb-ish context shown under the label */
  trail: string
  to: string
  /** extra match terms (synonyms, codes) */
  keywords?: string
}

/* Base Modules cards — label, target, extra keywords. MUST stay in sync with
   BASE_MODULES in BaseModules.tsx (same 10 staging cards + Pickup Request, same
   order, same slugs). Link / toggle-only cards point where the card goes:
   General Settings (no page yet — "Coming soon") and Enable Routing (toggle only)
   → the Base Modules list itself (distinct #hash: the sub-nav keys hits by `to`). */
const BM = '/console/settings/base-modules'
const BASE_MODULES: [string, string, string?][] = [
  ['General Settings', `${BM}#general_settings`, 'global settings'],
  ['OPS Dashboard', `${BM}/ops_dashboard`],
  ['Consignment Order', `${BM}/consignment_order`],
  ['Pending For Planning', `${BM}/pending_for_planning`],
  ['Pickup Request', `${BM}/pickup_request`,
    'pickup requests first mile first-mile PICKUP_REQUEST enable disable pickup module user types '
    + 'auto-create pickup on consignment handover scan mode driver hub both max attempts '
    + 'add to existing reschedule window overage policy hold reject send pickup request to carriers '
    + 'carrier 3pl cutoff time booking lead time date filter table configuration on page filters '
    + 'multiple pickup requests per slot per location same-day cutoff same day pickup slots windows '
    + 'proof of pickup pod signature photo otp merchant can cancel until auto-reschedule on failure '
    + 'merchant rules merchant overrides'],
  ['Load Planning', `${BM}/load_planning`],
  ['Carrier Portal', `${BM}/carrier-portal`],
  ['Geo Coding', `${BM}/geo_code`],
  ['Enable Routing', `${BM}#routing`, 'routing toggle ROUTING'],
  ['Put Away', `${BM}/put_away`, 'PUT_AWAY'],
  ['Last Mile Loading', `${BM}/lastmile_loading`, 'lastmile loading LASTMILE_LOADING'],
]

export function buildDeepIndex(): SettingsHit[] {
  const hits: SettingsHit[] = []

  for (const cat of MASTERS) {
    hits.push({ label: cat.name, trail: `Masters › ${cat.name}`, to: `/console/settings/masters/${cat.id}`, keywords: cat.desc })
    for (const sub of cat.subs) {
      hits.push({
        label: sub.name,
        trail: `Masters › ${cat.name}`,
        to: `/console/settings/masters/${cat.id}/${sub.id}`,
        keywords: `${sub.desc} ${sub.badge ?? ''}`,
      })
    }
  }

  for (const [name, to, extra] of BASE_MODULES) {
    hits.push({
      label: name,
      trail: 'Base Modules',
      to,
      keywords: `module settings columns filters ${extra ?? ''}`.trim(),
    })
  }

  // Pilot Driver App → Pickup Module card (edits the same pickup config as Pickup Request)
  hits.push({
    label: 'Pickup Module',
    trail: 'Pilot Driver App',
    to: '/console/settings/pilot-driver',
    keywords: 'pickup execution driver app handover scan mode proof of pickup pod signature photo otp overage policy DRIVER_APP_PICKUP_MODULE',
  })

  // Delivery Settings — deep terms so the group's individual settings are findable
  // (distinct labels, since the nav-labelled "Delivery Settings" itself is filtered out).
  hits.push({
    label: 'Task type & scan defaults',
    trail: 'Delivery Settings › Global',
    to: '/console/settings/delivery-settings',
    keywords: 'task type pickup delivery pickup only delivery only splittable scannable inbound scan not required at origin at mid-mile at destination global defaults view on order',
  })
  hits.push({
    label: 'Page access & capabilities',
    trail: 'Delivery Settings › Page settings',
    to: '/console/settings/delivery-settings',
    keywords: 'user type list roles access roster master multi asset helper assignment asset master allow modify consignment ready for dispatch out for delivery consignment pending for planning',
  })

  /* Table settings for the unified Pending For Planning listing. It lives in the
     LOCAL app at /local/columns, not under /console/settings — but CLAUDE.md's
     rule is that every settings surface in the app is findable from here,
     wherever it sits, and a cross-app link is still a link. */
  hits.push({
    label: 'Unified Listing Columns',
    trail: 'Pending For Planning › Table settings',
    to: '/local/columns',
    keywords: 'columns filters table configuration on page filters column config show hide '
      + 'sequence order width row type pickup request consignment applies to unified listing '
      + 'local mode pending for planning table settings default columns',
  })

  return hits
}

export function searchSettings(index: SettingsHit[], query: string): SettingsHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return index.filter((h) =>
    h.label.toLowerCase().includes(q) ||
    h.trail.toLowerCase().includes(q) ||
    (h.keywords ?? '').toLowerCase().includes(q))
}

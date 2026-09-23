/**
 * Ops-dashboard data layer (the staging Dashboard's own service) — verified 2026-08-27.
 * Every call: POST, Content-Type application/camel+json, body with filterExpression/
 * indexName/resourceType (plain JSON parses to nulls → 400). One endpoint per tab:
 *
 *   Milestones    POST /ops-dashboard                       aggregations WITH counts
 *   SLA           POST /ops-dashboard/sla                   summary cards + overviews
 *   KPI row       POST /ops-dashboard/consignment-kpi       11 numeric KPIs
 *   Facility/Age  POST /ops-dashboard/list                  full rows from the ops index
 *   (hub-mis endpoints 500 on this account — no hub event data; facility view
 *    derives from /list instead)
 */

const BASE = '/staging/mid-mile/operational-dashboard/api/rest/v1/ops-dashboard'

export interface AggBucket { key: string; value: string; count: string; prettyName: string; label: string }

function body(days: number, extra: Record<string, unknown> = {}) {
  const from = new Date()
  from.setDate(from.getDate() - days)
  return JSON.stringify({
    filterExpression: {
      booleanOperator: 'AND',
      filterConditions: [
        { filterName: 'createdAt', filterValue: `${from.toISOString().slice(0, 10)}T00:00:00Z`, comparisonOperator: 'GTE' },
      ],
    },
    indexName: 'consignment_local_index',
    resourceType: 'CONSIGNMENT',
    pageSize: 1000,
    pageNumber: 1,
    aggregations: [],
    ...extra,
  })
}

async function post(path: string, payload: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/camel+json', Accept: 'application/camel+json' },
    body: payload,
  })
  if (!res.ok) throw new Error(`ops-dashboard${path || ''} HTTP ${res.status}`)
  return res.json()
}

/** Milestones tab — aggregation buckets with real counts (+ docCount total). */
export async function fetchMilestones(days: number): Promise<{
  total: number
  state: AggBucket[]
  lastMilestoneEventCode: AggBucket[]
}> {
  const d = await post('', body(days, {
    aggregations: [{ aggregationField: 'state' }, { aggregationField: 'lastMilestoneEventCode' }],
  }))
  return {
    total: Number(d.docCount?.[0]?.count ?? 0),
    state: d.state ?? [],
    lastMilestoneEventCode: d.lastMilestoneEventCode ?? [],
  }
}

/** SLA tab — summary cards + state/milestone overviews. */
export async function fetchSla(days: number): Promise<{
  cards: { key: string; value: string; prettyName: string }[]
  stateOverview: AggBucket[]
}> {
  const d = await post('/sla', body(days))
  return { cards: d.summary?.cards ?? [], stateOverview: d.stateOverview?.state ?? [] }
}

/** KPI card row (staging shows these on the milestone view). */
export async function fetchKpis(days: number): Promise<Record<string, number>> {
  return post('/consignment-kpi', body(days))
}

/** Ops-index rows — the Facility Mis and Ageing tabs derive their groupings here. */
export async function fetchOpsList(days: number): Promise<Record<string, any>[]> {
  const d = await post('/list', body(days, { sort: { sortBy: 'createdAt', sortDir: 'desc' } }))
  return d.consignments ?? []
}

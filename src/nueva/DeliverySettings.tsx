/**
 * Delivery Settings — global defaults (apply to every page) + per-page controls
 * for the delivery-ops surfaces (Consignment, Pending for Planning).
 *
 * Layout: stacked scoped cards (chosen 2026-09-14). Card 1 = "Global defaults"
 * with an "Applies to all pages" badge; Card 2 = "Page settings" with a page
 * picker in its header so page-level settings switch context in place.
 *
 * Built entirely from the design-system primitives in components.tsx per CLAUDE.md.
 * Prototype: state is local; Save shows a toast. Roles come from the live user-type
 * master when reachable, else a sensible fallback so the page stands alone.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Save } from 'lucide-react'
import { Button, MenuSelect, MultiSelect, PageHeader, StatusPill, Toggle } from './components'
import { toast } from './toast'
import { fetchUserTypes } from './settingsApi'

/* ---------------- option enums + labels ---------------- */

const TASK_TYPES = ['PICKUP_AND_DELIVERY', 'PICKUP_ONLY', 'DELIVERY_ONLY'] as const
const TASK_TYPE_LABEL: Record<string, string> = {
  PICKUP_AND_DELIVERY: 'Pickup & Delivery',
  PICKUP_ONLY: 'Pickup only',
  DELIVERY_ONLY: 'Delivery only',
}
const INBOUND = ['NOT_REQUIRED', 'AT_ORIGIN', 'AT_MID_MILE', 'AT_DESTINATION'] as const
const INBOUND_LABEL: Record<string, string> = {
  NOT_REQUIRED: 'Not required',
  AT_ORIGIN: 'At origin (default)',
  AT_MID_MILE: 'At mid-mile',
  AT_DESTINATION: 'At destination',
}
const EDIT_TILL = ['READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY'] as const
const EDIT_TILL_LABEL: Record<string, string> = {
  READY_FOR_DISPATCH: 'Ready for Dispatch',
  OUT_FOR_DELIVERY: 'Out for Delivery',
}
const PAGES = ['consignment', 'pending-planning'] as const
const PAGE_LABEL: Record<string, string> = {
  consignment: 'Consignment',
  'pending-planning': 'Pending for Planning',
}
const ROLE_FALLBACK = ['Admin', 'Field Executive', 'Dispatcher', 'Hub Manager', 'Customer Care', 'Warehouse Operator']

type PageKey = (typeof PAGES)[number]
interface PageCfg {
  userTypeList: string[]
  rosterMasterEnabled: boolean
  multiAssetEnabled: boolean
  helperAssignmentEnabled: boolean
  assetMasterEnabled: boolean
  allowModifyTill: string
}
interface GlobalCfg {
  taskType: string
  inbound: string
  splittable: boolean
  scannable: boolean
}

function initialGlobal(): GlobalCfg {
  return { taskType: 'PICKUP_AND_DELIVERY', inbound: 'AT_ORIGIN', splittable: true, scannable: false }
}
function initialPages(): Record<PageKey, PageCfg> {
  return {
    consignment: {
      userTypeList: ['Field Executive', 'Admin'],
      rosterMasterEnabled: true, multiAssetEnabled: true, helperAssignmentEnabled: false,
      assetMasterEnabled: true, allowModifyTill: 'READY_FOR_DISPATCH',
    },
    'pending-planning': {
      userTypeList: ['Dispatcher', 'Hub Manager'],
      rosterMasterEnabled: true, multiAssetEnabled: false, helperAssignmentEnabled: true,
      assetMasterEnabled: false, allowModifyTill: 'READY_FOR_DISPATCH',
    },
  }
}

/* ---------------- card + row chrome (design tokens) ---------------- */

function Card({ title, badge, right, children }: { title: string; badge?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-xl shadow-ds-1">
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-line">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-bold text-ink">{title}</span>
          {badge && <StatusPill label={badge} tone="info" />}
        </div>
        {right}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </div>
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-3.5">
      <div className="min-w-0">
        <div className="text-[14px] text-ink">{label}</div>
        {desc && <div className="text-[12px] text-ink-3 mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/* ---------------- page ---------------- */

export default function DeliverySettings() {
  const [global, setGlobal] = useState<GlobalCfg>(initialGlobal)
  const [pages, setPages] = useState<Record<PageKey, PageCfg>>(initialPages)
  const [page, setPage] = useState<PageKey>('consignment')
  const [roles, setRoles] = useState<string[]>(ROLE_FALLBACK)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    fetchUserTypes()
      .then((ut) => { if (ut?.length) setRoles(Array.from(new Set([...ut.map((u) => u.name), ...ROLE_FALLBACK]))) })
      .catch(() => { /* keep fallback — prototype stands alone without a session */ })
  }, [])

  const cfg = pages[page]
  const patchGlobal = (p: Partial<GlobalCfg>) => { setGlobal((g) => ({ ...g, ...p })); setDirty(true) }
  const patchPage = (p: Partial<PageCfg>) => { setPages((all) => ({ ...all, [page]: { ...all[page], ...p } })); setDirty(true) }

  const save = () => { setDirty(false); toast.success('Delivery settings saved.') }
  const reset = () => { setGlobal(initialGlobal()); setPages(initialPages()); setDirty(false); toast.info('Reverted to last saved values.') }

  // roles the multiselect offers = known roles ∪ whatever is already selected
  const roleOptions = useMemo(
    () => Array.from(new Set([...roles, ...cfg.userTypeList])),
    [roles, cfg.userTypeList],
  )

  return (
    <div className="w-full">
      <PageHeader
        title="Delivery Settings"
        subtitle="Global defaults applied to every page, plus per-page access and capabilities"
        right={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={!dirty} onClick={reset}>Reset</Button>
            <Button size="sm" icon={<Save size={13} />} disabled={!dirty} onClick={save}>Save changes</Button>
          </div>
        }
      />

      <div className="max-w-3xl space-y-4">
        {/* ---- Global ---- */}
        <Card title="Global defaults" badge="Applies to all pages">
          <Row label="Task type" desc="Whether orders are created for pickup, delivery, or both">
            <div className="w-56">
              <MenuSelect value={global.taskType} options={[...TASK_TYPES]}
                labels={(v) => TASK_TYPE_LABEL[v] ?? v} onChange={(v) => patchGlobal({ taskType: v })} />
            </div>
          </Row>
          <Row label="Inbound scan" desc="When an inbound scan is required — shown on the order">
            <div className="w-56">
              <MenuSelect value={global.inbound} options={[...INBOUND]}
                labels={(v) => INBOUND_LABEL[v] ?? v} onChange={(v) => patchGlobal({ inbound: v })} />
            </div>
          </Row>
          <Row label="Splittable" desc="Allow a consignment to be split across shipments / routes">
            <Toggle checked={global.splittable} onChange={(v) => patchGlobal({ splittable: v })} />
          </Row>
          <Row label="Scannable" desc="Require package barcodes to be scannable">
            <Toggle checked={global.scannable} onChange={(v) => patchGlobal({ scannable: v })} />
          </Row>
        </Card>

        {/* ---- Page-level ---- */}
        <Card
          title="Page settings"
          right={
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-ink-3">Page</span>
              <div className="w-52">
                <MenuSelect value={page} options={[...PAGES]}
                  labels={(v) => PAGE_LABEL[v] ?? v} onChange={(v) => setPage(v as PageKey)} />
              </div>
            </div>
          }
        >
          <Row label="Roles with access" desc="User roles allowed to open this page">
            <div className="w-72">
              <MultiSelect value={cfg.userTypeList} options={roleOptions}
                placeholder="Select roles" creatable
                onChange={(next) => patchPage({ userTypeList: next })} />
            </div>
          </Row>
          <Row label="Roster master" desc="Use the roster master for driver assignment">
            <Toggle checked={cfg.rosterMasterEnabled} onChange={(v) => patchPage({ rosterMasterEnabled: v })} />
          </Row>
          <Row label="Multi-asset" desc="Allow more than one asset (physical vehicle) to be assigned to a single trip">
            <Toggle checked={cfg.multiAssetEnabled} onChange={(v) => patchPage({ multiAssetEnabled: v })} />
          </Row>
          <Row label="Helper assignment" desc="Allow assigning helpers alongside the driver">
            <Toggle checked={cfg.helperAssignmentEnabled} onChange={(v) => patchPage({ helperAssignmentEnabled: v })} />
          </Row>
          <Row label="Asset master" desc="Register of physical vehicles used for pickup, delivery and line-haul operations">
            <Toggle checked={cfg.assetMasterEnabled} onChange={(v) => patchPage({ assetMasterEnabled: v })} />
          </Row>
          <Row label="Allow edit consignment till" desc="Latest stage at which a consignment can still be modified">
            <div className="w-56">
              <MenuSelect value={cfg.allowModifyTill} options={[...EDIT_TILL]}
                labels={(v) => EDIT_TILL_LABEL[v] ?? v} onChange={(v) => patchPage({ allowModifyTill: v })} />
            </div>
          </Row>
        </Card>
      </div>
    </div>
  )
}

/** shared helpers for the per-domain master configs */
import type { Column } from '../components'
import { fetchMasterRows, type MasterRecord } from '../settingsApi'

/** codes of another live master, for cross-master dropdowns */
export const codesOf = (entity: string) => () =>
  fetchMasterRows(entity).then((rs) => rs.map((r) => String(r.code ?? '')).filter(Boolean))

/** labeled cross-master options — dropdowns always SHOW NAMES: the stored
 * value stays the code, the label reads "Name (code)" (or just the code when
 * the entity has no name). Use with optionsFromLabeled. */
export const labeledCodesOf = (entity: string) => () =>
  fetchMasterRows(entity).then((rs) => rs
    .filter((r) => r.code)
    .map((r) => ({
      value: String(r.code),
      label: r.name && String(r.name) !== String(r.code) ? `${String(r.name)} (${String(r.code)})` : String(r.code),
    })))

export const SVC = '/console/settings/masters/service_order'
export const CODE_NAME_FIELDS = [
  { key: 'code', label: 'Code', type: 'text', required: true } as const,
  { key: 'name', label: 'Name', type: 'text', required: true } as const,
]
/** ONE identity column — name prominent, code beneath (CSV export still emits
 * name and code as separate columns; it's field-driven, not column-driven) */
export const CODE_NAME_COLUMNS: Column[] = [
  { key: 'name', label: 'Name', render: (r: MasterRecord) => (
    <div>
      <p className="font-bold text-brand-500">{String(r.name ?? r.code ?? '')}</p>
      {r.code != null && String(r.code) !== String(r.name ?? '') && (
        <p className="text-[12px] text-ink-3">{String(r.code)}</p>
      )}
    </div>
  ) },
]

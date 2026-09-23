/**
 * The Consignment Order listing's columns — ONE definition, shared by
 * `/local/consignments` and the Pickup page's `Eligible for Pickup` tab, so a
 * consignment reads the same wherever it is listed.
 */
import { StatusPill, type Column } from '../../nueva/components'
import { stateTone, type LocalConsignmentRow } from '../LocalPFP/adapter'
import { stamp } from '../LocalPFP/overlayFormat'

const row = (r: unknown) => r as LocalConsignmentRow

export const consignmentColumns: Column[] = [
  /* staging lists Order Number and Reference Number as TWO columns (owner, 2026-09-23) */
  {
    key: 'consignmentNumber',
    label: 'Order Number',
    render: (r) => <span className="font-mono text-[12px] font-bold text-brand-500">{row(r).consignmentNumber || '—'}</span>,
  },
  {
    key: 'referenceNumber',
    label: 'Reference Number',
    render: (r) => <span className="font-mono text-[12px] text-ink-2">{row(r).referenceNumber || '—'}</span>,
  },
  { key: 'state', label: 'State', render: (r) => <StatusPill label={String(row(r).state)} tone={stateTone(String(row(r).state))} /> },
  { key: 'secondaryState', label: 'Secondary State', render: (r) => row(r).secondaryState || '—' },
  { key: 'exceptionState', label: 'Exception', render: (r) => row(r).exception || '—' },
  { key: 'totalWeight', label: 'Weight', align: 'right', render: (r) => `${row(r).weightKg} kg` },
  { key: 'totalVolume', label: 'Volume', align: 'right', render: (r) => row(r).volumeMm3.toLocaleString() },
  { key: 'shipToName', label: 'Ship to Name', render: (r) => row(r).shipToName || '—' },
  { key: 'businessUnit', label: 'Merchant', render: (r) => row(r).merchant },
  { key: 'consignmentType', label: 'Type', render: (r) => row(r).taskType },
  { key: 'createdAt', label: 'Created At', render: (r) => stamp(row(r).order.createdAt) },
]

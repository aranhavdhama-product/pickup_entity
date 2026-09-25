/**
 * Payment receipt (`/grow/orders/wallet/:id`) — the live `/receipt/` page
 * (research §4, screenshot 10): back arrow + download at the top → one white
 * receipt card: tenant mark + Add / Ph lines left, Receipt Id · Date · ABN Number
 * right, a centred Particulars | Details table (Transaction Status · Reference
 * Number · Transaction Type · Amount · Payment Mode), the footer line.
 * Our additions: the consignments the payment covered, and shipping / tax.
 * Download = the browser's print dialog (no PDF service locally).
 */
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { EmptyState, IconButton, PageHeader, Panel, StatusPill } from '../../nueva/components'
import { ledgerEntryById } from '../../growOrders/ledger'
import { useLedger } from '../../growOrders/ledger'
import { useGrowOrders } from '../../growOrders/store'
import { currentMerchant, useMasters, useMerchantCode } from '../../growOrders/masters'
import { readMerchantSettings } from '../../growOrders/merchantSettings'
import { fmtDate, fmtDateTime, money } from './utils'
import { LEDGER_TONE } from './WalletPage'

export default function ReceiptPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  useLedger()
  const db = useGrowOrders()
  const masters = useMasters()
  const merchant = currentMerchant(masters.merchants, useMerchantCode())
  const e = ledgerEntryById(id)
  const back = () => nav('/grow/orders/wallet')
  if (!e) {
    return (
      <div>
        <PageHeader title="Receipt" onBack={back} />
        <Panel><EmptyState title="Receipt not found" hint={`No payment ${id} in this browser.`} /></Panel>
      </div>
    )
  }
  const biz = readMerchantSettings(merchant?.code ?? '', merchant?.name ?? '').business
  const party = merchant?.party
  const rows: [string, React.ReactNode][] = [
    ['Transaction Status', <StatusPill key="s" label={e.status} tone={LEDGER_TONE[e.status]} />],
    ['Reference Number', e.id],
    ['Transaction Type', e.type],
    ['Shipping charges', money(e.shipping, e.currency)],
    ['Taxes', money(e.tax, e.currency)],
    ['Amount', <b key="a">{money(e.amount, e.currency)}</b>],
    ['Payment Mode', e.mode],
  ]
  return (
    <div>
      <PageHeader title="Receipt" subtitle={`Payment of ${fmtDateTime(e.at)}`} onBack={back}
        right={<IconButton icon={<Download size={15} />} title="Download receipt" onClick={() => window.print()} />} />
      <Panel>
        <div className="px-8 py-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="text-[13px] text-ink-2">
              <p className="text-[18px] font-black tracking-wide text-ink">{merchant?.name ?? 'Merchant'}</p>
              <p className="mt-2"><span className="text-ink-3">Add: </span>{party ? [party.line1, party.city, party.postalCode].filter(Boolean).join(', ') : '—'}</p>
              <p><span className="text-ink-3">Ph: </span>{party?.contactNumber || '—'}</p>
            </div>
            <div className="text-right text-[13px]">
              <p><span className="text-ink-3">Receipt Id: </span><b className="text-ink">{e.id}</b></p>
              <p className="mt-1"><span className="text-ink-3">Date: </span><b className="text-ink">{fmtDate(e.at)}</b></p>
              <p className="mt-1"><span className="text-ink-3">ABN Number: </span><b className="text-ink">{biz.abn || '—'}</b></p>
            </div>
          </div>
          <table className="mx-auto mt-8 w-full max-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left"><th className="py-2 font-bold text-ink">Particulars</th><th className="py-2 font-bold text-ink">Details</th></tr>
            </thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}><td className="py-2 text-ink-3">{k}</td><td className="py-2 text-ink">{v}</td></tr>
              ))}
              <tr>
                <td className="py-2 align-top text-ink-3">Consignments</td>
                <td className="py-2 text-ink">
                  {e.consignmentNos.map((cn, i) => {
                    const live = db.orders.some((o) => o.id === e.orderIds[i])
                    return <span key={cn + i} className="mr-2 inline-block">{live
                      ? <Link to={`/grow/orders?order=${e.orderIds[i]}`} className="font-bold text-ink hover:underline">{cn}</Link>
                      : cn}</span>
                  })}
                </td>
              </tr>
            </tbody>
          </table>
          {e.estimated && <p className="mt-4 text-center text-[12px] text-ink-3">Amount estimated from the rate card — this order was created outside checkout.</p>}
          <p className="mt-6 text-center text-[12px] text-ink-3">If you have any questions about this receipt, visit the <Link to="/grow/orders/disputes" className="font-bold text-ink hover:underline">Disputes</Link> section.</p>
        </div>
      </Panel>
    </div>
  )
}

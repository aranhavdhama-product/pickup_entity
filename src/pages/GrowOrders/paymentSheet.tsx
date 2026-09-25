/**
 * The Grow merchant payment sheet — ONE component for checkout, the order
 * overlay's "Pay now" and Billing's "Pay now" (owner, 2026-09-25: "payment flow
 * should also be there"). Method cards (neutral selection: ink border + warm-50):
 *  · Wallet balance — shows the balance; short → inline Recharge (the Wallet's
 *    "Add Money to Wallet" dialog) and back;
 *  · Card / online — a DEMO form (number shown masked, name, MM/YY); only the
 *    last 4 digits ever leave this component, nothing is stored;
 *  · Pay later / credit — only on a Postpaid account (Settings → Business →
 *    Payment Type); the debit stays Pending and the invoice reads Due;
 *  · Cash on delivery — only when the order is COD (checkout only).
 * The chosen method is remembered per merchant (`merchantSettings.defaultPayMethod`).
 * Ledger: `growOrders/ledger.ts` (`recordPayment`, `settlePayments`, `walletOf`).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, CalendarClock, Check, CreditCard, Wallet } from 'lucide-react'
import { Button, Input, MenuSelect, Modal } from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { RECHARGE_METHODS, isDue, ledgerSnapshot, recharge, settlePayments, useLedger, walletOf, type PayMethod } from '../../growOrders/ledger'
import { currentMerchant, useMasters, useMerchantCode } from '../../growOrders/masters'
import { saveMerchantSettings, useMerchantSettings } from '../../growOrders/merchantSettings'
import { MField, NumInput } from './merchantFormBits'
import { money } from './utils'

/* --------------------------------------------------------- recharge dialog -- */

export function RechargeDialog({ currency, suggested = 0, onClose, onDone }: {
  currency: string; suggested?: number; onClose: () => void; onDone?: () => void
}) {
  const picks = currency === '$' ? [50, 100, 250, 500] : [1000, 2500, 5000, 10000]
  const min = currency === '$' ? 10 : 100
  const [amount, setAmount] = useState(() => (suggested > 0 ? Math.max(min, Math.ceil(suggested)) : 0))
  const [method, setMethod] = useState<string>(RECHARGE_METHODS[0])
  const [note, setNote] = useState('')
  const ok = amount >= min
  return (
    <Modal open title="Add Money to Wallet" subtitle="Enter amount to be added — demo only, no payment is taken." onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!ok} onClick={() => { const e = recharge(amount, currency, method, note); toast.success(`${money(e.amount, currency)} added to your wallet`); onClose(); onDone?.() }}>Recharge</Button></>}>
      <div className="grid grid-cols-1 gap-4 pb-4 pt-1 sm:grid-cols-2">
        <MField label={`Amount (${currency})`} required className="sm:col-span-2" hint={`Minimum ${money(min, currency)}`}>
          <NumInput value={amount} onChange={setAmount} unit={currency} blankZero placeholder="0.00" />
          <div className="mt-2 flex flex-wrap gap-2">
            {picks.map((p) => (
              <button key={p} type="button" onClick={() => setAmount(p)}
                className={`h-7 rounded-full border px-3 text-[12px] ${amount === p ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line text-ink-2 hover:bg-warm-50'}`}>
                + {money(p, currency)}
              </button>
            ))}
          </div>
        </MField>
        <MField label="Payment method"><MenuSelect value={method} options={[...RECHARGE_METHODS]} onChange={setMethod} /></MField>
        <MField label="Note"><Input value={note} onChange={setNote} placeholder="Optional" /></MField>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------- the sheet -- */

export interface PaymentChoice { method: PayMethod; last4?: string; ready: boolean; reason?: string }

function MethodCard({ on, icon, title, sub, onClick, children }: {
  on: boolean; icon: React.ReactNode; title: string; sub: React.ReactNode; onClick: () => void; children?: React.ReactNode
}) {
  return (
    <div className={`rounded-md border transition-colors ${on ? 'border-ink bg-warm-50' : 'border-line bg-surface hover:border-warm-300'}`}>
      <button type="button" role="radio" aria-checked={on} onClick={onClick} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-ink bg-ink text-white' : 'border-warm-400'}`}>
          {on && <Check size={10} strokeWidth={3} />}
        </span>
        <span className="text-ink-3">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[13px] text-ink ${on ? 'font-bold' : ''}`}>{title}</span>
          <span className="block text-[12px] text-ink-3">{sub}</span>
        </span>
      </button>
      {on && children && <div className="px-4 pb-4 pl-[52px]">{children}</div>}
    </div>
  )
}

const digits = (s: string) => s.replace(/\D/g, '')
const maskCard = (d: string) => (d.length <= 4 ? d : `${'•'.repeat(d.length - 4)}${d.slice(-4)}`).replace(/(.{4})/g, '$1 ').trim()
const expiryOk = (v: string) => {
  const m = /^(\d{2})\/(\d{2})$/.exec(v)
  if (!m || +m[1] < 1 || +m[1] > 12) return false
  const now = new Date(); const y = 2000 + +m[2]
  return y > now.getFullYear() || (y === now.getFullYear() && +m[1] >= now.getMonth() + 1)
}

/** The method cards. Calls `onChange` with the current choice and whether it can be paid. */
export function PaymentSheet({ amount, currency, allowCod = false, onChange }: {
  amount: number; currency: string; allowCod?: boolean; onChange: (c: PaymentChoice) => void
}) {
  const ledger = useLedger()
  const masters = useMasters()
  const merchant = currentMerchant(masters.merchants, useMerchantCode())
  const settings = useMerchantSettings(merchant?.code ?? '', merchant?.name ?? '', merchant?.party)
  const postpaid = settings.business.paymentType === 'Postpaid'
  const balance = useMemo(() => walletOf(ledger, currency).balance, [ledger, currency])
  const allowed: PayMethod[] = ['Wallet', 'Card', ...(postpaid ? ['Pay later' as const] : []), ...(allowCod ? ['COD' as const] : [])]
  const pref = settings.defaultPayMethod as PayMethod
  const [method, setMethodState] = useState<PayMethod>(allowed.includes(pref) ? pref : 'Wallet')
  const [raw, setRaw] = useState('') // card digits — kept in component state only, never persisted
  const [name, setName] = useState('')
  const [exp, setExp] = useState('')
  const [recharging, setRecharging] = useState(false)
  const short = Math.max(0, Math.round((amount - balance) * 100) / 100)

  const choice: PaymentChoice = method === 'Wallet'
    ? { method, ready: short === 0, reason: short ? `Wallet is short by ${money(short, currency)}` : undefined }
    : method === 'Card'
      ? { method, last4: digits(raw).slice(-4), ready: digits(raw).length >= 13 && !!name.trim() && expiryOk(exp), reason: 'Enter the card number, name and a valid expiry' }
      : { method, ready: true }
  /* report every render's choice to the parent (cheap; parent keeps it in a ref/state) */
  const key = `${choice.method}|${choice.ready}|${choice.last4 ?? ''}`
  const [sent, setSent] = useState('')
  if (sent !== key) { setSent(key); queueMicrotask(() => onChange(choice)) }

  const setMethod = (m: PayMethod) => {
    setMethodState(m)
    if (merchant?.code) saveMerchantSettings(merchant.code, settings, { defaultPayMethod: m })
  }
  return (
    <div role="radiogroup" className="flex flex-col gap-2">
      <MethodCard on={method === 'Wallet'} onClick={() => setMethod('Wallet')} icon={<Wallet size={17} />} title="Wallet balance"
        sub={<>Balance <b className="text-ink">{money(balance, currency)}</b>{short > 0 && <span className="text-danger-fg"> · short by {money(short, currency)}</span>}</>}>
        {short > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setRecharging(true)}>Recharge</Button>
            <span className="text-[12px] text-ink-3">Add at least {money(short, currency)} to pay from the wallet.</span>
          </div>
        )}
      </MethodCard>
      <MethodCard on={method === 'Card'} onClick={() => setMethod('Card')} icon={<CreditCard size={17} />} title="Card / online"
        sub="Demo only — no card is charged and the number is never stored">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_110px]">
          <MField label="Card number" required>
            <Input value={maskCard(digits(raw))} placeholder="•••• •••• •••• ••••"
              onChange={(v) => {
                /* typing appends digits, deleting drops the last one — the field only ever SHOWS the mask */
                const d = digits(v); const shown = digits(maskCard(digits(raw)))
                setRaw((r) => (v.length < maskCard(digits(r)).length ? digits(r).slice(0, -1) : (digits(r) + d.slice(shown.length)).slice(0, 19)))
              }} />
          </MField>
          <MField label="Name on card" required><Input value={name} onChange={setName} placeholder="As printed" /></MField>
          <MField label="Expiry" required><Input value={exp} placeholder="MM/YY"
            onChange={(v) => { const d = digits(v).slice(0, 4); setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d) }} /></MField>
        </div>
      </MethodCard>
      {postpaid && (
        <MethodCard on={method === 'Pay later'} onClick={() => setMethod('Pay later')} icon={<CalendarClock size={17} />} title="Pay later / credit"
          sub="Postpaid account — billed on this month's invoice, shown as Due in Billing" />
      )}
      {allowCod && (
        <MethodCard on={method === 'COD'} onClick={() => setMethod('COD')} icon={<Banknote size={17} />} title="Cash on delivery"
          sub="Shipping charges collected with the COD amount at delivery" />
      )}
      {recharging && <RechargeDialog currency={currency} suggested={short} onClose={() => setRecharging(false)} />}
    </div>
  )
}

/** The primary button's label for a choice. */
export const payLabel = (c: PaymentChoice | null, amount: number, currency: string, verb = 'and place order') =>
  !c || c.method === 'Wallet' || c.method === 'Card' ? `Pay ${money(amount, currency)} ${verb}`.trim() : verb === 'and place order' ? 'Place order' : 'Confirm'

/* ------------------------------------------------------------- pay now ---- */

/** Settle pending (pay-later / COD) debits with the wallet or a card. */
export function PayNowDialog({ entryIds, title, onClose, onPaid }: { entryIds: string[]; title?: string; onClose: () => void; onPaid?: () => void }) {
  const ledger = useLedger()
  const due = ledger.filter((e) => entryIds.includes(e.id) && isDue(e))
  const currency = due[0]?.currency ?? '₱'
  const amount = Math.round(due.reduce((n, e) => n + e.amount, 0) * 100) / 100
  const [choice, setChoice] = useState<PaymentChoice | null>(null)
  const payable = !!choice && choice.ready && (choice.method === 'Wallet' || choice.method === 'Card')
  return (
    <Modal open title={title ?? 'Pay now'} subtitle={`${due.length} unpaid payment${due.length === 1 ? '' : 's'} · ${money(amount, currency)}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button disabled={!payable || !due.length} onClick={() => {
          if (!choice) return
          settlePayments(due.map((e) => e.id), choice.method as 'Wallet' | 'Card', choice.last4)
          toast.success(`${money(amount, currency)} paid`)
          onClose(); onPaid?.()
        }}>Pay {money(amount, currency)}</Button></>}>
      <div className="pb-4 pt-1">
        {due.length === 0
          ? <p className="text-[13px] text-ink-2">Nothing left to pay.</p>
          : <PaymentSheet amount={amount} currency={currency} onChange={(c) => setChoice(c.method === 'Pay later' || c.method === 'COD' ? { ...c, ready: false } : c)} />}
        {choice && !payable && choice.reason && <p className="mt-2 text-[12px] text-ink-3">{choice.reason}</p>}
      </div>
    </Modal>
  )
}

/** "Pay now" for an order whose payment is still pending — for the order overlay's header. Renders nothing when paid. */
export function PayNowButton({ orderId }: { orderId: string }) {
  const ledger = useLedger()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const due = ledger.filter((e) => isDue(e) && e.orderIds.includes(orderId))
  if (!due.length) return null
  return (
    <>
      <Button icon={<CreditCard size={15} />} onClick={() => setOpen(true)}>Pay now</Button>
      {open && <PayNowDialog entryIds={due.map((e) => e.id)} onClose={() => setOpen(false)}
        onPaid={() => { const id = due[0].id; if (ledgerSnapshot().some((e) => e.id === id)) nav(`/grow/orders/wallet/${id}`) }} />}
    </>
  )
}

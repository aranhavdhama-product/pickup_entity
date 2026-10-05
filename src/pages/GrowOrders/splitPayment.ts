/**
 * Split payment for the Grow checkout (owner, 2026-10-05: "allow me to select multiple
 * payment options") — the STATE and the pure helpers behind `SplitPaymentSheet`
 * (paymentSheet.tsx). The hook lives in the checkout page, not in the sheet, so what the
 * merchant ticked survives a trip to the Summary step and back.
 *
 * The merchant ticks one or more methods (Wallet · Card · Pay later · Cash on delivery) and
 * gives each an amount that adds up to the payable amount:
 *  · an amount the merchant TYPES is kept;
 *  · every other ticked method is filled automatically from what is left — the Wallet first
 *    (never more than its balance), then the rest in the order they were ticked, so the
 *    newest method ends up with the remainder;
 *  · un-ticking a method frees its amount.
 * Ready = amounts add up to the payable amount to the cent, every amount is above zero, the
 * wallet part is within the balance (it is capped as it is typed) and the card details are valid.
 *
 * Card: the number is kept in this hook's state only (shown masked); only the last 4 digits ever
 * leave it, in `choice.parts`. Nothing is stored.
 */
import { useMemo, useState } from 'react'
import { useLedger, walletOf, type PayMethod, type PaymentPart } from '../../growOrders/ledger'
import { currentMerchant, useMasters, useMerchantCode } from '../../growOrders/masters'
import { saveMerchantSettings, useMerchantSettings } from '../../growOrders/merchantSettings'
import { money } from './utils'

/* ------------------------------------------------------------------ card ---- */

export const digits = (s: string) => s.replace(/\D/g, '')
export const maskCard = (d: string) => (d.length <= 4 ? d : `${'•'.repeat(d.length - 4)}${d.slice(-4)}`).replace(/(.{4})/g, '$1 ').trim()
export const expiryOk = (v: string) => {
  const m = /^(\d{2})\/(\d{2})$/.exec(v)
  if (!m || +m[1] < 1 || +m[1] > 12) return false
  const now = new Date(); const y = 2000 + +m[2]
  return y > now.getFullYear() || (y === now.getFullYear() && +m[1] >= now.getMonth() + 1)
}

/* ---------------------------------------------------------------- methods --- */

/** The order the cards are shown in, and the order the parts are written to the ledger. */
export const METHOD_ORDER: PayMethod[] = ['Wallet', 'Card', 'Pay later', 'COD']
export const METHOD_TITLE: Record<PayMethod, string> = {
  Wallet: 'Wallet balance', Card: 'Card / online', 'Pay later': 'Pay later / credit', COD: 'Cash on delivery',
}
const r2 = (n: number) => Math.round(n * 100) / 100

type Amounts = Partial<Record<PayMethod, number>>

/**
 * The amount of every ticked method. `ticked` is in tick order; `typed` holds what the merchant
 * typed. Typed amounts are fixed (the wallet's capped at `balance`); the rest are filled from
 * what is left — Wallet first (up to `balance`), then the others in tick order.
 */
export function splitShares(ticked: PayMethod[], typed: Amounts, payable: number, balance: number): Amounts {
  const out: Amounts = {}
  let left = payable
  for (const m of ticked) {
    const t = typed[m]
    if (t === undefined) continue
    const a = r2(m === 'Wallet' ? Math.min(t, balance) : t)
    out[m] = a
    left = r2(left - a)
  }
  const auto = ticked.filter((m) => typed[m] === undefined).sort((a, b) => Number(b === 'Wallet') - Number(a === 'Wallet'))
  for (const m of auto) {
    const room = Math.max(0, left)
    const a = r2(m === 'Wallet' ? Math.min(room, Math.max(0, balance)) : room)
    out[m] = a
    left = r2(left - a)
  }
  return out
}

/* --------------------------------------------------------------- wording ---- */

/** "Wallet" · "Card •••• 4242" · "Pay later" · "Cash on delivery" */
export const partLabel = (p: PaymentPart) =>
  p.method === 'Card' ? (p.last4 && p.last4.length === 4 ? `Card •••• ${p.last4}` : 'Card') : p.method === 'COD' ? 'Cash on delivery' : p.method

/** "₱ 100.00 from wallet" · "₱ 117.00 by card •••• 4242" · "₱ 50.00 billed later" · "₱ 30.00 to pay on delivery" */
export function partPhrase(p: PaymentPart, currency: string): string {
  const a = money(p.amount, currency)
  if (p.method === 'Wallet') return `${a} from wallet`
  if (p.method === 'Card') return `${a} by card${p.last4 && p.last4.length === 4 ? ` •••• ${p.last4}` : ''}`
  if (p.method === 'Pay later') return `${a} billed later`
  return `${a} to pay on delivery`
}
export const splitSummary = (parts: PaymentPart[], currency: string) => parts.map((p) => partPhrase(p, currency)).join(' · ')

const sumOf = (parts: PaymentPart[], pick: (m: PayMethod) => boolean) => r2(parts.filter((p) => pick(p.method)).reduce((n, p) => n + p.amount, 0))
/** What is taken at once: the Wallet and Card parts. */
export const paidNowOf = (parts: PaymentPart[]) => sumOf(parts, (m) => m === 'Wallet' || m === 'Card')
/** A short line for toasts: "Paid ₱ 217.00 · ₱ 50.00 billed later". */
export function payNote(parts: PaymentPart[], currency: string): string {
  const now = paidNowOf(parts), later = sumOf(parts, (m) => m === 'Pay later'), cod = sumOf(parts, (m) => m === 'COD')
  return [now > 0 ? `Paid ${money(now, currency)}` : '', later > 0 ? `${money(later, currency)} billed later` : '',
    cod > 0 ? `${money(cod, currency)} on delivery` : ''].filter(Boolean).join(' · ')
}

/* ------------------------------------------------------------------ hook ---- */

export interface SplitChoice {
  /** the ticked methods with their amounts, in `METHOD_ORDER` — what the ledger records */
  parts: PaymentPart[]
  allocated: number
  /** payable − allocated, to the cent (below zero = too much assigned) */
  left: number
  ready: boolean
  /** why it is not ready, in plain words */
  reason?: string
}

export interface SplitPayment {
  currency: string
  payable: number
  balance: number
  /** the methods offered: Wallet · Card, Pay later on a Postpaid account, COD on a COD order */
  allowed: PayMethod[]
  /** the ticked methods (offered ones only), in tick order */
  ticked: PayMethod[]
  amountOf: (m: PayMethod) => number
  toggle: (m: PayMethod) => void
  setAmount: (m: PayMethod, n: number) => void
  /** card form state — `number` is the MASKED number */
  card: { number: string; name: string; expiry: string; setNumber: (v: string) => void; setName: (v: string) => void; setExpiry: (v: string) => void }
  choice: SplitChoice
  /** remember the method with the largest share as the merchant's default */
  remember: () => void
}

export function useSplitPayment({ amount, currency, allowCod }: { amount: number; currency: string; allowCod: boolean }): SplitPayment {
  const ledger = useLedger()
  const masters = useMasters()
  const merchant = currentMerchant(masters.merchants, useMerchantCode())
  const settings = useMerchantSettings(merchant?.code ?? '', merchant?.name ?? '', merchant?.party)
  const postpaid = settings.business.paymentType === 'Postpaid'
  const balance = useMemo(() => walletOf(ledger, currency).balance, [ledger, currency])
  const allowed = METHOD_ORDER.filter((m) => m === 'Wallet' || m === 'Card' || (m === 'Pay later' && postpaid) || (m === 'COD' && allowCod))
  /* the remembered method starts ticked; a fresh merchant starts with the wallet (as the one-method sheet did) */
  const [pickedRaw, setPicked] = useState<PayMethod[]>(() => {
    const pref = settings.defaultPayMethod as PayMethod
    return allowed.includes(pref) ? [pref] : ['Wallet']
  })
  const [typed, setTyped] = useState<Amounts>({})
  const [raw, setRaw] = useState('') // card digits — component state only, never persisted
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState('')

  /* a method that stopped being offered (COD switched off, account made prepaid) drops out */
  const ticked = pickedRaw.filter((m) => allowed.includes(m))
  const shares = splitShares(ticked, typed, amount, balance)
  const amountOf = (m: PayMethod) => shares[m] ?? 0

  const parts: PaymentPart[] = METHOD_ORDER.filter((m) => ticked.includes(m))
    .map((m) => ({ method: m, amount: amountOf(m), ...(m === 'Card' ? { last4: digits(raw).slice(-4) } : {}) }))
  const allocated = r2(parts.reduce((n, p) => n + p.amount, 0))
  const left = r2(amount - allocated)
  const cardOk = digits(raw).length >= 13 && !!name.trim() && expiryOk(expiry)
  const empty = parts.find((p) => p.amount <= 0)
  let reason: string | undefined
  if (amount > 0) {
    if (!parts.length) reason = 'Choose how you pay.'
    else if (empty) reason = `Enter an amount for ${METHOD_TITLE[empty.method]}.`
    else if (left > 0) reason = `${money(left, currency)} is still left to assign.`
    else if (left < 0) reason = `The amounts are ${money(-left, currency)} more than the total.`
    else if (ticked.includes('Card') && !cardOk) reason = 'Enter the card number, name and a valid expiry.'
  }

  return {
    currency, payable: amount, balance, allowed, ticked, amountOf,
    toggle: (m) => {
      if (ticked.includes(m)) {
        setPicked(ticked.filter((x) => x !== m))
        setTyped((t) => { const n = { ...t }; delete n[m]; return n })
      } else setPicked([...ticked, m])
    },
    setAmount: (m, n) => {
      const v = r2(Math.max(0, Number.isFinite(n) ? n : 0))
      setTyped((t) => ({ ...t, [m]: m === 'Wallet' ? Math.min(v, Math.max(0, balance)) : v }))
    },
    card: {
      number: maskCard(digits(raw)), name, expiry,
      /* typing appends digits, deleting drops the last one — the field only ever SHOWS the mask */
      setNumber: (v) => setRaw((r) => {
        const d = digits(v); const shown = digits(maskCard(digits(r)))
        return v.length < maskCard(digits(r)).length ? digits(r).slice(0, -1) : (digits(r) + d.slice(shown.length)).slice(0, 19)
      }),
      setName,
      setExpiry: (v) => { const d = digits(v).slice(0, 4); setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d) },
    },
    choice: { parts, allocated, left, ready: !reason, reason },
    remember: () => {
      const top = [...parts].sort((a, b) => b.amount - a.amount)[0]
      if (merchant?.code && top) saveMerchantSettings(merchant.code, settings, { defaultPayMethod: top.method })
    },
  }
}

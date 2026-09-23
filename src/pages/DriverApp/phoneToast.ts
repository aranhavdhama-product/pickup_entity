/** A toast that shows INSIDE the phone frame (the page's nueva toast would sit
 *  over the desk, outside the device). Module-level so any screen can raise one. */
export type PhoneToastTone = 'info' | 'success' | 'error'
export interface PhoneToastMsg { id: number; text: string; tone: PhoneToastTone }

let seq = 0
const subs = new Set<(m: PhoneToastMsg) => void>()

export function phoneToast(text: string, tone: PhoneToastTone = 'info') {
  const m = { id: ++seq, text, tone }
  subs.forEach((f) => f(m))
}

export function onPhoneToast(f: (m: PhoneToastMsg) => void): () => void {
  subs.add(f)
  return () => { subs.delete(f) }
}

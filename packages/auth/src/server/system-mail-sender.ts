/**
 * System mail sender registry — packages/auth `apps/core`'a depend etmeden
 * better-auth callback'lerinden mail gönderebilsin diye injection point.
 *
 * apps/core `instrumentation.ts` → `setSystemMailSender(sendSystemEmail)`
 * auth.ts'in `sendResetPassword` / `sendVerificationEmail` callback'leri
 * `getSystemMailSender()?.()` ile çağırır. Set edilmemişse silently skip.
 */

export interface SystemMailInput {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export type SystemMailSender = (
  input: SystemMailInput,
) => Promise<{ sent: boolean; reason?: string }>

let sender: SystemMailSender | null = null

export function setSystemMailSender(fn: SystemMailSender): void {
  sender = fn
}

export function getSystemMailSender(): SystemMailSender | null {
  return sender
}

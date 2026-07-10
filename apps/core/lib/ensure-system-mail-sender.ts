import {
  getSystemMailSender,
  setSystemMailSender,
} from "@workspace/auth/server/system-mail-sender"
import {
  getSystemMailEventResolver,
  setSystemMailEventResolver,
} from "@workspace/auth/server/system-mail-events"
import { sendSystemEmail } from "@/lib/system-mail"
import { resolveSystemMailEventOverride } from "@/lib/system-mail-event-resolver"

/**
 * Defansif registry initialization — `instrumentation.ts` boot'unda zaten
 * setSystemMailSender + setSystemMailEventResolver çağrılıyor, ama bazı
 * runtime senaryolarında (Next standalone build, dev HMR, edge runtime
 * fallback) instrumentation hook'u route handler'lar load edilirken
 * henüz tetiklenmemiş olabilir. Bu durumda registry'ler boş kalır ve
 * davet/auth email'leri sessizce skip edilir veya admin override'ları
 * uygulanmaz.
 *
 * Bu helper module-level çağrıldığında (route handler dosyasının üst
 * kısmında), o dosya yüklenirken sender + resolver mutlaka
 * register'lanır. Idempotent: zaten set'liyse no-op.
 *
 * Çağırma yeri: `apps/core/app/api/companies/[slug]/invitations/...`
 * route'larının üstünde tek satır.
 */
export function ensureSystemMailSender(): void {
  if (!getSystemMailSender()) {
    setSystemMailSender(sendSystemEmail)
  }
  if (!getSystemMailEventResolver()) {
    setSystemMailEventResolver(resolveSystemMailEventOverride)
  }
}

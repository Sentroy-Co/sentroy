/**
 * Next.js instrumentation hook — server boot'ta bir kez çalışır.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Burada packages/auth'un sender + event resolver registry'lerine
 * apps/core implementasyonlarını inject ediyoruz. Cross-package çağrıyı
 * runtime'da bağlamak için tek doğru yer — module-level import yapsak
 * `apps/core` bağımlılığı `packages/auth`'a zorla cycle oluştururdu.
 *
 *  - `setSystemMailSender(sendSystemEmail)` — better-auth callback'leri
 *    ve davet handler'ı buradan mail gönderir.
 *  - `setSystemMailEventResolver(resolveSystemMailEventOverride)` —
 *    /admin/system-mail/events üzerinden DB'ye yazılan override'ları
 *    auth callback'lerine taşır. Override yoksa registry default
 *    devreye girer (silently).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const [
    { setSystemMailSender },
    { setSystemMailEventResolver },
    { sendSystemEmail },
    { resolveSystemMailEventOverride },
  ] = await Promise.all([
    import("@workspace/auth/server/system-mail-sender"),
    import("@workspace/auth/server/system-mail-events"),
    import("@/lib/system-mail"),
    import("@/lib/system-mail-event-resolver"),
  ])

  setSystemMailSender(sendSystemEmail)
  setSystemMailEventResolver(resolveSystemMailEventOverride)
}

/**
 * Next.js instrumentation hook — auth2 server boot'ta bir kez çalışır.
 *
 * Burası iki injection point'i bağlar:
 *
 *  - `setSystemMailSender(sendSystemEmail)` — packages/console/handlers/
 *    auth-project-public.ts'in `sendAuthProjectMail` çağrıları (verify-
 *    email, password-reset) buradan mail gönderir. apps/core'un aynı
 *    pattern'i ile paralel — her Next.js process'inin kendi runtime
 *    binding'i olur.
 *
 *  - `setAuthProjectMailEventResolver(resolveAuthProjectMailEventOverride)`
 *    — auth project per-key admin override store'u v2'de açıldığında
 *    buraya bağlanır. Şu an no-op resolver (varsayılan template'ler).
 *
 * Module-level import yapamayız çünkü packages/auth → apps/auth2 cycle
 * doğardı; instrumentation hook lazy dinamik import ile bunu çözer.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const [
    { setSystemMailSender },
    { setAuthProjectMailEventResolver },
    { sendSystemEmail },
    { authProjectMailTemplateModel },
  ] = await Promise.all([
    import("@workspace/auth/server/system-mail-sender"),
    import("@workspace/auth/server/auth-project-mail-events"),
    import("@/lib/system-mail"),
    import("@workspace/db/models"),
  ])

  setSystemMailSender(sendSystemEmail)
  // DB-backed per-project mail template override resolver — RP'nin
  // dashboard'da yazdığı subject/htmlBody varsa onu döner; yoksa null
  // → registry default'lara fallback.
  setAuthProjectMailEventResolver(async (eventKey, projectId) => {
    const tpl = await authProjectMailTemplateModel.findByEvent(
      projectId,
      eventKey,
    )
    if (!tpl || !tpl.enabled) return null
    // pickLocalized eksik locale için DEFAULT_LOCALE'a fallback yapar;
    // burada subject/htmlBody alanlarını LocalizedString shape'inde
    // döndürürüz (en+tr opsiyonel).
    return {
      subject: tpl.subject as { tr?: string; en?: string },
      htmlBody: tpl.htmlBody as { tr?: string; en?: string },
      enabled: tpl.enabled,
    }
  })
}

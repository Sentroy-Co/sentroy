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

  // ── Faz 5: registry sync periyodik pull ──────────────────────────────────
  // APP_REGISTRY_ENABLED yoksa hiçbir timer başlamaz → hosted/registry-kapalı
  // boot yolu byte-birebir aynı. Enable ise: gecikmeli ilk çalışma + jitter'lı
  // periyodik pull. Advisory single-flight registryState.lastSyncAt üzerinden
  // (multi-replica stampede'i azaltır; kesin lock O3'te status-worker'a devir).
  const { isRegistrySyncEnabled, syncRegistry } = await import("@/lib/app-registry/sync")
  if (isRegistrySyncEnabled()) {
    const intervalSec = Math.max(300, Number(process.env.APP_REGISTRY_SYNC_INTERVAL) || 21600)
    const runSafe = async (trigger: string) => {
      try {
        await syncRegistry({ trigger })
      } catch (err) {
        console.error("[app-registry] sync failed", err)
      }
    }
    // İlk çalışma: 30-90s gecikme (boot storm + replica çeşitliliği).
    const initialDelay = 30_000 + Math.floor((Number(process.env.PORT) || 3000) % 60) * 1000
    setTimeout(() => {
      void runSafe("boot")
      // Periyodik — sabit interval (jitter initialDelay ile zaten dağıtıldı).
      setInterval(() => void runSafe("timer"), intervalSec * 1000)
    }, initialDelay)
  }
}

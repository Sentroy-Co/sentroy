/**
 * Next.js instrumentation hook — server boot'ta bir kez çalışır (Next 16'da
 * instrumentation.ts varsayılan destekli; ek config gerekmez).
 *
 * Telegram bot runner'ını burada başlatıyoruz: 60 sn'de bir linear_settings
 * taranır, telegram.enabled + token'ı olan şirketler için long-poll poller
 * açılır (bkz. lib/telegram/runner.ts). Tek replica varsayımı — ayrı worker
 * process YOK (mimari karar).
 *
 * `next build` register()'ı çağırmaz; yalnız server runtime'da (nodejs) koşar.
 * DB erişilemezse runner içeride loglayıp tekrar dener — boot'u düşürmez.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { ensureTelegramRunnerStarted } = await import("@/lib/telegram/runner")
  ensureTelegramRunnerStarted()
}

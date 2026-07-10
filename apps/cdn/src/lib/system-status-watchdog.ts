const DEFAULT_INTERVAL_MS = 30 * 60 * 1000
const DEFAULT_INITIAL_DELAY_MS = 5 * 1000
const DEFAULT_TIMEOUT_MS = 10 * 1000
const MIN_INTERVAL_MS = 60 * 1000

function isDisabled(value: string | undefined): boolean {
  if (!value) return false
  return ["0", "false", "off", "disabled", "no"].includes(
    value.trim().toLowerCase(),
  )
}

function parseMs(name: string, fallback: number, min = 0): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < min) {
    console.warn(
      `[system-status-watchdog] ${name}=${raw} is invalid; using ${fallback}ms`,
    )
    return fallback
  }

  return parsed
}

function normalizeBaseUrl(value: string | undefined): string {
  return (value || "").trim().replace(/\/+$/, "")
}

function resolveTargetUrl(): string {
  const explicit = process.env.SYSTEM_STATUS_WATCHDOG_URL?.trim()
  if (explicit) return explicit

  const coreUrl = normalizeBaseUrl(
    process.env.CORE_APP_URL || process.env.NEXT_PUBLIC_CORE_APP_URL,
  )
  return coreUrl ? `${coreUrl}/api/admin/system-status` : ""
}

export function startSystemStatusWatchdog(): () => void {
  if (isDisabled(process.env.SYSTEM_STATUS_WATCHDOG_ENABLED)) {
    console.log("[system-status-watchdog] disabled by env")
    return () => {}
  }

  const targetUrl = resolveTargetUrl()
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim()
  if (!targetUrl || !internalSecret) {
    console.warn(
      "[system-status-watchdog] not started; configure CORE_APP_URL/NEXT_PUBLIC_CORE_APP_URL or SYSTEM_STATUS_WATCHDOG_URL plus INTERNAL_API_SECRET",
    )
    return () => {}
  }

  const intervalMs = parseMs(
    "SYSTEM_STATUS_WATCHDOG_INTERVAL_MS",
    DEFAULT_INTERVAL_MS,
    MIN_INTERVAL_MS,
  )
  const initialDelayMs = parseMs(
    "SYSTEM_STATUS_WATCHDOG_INITIAL_DELAY_MS",
    DEFAULT_INITIAL_DELAY_MS,
  )
  const timeoutMs = parseMs(
    "SYSTEM_STATUS_WATCHDOG_TIMEOUT_MS",
    DEFAULT_TIMEOUT_MS,
    1000,
  )

  let running = false
  let stopped = false

  async function probe() {
    if (running || stopped) return
    running = true
    const startedAt = Date.now()

    try {
      const res = await fetch(targetUrl, {
        headers: {
          "x-internal-secret": internalSecret,
          "cache-control": "no-cache",
          "user-agent": "sentroy-cdn-system-status-watchdog",
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => "")
        console.warn(
          `[system-status-watchdog] probe failed (${res.status}) ${body.slice(0, 200)}`,
        )
        return
      }

      console.log(
        `[system-status-watchdog] probe recorded in ${Date.now() - startedAt}ms`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : "request failed"
      console.warn(`[system-status-watchdog] probe error: ${message}`)
    } finally {
      running = false
    }
  }

  const initialTimer = setTimeout(() => {
    void probe()
  }, initialDelayMs)
  const intervalTimer = setInterval(() => {
    void probe()
  }, intervalMs)

  console.log(
    `[system-status-watchdog] started; target=${targetUrl}, interval=${intervalMs}ms`,
  )

  return () => {
    stopped = true
    clearTimeout(initialTimer)
    clearInterval(intervalTimer)
  }
}

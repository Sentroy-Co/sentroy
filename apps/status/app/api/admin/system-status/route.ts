import { NextRequest } from "next/server"
import {
  jsonError,
  jsonSuccess,
  getAuthSession,
} from "@workspace/console/lib/api-helpers"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import { clientPromise } from "@workspace/db/client"
import { systemStatusProbeModel } from "@workspace/db/models"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"

// Tek-noktadan health probe — admin dashboard'u bu endpoint'i çağırır,
// 5 servisin durumunu paralel kontrol eder.
//
// Sınıflandırma (her servis için):
//   operational  → 2xx + latency < OPERATIONAL_MS
//   degraded     → 2xx + latency >= OPERATIONAL_MS
//   down         → 4xx/5xx, network hatası veya timeout
//
// Tüm probe'lar Promise.allSettled ile paralel — bir servis düşse de diğer
// raporlar gelir. Her birine 5sn timeout (AbortSignal).

const TIMEOUT_MS = 5_000
const OPERATIONAL_MS = 1_000

export type ServiceStatus = "operational" | "degraded" | "down"

interface ServiceCheck {
  key: string
  label: string
  status: ServiceStatus
  latencyMs: number
  error?: string
  meta?: Record<string, unknown>
}

function classify(latencyMs: number, ok: boolean): ServiceStatus {
  if (!ok) return "down"
  if (latencyMs >= OPERATIONAL_MS) return "degraded"
  return "operational"
}

async function authorizeSystemStatusRequest(request: NextRequest) {
  if (request.headers.has("x-internal-secret")) {
    return verifyInternalRequest(request)
  }

  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if (session.user.role !== "admin") return jsonError("Forbidden", 403)
  return null
}

async function probeMongo(): Promise<ServiceCheck> {
  const start = Date.now()
  try {
    const client = await Promise.race([
      clientPromise,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("connect timeout")), TIMEOUT_MS),
      ),
    ])
    await client.db(process.env.MONGODB_DATABASE).admin().ping()
    const latencyMs = Date.now() - start
    return {
      key: "mongodb",
      label: "MongoDB",
      status: classify(latencyMs, true),
      latencyMs,
    }
  } catch (err) {
    return {
      key: "mongodb",
      label: "MongoDB",
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "ping failed",
    }
  }
}

async function probeHttp(
  key: string,
  label: string,
  url: string,
  opts: { extractMeta?: (json: unknown) => Record<string, unknown> } = {},
): Promise<ServiceCheck> {
  const start = Date.now()
  if (!url) {
    return {
      key,
      label,
      status: "down",
      latencyMs: 0,
      error: "URL not configured",
    }
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Cache bypass — health probe daima taze sonuç görmeli
      cache: "no-store",
    })
    const latencyMs = Date.now() - start
    let meta: Record<string, unknown> | undefined
    if (opts.extractMeta) {
      try {
        meta = opts.extractMeta(await res.json())
      } catch {
        // body parse fail — meta yok ama HTTP cevap verdi, problem değil
      }
    }
    return {
      key,
      label,
      status: classify(latencyMs, res.ok),
      latencyMs,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      ...(meta ? { meta } : {}),
    }
  } catch (err) {
    return {
      key,
      label,
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "request failed",
    }
  }
}

export async function GET(request: NextRequest) {
  const authError = await authorizeSystemStatusRequest(request)
  if (authError) return authError

  const sentroyApi = (process.env.NEXT_PUBLIC_SENTROY_API_URL || "").replace(/\/+$/, "")
  const cdnUrl = process.env.CDN_API_URL || ""
  const mailUrl = process.env.MAIL_APP_URL || ""
  const storageUrl = process.env.STORAGE_APP_URL || ""

  const extractAppMeta = (json: unknown) => {
    const j = json as { version?: string | null; service?: string }
    return {
      ...(j.version ? { version: j.version } : {}),
      ...(j.service ? { service: j.service } : {}),
    }
  }

  const checks = await Promise.all([
    probeMongo(),
    // Sentroy mail-server Fastify `/api/v1` prefix'inde health endpoint'i
    // expose ediyor — tam path NEXT_PUBLIC_SENTROY_API_URL + /health.
    probeHttp(
      "sentroy-api",
      "Sentroy Mail API",
      sentroyApi ? `${sentroyApi}/health` : "",
    ),
    probeHttp("cdn", "Stateless CDN", cdnUrl ? `${cdnUrl}/health` : ""),
    probeHttp(
      "mail-app",
      "Mail App",
      mailUrl ? `${mailUrl}/api/health` : "",
      { extractMeta: extractAppMeta },
    ),
    probeHttp(
      "storage-app",
      "Storage App",
      storageUrl ? `${storageUrl}/api/health` : "",
      { extractMeta: extractAppMeta },
    ),
  ])

  // History için her probe'u DB'ye yaz — model 5dk dedup'lı, status değişimi
  // varsa ara değer de yazılır. Promise.all + catch ile sessizce başarısız.
  await Promise.all(
    checks.map((c) =>
      systemStatusProbeModel
        .recordProbe({
          key: c.key,
          status: c.status,
          latencyMs: c.latencyMs,
          error: c.error ?? null,
        })
        .catch(() => {}),
    ),
  )

  // Auto-restart logic — sentroy-api 3 ardışık probe'da down'sa ve 10dk
  // cooldown geçtiyse bir kez restart tetikle. Mail-server hung kalıp
  // tüm send isteklerini timeout'a sokuyordu; admin restart yapana kadar
  // production yara alıyor. Cooldown sayesinde restart loop yok.
  await tryAutoRestart(checks).catch((err) =>
    console.warn("[system-status] auto-restart check failed:", err),
  )

  return jsonSuccess({
    generatedAt: new Date().toISOString(),
    services: checks,
  })
}

const AUTO_RESTART_FAILURE_THRESHOLD = 3
const AUTO_RESTART_COOLDOWN_MS = 10 * 60 * 1000 // 10 dakika

const AUTO_RESTART_TARGETS: Record<string, "mail-server"> = {
  "sentroy-api": "mail-server",
}

async function tryAutoRestart(
  checks: Array<{ key: string; status: string }>,
) {
  const targets = checks.filter((c) => AUTO_RESTART_TARGETS[c.key])
  if (targets.length === 0) return

  const { systemHealthStateModel, auditLogModel } = await import(
    "@workspace/db/models"
  )
  const state = await systemHealthStateModel.get()
  const now = Date.now()

  for (const c of targets) {
    const restartTarget = AUTO_RESTART_TARGETS[c.key]
    if (c.status === "operational") {
      // Sağlıklı — counter sıfırla.
      await systemHealthStateModel.resetFailure(c.key).catch(() => {})
      continue
    }
    // Down/degraded — fail counter artır.
    const failures = await systemHealthStateModel
      .incrementFailure(c.key)
      .catch(() => 0)
    if (failures < AUTO_RESTART_FAILURE_THRESHOLD) continue

    // Cooldown kontrolü.
    const lastRestart = state.lastAutoRestartAt[c.key]
    const lastMs = lastRestart ? new Date(lastRestart).getTime() : 0
    if (now - lastMs < AUTO_RESTART_COOLDOWN_MS) continue

    // Coolify env'leri tamam mı?
    const coolifyUrl = (await getEnvWithFallback("COOLIFY_API_URL"))?.replace(
      /\/+$/,
      "",
    )
    const coolifyToken = await getEnvWithFallback("COOLIFY_API_TOKEN")
    const appUuid =
      restartTarget === "mail-server"
        ? process.env.COOLIFY_MAIL_SERVER_UUID
        : process.env.COOLIFY_APP_UUID
    if (!coolifyUrl || !coolifyToken || !appUuid) {
      console.warn(
        `[system-status] auto-restart skipped: coolify env missing for ${restartTarget}`,
      )
      continue
    }

    try {
      const res = await fetch(
        `${coolifyUrl}/api/v1/applications/${appUuid}/restart`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${coolifyToken}`,
            "Content-Type": "application/json",
          },
        },
      )
      if (res.ok) {
        await systemHealthStateModel.markAutoRestart(c.key)
        auditLogModel
          .insert({
            userId: "system",
            action: "system.auto-restart",
            resource: "service",
            resourceId: restartTarget,
            details: {
              probeKey: c.key,
              consecutiveFailures: failures,
              triggeredBy: "system-status-watchdog",
            },
          })
          .catch(() => {})
        console.info(
          `[system-status] auto-restart triggered for ${restartTarget} after ${failures} consecutive failures`,
        )
      } else {
        console.warn(
          `[system-status] auto-restart fetch failed (${res.status}) for ${restartTarget}`,
        )
      }
    } catch (err) {
      console.warn(`[system-status] auto-restart error for ${restartTarget}:`, err)
    }
  }
}

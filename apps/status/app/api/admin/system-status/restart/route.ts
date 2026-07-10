import { NextRequest } from "next/server"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"

/**
 * POST /api/admin/system-status/restart
 * Body: { service: "core" | "mail" | "storage" | "mail-server" }
 *
 * Coolify v4 API üzerinden tek bir resource'un container'ını restart eder.
 *
 * v1.45.0'da monorepo 3 bağımsız Coolify resource'a bölündü
 * (`docker-compose.{core,mail,storage}.yaml`). Her birinin kendi UUID'si
 * var; restart sadece o resource'u etkiler — diğer 2'si dokunulmaz.
 * "mail-server" ayrı bir 4. resource (Sentroy mail SMTP/IMAP, farklı repo).
 *
 * Env (production environment):
 *   COOLIFY_API_URL                 Coolify base URL (örn https://coolify.example.com)
 *   COOLIFY_API_TOKEN               Coolify API token (read+write+deploy)
 *   COOLIFY_RESOURCE_UUID_CORE      sentroy-core resource UUID
 *   COOLIFY_RESOURCE_UUID_MAIL      sentroy-mail resource UUID
 *   COOLIFY_RESOURCE_UUID_STORAGE   sentroy-storage resource UUID
 *   COOLIFY_MAIL_SERVER_UUID        sentroy-mail-server resource UUID
 *
 * Coolify API resource type'ı UI'da nasıl yaratıldığına göre `services`
 * veya `applications` olabilir; her ikisini de deniyoruz (workflow'daki
 * `Detect Coolify resource type` adımıyla aynı pattern).
 *
 * Caller `admin` role olmak zorunda — restart üretimi durdurabilir.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if ((session.user as { role?: string }).role !== "admin") {
    return jsonError("Forbidden", 403)
  }

  let body: { service?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const service = body.service
  const validServices = ["core", "mail", "storage", "mail-server"] as const
  if (!validServices.includes(service as (typeof validServices)[number])) {
    return jsonError(
      `service must be one of: ${validServices.join(", ")}`,
    )
  }

  // Service → env UUID mapping. Eski monolitik `COOLIFY_APP_UUID`'a
  // dokunmuyoruz; tek-resource setup'larda fallback olabilir ama biz
  // doğrudan per-service UUID'yi zorunlu kılıyoruz (v1.45.0+).
  const uuidEnvMap = {
    core: "COOLIFY_RESOURCE_UUID_CORE",
    mail: "COOLIFY_RESOURCE_UUID_MAIL",
    storage: "COOLIFY_RESOURCE_UUID_STORAGE",
    "mail-server": "COOLIFY_MAIL_SERVER_UUID",
  } as const

  const envName = uuidEnvMap[service as keyof typeof uuidEnvMap]
  const resourceUuid = process.env[envName]
  const coolifyUrl = (await getEnvWithFallback("COOLIFY_API_URL"))?.replace(
    /\/+$/,
    "",
  )
  const coolifyToken = await getEnvWithFallback("COOLIFY_API_TOKEN")

  if (!coolifyUrl || !coolifyToken || !resourceUuid) {
    return jsonError(
      `Coolify API not configured (need COOLIFY_API_URL / COOLIFY_API_TOKEN / ${envName})`,
      503,
    )
  }

  // Resource type'ı detect et — services ya da applications.
  // Workflow build-and-push.yml'de aynı pattern var (deploy step).
  let resourceType: "services" | "applications" | null = null
  for (const candidate of ["services", "applications"] as const) {
    try {
      const probe = await fetch(
        `${coolifyUrl}/api/v1/${candidate}/${resourceUuid}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${coolifyToken}` },
        },
      )
      if (probe.ok) {
        resourceType = candidate
        break
      }
    } catch {
      // network hatası bir sonraki tipi dene
    }
  }
  if (!resourceType) {
    return jsonError(
      `Coolify resource ${resourceUuid} not found in services or applications`,
      404,
    )
  }

  try {
    const res = await fetch(
      `${coolifyUrl}/api/v1/${resourceType}/${resourceUuid}/restart`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${coolifyToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    const text = await res.text()
    if (!res.ok) {
      return jsonError(
        `Coolify restart failed (${res.status}): ${text.slice(0, 200)}`,
        502,
      )
    }

    return jsonSuccess({
      requested: service,
      resourceType,
      message:
        service === "mail-server"
          ? "Mail-server restart triggered. SMTP/IMAP cold-starts in ~60-90s; new sends queue at the SDK and flush after the server is back."
          : `${service} container restart triggered (~30-60s downtime). Other resources are unaffected.`,
    })
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Coolify request failed",
      502,
    )
  }
}

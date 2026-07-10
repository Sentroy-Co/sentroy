import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  statusPageModel,
  statusCheckModel,
  statusRestartTargetModel,
} from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"
import { encryptValue, isVaultConfigured } from "@workspace/console/lib/env-vault-crypto"

/**
 * Restart Target management — RP'lerin "X check'i 3 kez down olursa Y
 * endpoint'ini POST'la (örn. Coolify webhook, kendi /restart route'um,
 * vs.)" tanımlayabildiği target'lar.
 *
 * v1: sadece HTTP type. SSH + Coolify built-in v2 epic.
 *
 * Auth header'lar (Bearer token, X-Api-Key, vs.) AES-256-GCM ile
 * SENTROY_ENV_MASTER_KEY altında şifrelenip saklanır. Worker
 * (apps/status-worker) decrypt edip request'e ekler. UI'da plaintext
 * geri okunmaz — yalnız var/yok bilgisi (`hint.hasAuth`).
 */

async function resolvePage(
  access: { companyId: string },
): Promise<{ id: string; slug: string } | null> {
  const page = await statusPageModel.findByCompany(access.companyId)
  if (!page) return null
  return { id: page.id, slug: page.slug }
}

// ─── List ─────────────────────────────────────────────────────────────────

export async function targetsListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const targets = await statusRestartTargetModel.findByPage(page.id)
  return jsonSuccess(targets.map(statusRestartTargetModel.toPublic))
}

// ─── Create ───────────────────────────────────────────────────────────────

export async function targetCreatePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  let body: {
    name?: string
    type?: "http" | "ssh" | "coolify"
    http?: {
      url?: string
      method?: "POST" | "GET"
      headers?: Record<string, string>
      authHeaderName?: string | null
      authHeaderValue?: string | null
      bodyTemplate?: string | null
      expectedStatusMin?: number
      expectedStatusMax?: number
      timeoutMs?: number
    }
    ssh?: {
      host?: string
      port?: number
      username?: string
      /** PEM private key plaintext — server'da encrypt edilir. */
      privateKey?: string
      passphrase?: string | null
      command?: string
      timeoutMs?: number
    }
    coolify?: {
      baseUrl?: string
      /** Coolify API token plaintext — server'da encrypt edilir. */
      apiToken?: string
      resourceUuid?: string
      resourceType?: "applications" | "services" | "auto"
      timeoutMs?: number
    }
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("name required")
  }
  const type = body.type ?? "http"
  if (type !== "http" && type !== "ssh" && type !== "coolify") {
    return jsonError("type must be http, ssh, or coolify")
  }

  if (type === "http") {
    const http = body.http ?? {}
    if (typeof http.url !== "string" || !/^https?:\/\//.test(http.url)) {
      return jsonError("http.url required (must start with http:// or https://)")
    }
    let authHeaderEncrypted: string | null = null
    if (typeof http.authHeaderValue === "string" && http.authHeaderValue.trim()) {
      if (!isVaultConfigured()) {
        return jsonError(
          "SENTROY_ENV_MASTER_KEY not configured — cannot encrypt auth header",
          500,
        )
      }
      authHeaderEncrypted = encryptValue(http.authHeaderValue.trim())
    }
    const target = await statusRestartTargetModel.createHttp({
      pageId: page.id,
      name: body.name,
      createdBy: access.session!.user.id,
      config: {
        url: http.url,
        method: http.method === "GET" ? "GET" : "POST",
        headers: http.headers ?? {},
        authHeaderEncrypted,
        authHeaderName: http.authHeaderName?.trim() || null,
        bodyTemplate: http.bodyTemplate ?? null,
        expectedStatusMin: clampStatus(http.expectedStatusMin, 200),
        expectedStatusMax: clampStatus(http.expectedStatusMax, 299),
        timeoutMs: clampTimeout(http.timeoutMs, 30000),
      },
    })
    await audit({
      userId: access.session!.user.id,
      companyId: access.companyId,
      action: "status-page.restart-target.create",
      resource: "status-restart-target",
      resourceId: target.id,
      details: { pageSlug: page.slug, name: target.name, type: target.type, url: http.url },
    })
    return jsonSuccess(statusRestartTargetModel.toPublic(target), 201)
  }

  if (type === "ssh") {
    const ssh = body.ssh ?? {}
    if (typeof ssh.host !== "string" || !ssh.host.trim()) return jsonError("ssh.host required")
    if (typeof ssh.username !== "string" || !ssh.username.trim()) return jsonError("ssh.username required")
    if (typeof ssh.privateKey !== "string" || !ssh.privateKey.trim()) {
      return jsonError("ssh.privateKey required (PEM)")
    }
    if (typeof ssh.command !== "string" || !ssh.command.trim()) return jsonError("ssh.command required")
    if (!isVaultConfigured()) {
      return jsonError(
        "SENTROY_ENV_MASTER_KEY not configured — cannot encrypt SSH credentials",
        500,
      )
    }
    const target = await statusRestartTargetModel.createSsh({
      pageId: page.id,
      name: body.name,
      createdBy: access.session!.user.id,
      config: {
        host: ssh.host.trim(),
        port: clampPort(ssh.port, 22),
        username: ssh.username.trim(),
        privateKeyEncrypted: encryptValue(ssh.privateKey),
        passphraseEncrypted:
          typeof ssh.passphrase === "string" && ssh.passphrase.trim()
            ? encryptValue(ssh.passphrase)
            : null,
        command: ssh.command.trim(),
        timeoutMs: clampTimeout(ssh.timeoutMs, 30000),
      },
    })
    await audit({
      userId: access.session!.user.id,
      companyId: access.companyId,
      action: "status-page.restart-target.create",
      resource: "status-restart-target",
      resourceId: target.id,
      details: {
        pageSlug: page.slug,
        name: target.name,
        type: target.type,
        host: `${ssh.username}@${ssh.host}:${target.ssh?.port}`,
      },
    })
    return jsonSuccess(statusRestartTargetModel.toPublic(target), 201)
  }

  // coolify
  const coolify = body.coolify ?? {}
  if (typeof coolify.baseUrl !== "string" || !/^https?:\/\//.test(coolify.baseUrl)) {
    return jsonError("coolify.baseUrl required (http:// or https://)")
  }
  if (typeof coolify.apiToken !== "string" || !coolify.apiToken.trim()) {
    return jsonError("coolify.apiToken required")
  }
  if (typeof coolify.resourceUuid !== "string" || !coolify.resourceUuid.trim()) {
    return jsonError("coolify.resourceUuid required")
  }
  if (!isVaultConfigured()) {
    return jsonError(
      "SENTROY_ENV_MASTER_KEY not configured — cannot encrypt Coolify token",
      500,
    )
  }
  const target = await statusRestartTargetModel.createCoolify({
    pageId: page.id,
    name: body.name,
    createdBy: access.session!.user.id,
    config: {
      baseUrl: coolify.baseUrl.replace(/\/+$/, ""),
      apiTokenEncrypted: encryptValue(coolify.apiToken.trim()),
      resourceUuid: coolify.resourceUuid.trim(),
      resourceType:
        coolify.resourceType === "applications" || coolify.resourceType === "services"
          ? coolify.resourceType
          : "auto",
      timeoutMs: clampTimeout(coolify.timeoutMs, 60000),
    },
  })
  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.restart-target.create",
    resource: "status-restart-target",
    resourceId: target.id,
    details: {
      pageSlug: page.slug,
      name: target.name,
      type: target.type,
      baseUrl: coolify.baseUrl,
      resourceUuid: coolify.resourceUuid,
    },
  })
  return jsonSuccess(statusRestartTargetModel.toPublic(target), 201)
}

// ─── Update ───────────────────────────────────────────────────────────────

export async function targetPatch(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; targetId: string }> },
) {
  const { slug, targetId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusRestartTargetModel.findById(targetId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("restart target not found", 404)
  }

  let body: {
    name?: string
    enabled?: boolean
    http?: {
      url?: string
      method?: "POST" | "GET"
      headers?: Record<string, string>
      authHeaderName?: string | null
      /** Plaintext — gelirse encrypt edilip mevcut'un üstüne yazılır.
       *  `null` gelirse auth header silinir. `undefined`/omitted = dokunma. */
      authHeaderValue?: string | null
      bodyTemplate?: string | null
      expectedStatusMin?: number
      expectedStatusMax?: number
      timeoutMs?: number
    }
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  // Meta patch (name, enabled)
  if (typeof body.name === "string" || typeof body.enabled === "boolean") {
    await statusRestartTargetModel.updateMeta(targetId, {
      name: typeof body.name === "string" ? body.name : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    })
  }

  // Http config patch
  if (existing.type === "http" && body.http) {
    const patch: Partial<typeof existing.http> = {}
    if (typeof body.http.url === "string") {
      if (!/^https?:\/\//.test(body.http.url)) {
        return jsonError("http.url must start with http:// or https://")
      }
      patch.url = body.http.url
    }
    if (body.http.method === "POST" || body.http.method === "GET") {
      patch.method = body.http.method
    }
    if (body.http.headers !== undefined) patch.headers = body.http.headers
    if (body.http.authHeaderName !== undefined) {
      patch.authHeaderName = body.http.authHeaderName?.trim() || null
    }
    if (body.http.authHeaderValue !== undefined) {
      if (body.http.authHeaderValue === null || body.http.authHeaderValue === "") {
        patch.authHeaderEncrypted = null
      } else {
        if (!isVaultConfigured()) {
          return jsonError(
            "SENTROY_ENV_MASTER_KEY not configured — cannot encrypt auth header",
            500,
          )
        }
        patch.authHeaderEncrypted = encryptValue(body.http.authHeaderValue.trim())
      }
    }
    if (body.http.bodyTemplate !== undefined) patch.bodyTemplate = body.http.bodyTemplate
    if (typeof body.http.expectedStatusMin === "number") {
      patch.expectedStatusMin = clampStatus(body.http.expectedStatusMin, 200)
    }
    if (typeof body.http.expectedStatusMax === "number") {
      patch.expectedStatusMax = clampStatus(body.http.expectedStatusMax, 299)
    }
    if (typeof body.http.timeoutMs === "number") {
      patch.timeoutMs = clampTimeout(body.http.timeoutMs, 30000)
    }

    if (Object.keys(patch).length > 0) {
      await statusRestartTargetModel.updateHttpConfig(targetId, patch)
    }
  }

  const updated = await statusRestartTargetModel.findById(targetId)
  if (!updated) return jsonError("update failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.restart-target.update",
    resource: "status-restart-target",
    resourceId: targetId,
    details: { pageSlug: page.slug, name: updated.name },
  })

  return jsonSuccess(statusRestartTargetModel.toPublic(updated))
}

// ─── Delete ───────────────────────────────────────────────────────────────

export async function targetDelete(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; targetId: string }> },
) {
  const { slug, targetId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const existing = await statusRestartTargetModel.findById(targetId)
  if (!existing || existing.pageId !== page.id) {
    return jsonError("restart target not found", 404)
  }

  // Cascade: bu target'a bağlı check'lerin restartTargetId'sini null'a çek
  const boundChecks = await statusCheckModel.findByPage(page.id)
  await Promise.all(
    boundChecks
      .filter((c) => c.restartTargetId === targetId)
      .map((c) => statusCheckModel.update(c.id, { restartTargetId: null })),
  )

  const ok = await statusRestartTargetModel.remove(targetId)
  if (!ok) return jsonError("delete failed", 500)

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.restart-target.delete",
    resource: "status-restart-target",
    resourceId: targetId,
    details: { pageSlug: page.slug, name: existing.name },
  })

  return jsonSuccess({ ok: true })
}

// ─── Manual test fire ─────────────────────────────────────────────────────

/**
 * Dashboard'dan manuel "Test fire" — target'ı 1 kez tetikle, sonucu döner.
 * Worker'ın yaptığı aynı flow ama check threshold/cooldown bypass.
 * Audit'e `manual=true` flag. 3 target tipini de destekler (HTTP, SSH,
 * Coolify).
 */
export async function targetTestFirePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; targetId: string }> },
) {
  const { slug, targetId } = await params
  const access = await assertCompanyAccess(request, slug, "status-page.manage")
  if ("error" in access) return access.error

  const page = await resolvePage(access)
  if (!page) return jsonError("status page not found", 404)

  const target = await statusRestartTargetModel.findById(targetId)
  if (!target || target.pageId !== page.id) {
    return jsonError("restart target not found", 404)
  }

  const { decryptValue } = await import("@workspace/console/lib/env-vault-crypto")
  const {
    executeHttpRestart,
    executeSshRestart,
    executeCoolifyRestart,
  } = await import("@workspace/console/lib/restart-executor")

  let result: Awaited<ReturnType<typeof executeHttpRestart>>
  switch (target.type) {
    case "http":
      if (!target.http) return jsonError("http config missing", 500)
      result = await executeHttpRestart(target.http, decryptValue)
      break
    case "ssh":
      if (!target.ssh) return jsonError("ssh config missing", 500)
      result = await executeSshRestart(target.ssh, decryptValue)
      break
    case "coolify":
      if (!target.coolify) return jsonError("coolify config missing", 500)
      result = await executeCoolifyRestart(target.coolify, decryptValue)
      break
    default:
      return jsonError(`unsupported target type: ${target.type}`, 400)
  }

  await statusRestartTargetModel.recordTrigger(targetId, {
    success: result.success,
    message: result.message,
  })

  await audit({
    userId: access.session!.user.id,
    companyId: access.companyId,
    action: "status-page.restart-target.test-fire",
    resource: "status-restart-target",
    resourceId: targetId,
    details: {
      pageSlug: page.slug,
      name: target.name,
      type: target.type,
      success: result.success,
      message: result.message,
      httpStatus: result.httpStatus ?? null,
      manual: true,
    },
  })

  return jsonSuccess({
    success: result.success,
    message: result.message,
    httpStatus: result.httpStatus ?? null,
    latencyMs: result.latencyMs ?? 0,
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function clampPort(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(65535, Math.round(n)))
}

function clampStatus(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback
  return Math.max(100, Math.min(599, Math.round(n)))
}

function clampTimeout(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback
  return Math.max(1000, Math.min(120_000, Math.round(n)))
}

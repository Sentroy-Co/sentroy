import { NextRequest, NextResponse } from "next/server"
import { verifyInternalRequest } from "@workspace/console/lib/internal-auth"
import {
  statusPageModel,
  statusComponentModel,
  statusCheckModel,
  statusRestartTargetModel,
} from "@workspace/db/models"
import { encryptValue } from "@workspace/console/lib/env-vault-crypto"

/**
 * One-shot bootstrap — Sentroy şirketinin status page'ine 5 internal
 * servisi (Mail API, CDN, Mail App, Storage App, Status App) component
 * + HTTP check olarak ekler.
 *
 * Idempotent: aynı name'li component varsa atlar, aynı URL'li check
 * varsa atlar. Çağrı tekrar tekrar güvenli.
 *
 * Auth: internal-secret header.
 *
 * Usage:
 *   curl -X POST https://status.sentroy.com/api/admin/status-bootstrap \
 *     -H "x-internal-secret: $INTERNAL_API_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"pageSlug": "sentroy"}'
 *
 * Eski Phase 1.0'daki hardcoded `aggregate.ts` SERVICES listesinin
 * multi-tenant equivalent'i. URL'ler kalıcı env'lerden okunur — dev'de
 * localhost değil mevcut prod URL'lere düşer.
 */

interface ServiceDef {
  componentName: string
  componentDescription: string
  checkName: string
  url: string
  /** Hangi Coolify resource UUID'sine restart bağlanacak (varsa).
   *  null = restart skip (CDN, mail-server gibi Coolify dışı servisler). */
  coolifyMapKey:
    | "core"
    | "mail"
    | "storage"
    | "auth2"
    | "status"
    | null
}

function getDefs(): ServiceDef[] {
  const sentroyApi = (
    process.env.NEXT_PUBLIC_SENTROY_API_URL || "https://api.sentroy.com/api/v1"
  ).replace(/\/+$/, "")
  const cdnUrl = (process.env.CDN_API_URL || "https://cdn.sentroy.com").replace(
    /\/+$/,
    "",
  )
  const mailUrl = (
    process.env.NEXT_PUBLIC_MAIL_APP_URL || "https://mail.sentroy.com"
  ).replace(/\/+$/, "")
  const storageUrl = (
    process.env.NEXT_PUBLIC_STORAGE_APP_URL || "https://storage.sentroy.com"
  ).replace(/\/+$/, "")
  const statusUrl = (
    process.env.NEXT_PUBLIC_STATUS_APP_URL || "https://status.sentroy.com"
  ).replace(/\/+$/, "")

  return [
    {
      componentName: "Mail API",
      componentDescription: "Transactional + bulk send pipeline",
      checkName: "/health",
      url: `${sentroyApi}/health`,
      coolifyMapKey: "core",
    },
    {
      componentName: "CDN",
      componentDescription: "Public file delivery and image transforms",
      checkName: "/health",
      url: `${cdnUrl}/health`,
      coolifyMapKey: null,
    },
    {
      componentName: "Mail App",
      componentDescription: "mail.sentroy.com — inbox, templates, send UI",
      checkName: "/api/health",
      url: `${mailUrl}/api/health`,
      coolifyMapKey: "mail",
    },
    {
      componentName: "Storage App",
      componentDescription: "storage.sentroy.com — buckets and media UI",
      checkName: "/api/health",
      url: `${storageUrl}/api/health`,
      coolifyMapKey: "storage",
    },
    {
      componentName: "Status App",
      componentDescription: "status.sentroy.com — this status board itself",
      checkName: "/api/health",
      url: `${statusUrl}/api/health`,
      coolifyMapKey: "status",
    },
  ]
}

type CoolifyMapKey = NonNullable<ServiceDef["coolifyMapKey"]>
const RESTART_TARGET_NAMES: Record<CoolifyMapKey, string> = {
  core: "Coolify · core (sentroy.com)",
  mail: "Coolify · mail (mail.sentroy.com)",
  storage: "Coolify · storage (storage.sentroy.com)",
  auth2: "Coolify · auth2 (auth.sentroy.com)",
  status: "Coolify · status (status.sentroy.com)",
}

interface BootstrapBody {
  pageSlug?: string
  /** Coolify-type restart target'lar yarat ve check'lere bağla.
   *  Yoksa: sadece check oluştur (mevcut davranış). */
  coolify?: {
    baseUrl: string
    apiToken: string
    timeoutMs?: number
    /** service → Coolify resource UUID. Eksik mapping'ler skip edilir. */
    mapping: Partial<Record<CoolifyMapKey, string>>
  }
}

export async function POST(request: NextRequest) {
  const ok = await verifyInternalRequest(request)
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: BootstrapBody
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const pageSlug = body.pageSlug ?? "sentroy"

  const page = await statusPageModel.findBySlug(pageSlug)
  if (!page) {
    return NextResponse.json(
      {
        error: `Status page with slug "${pageSlug}" not found. Create it from the dashboard first.`,
      },
      { status: 404 },
    )
  }

  const existingComponents = await statusComponentModel.findByPage(page.id)
  const existingChecks = await statusCheckModel.findByPage(page.id)
  const existingTargets = await statusRestartTargetModel.findByPage(page.id)
  const existingCompByName = new Map(
    existingComponents.map((c) => [c.name.toLowerCase(), c]),
  )
  const existingUrls = new Set(
    existingChecks.map((c) => c.http.url.toLowerCase()),
  )
  const existingTargetByName = new Map(
    existingTargets.map((t) => [t.name.toLowerCase(), t]),
  )

  // 1. Coolify restart target'larını yarat (varsa coolify config geldi)
  const targetByMapKey = new Map<CoolifyMapKey, string>()
  const createdTargets: string[] = []
  const skipped: Array<{ name: string; reason: string }> = []

  if (body.coolify?.baseUrl && body.coolify.apiToken && body.coolify.mapping) {
    let apiTokenEncrypted: string
    try {
      apiTokenEncrypted = encryptValue(body.coolify.apiToken)
    } catch (err) {
      return NextResponse.json(
        {
          error: `coolify api token encryption failed: ${err instanceof Error ? err.message : "unknown"}`,
        },
        { status: 500 },
      )
    }
    const baseUrl = body.coolify.baseUrl.replace(/\/+$/, "")
    const timeoutMs = body.coolify.timeoutMs ?? 60_000

    for (const [mapKey, uuid] of Object.entries(body.coolify.mapping) as Array<
      [CoolifyMapKey, string | undefined]
    >) {
      if (!uuid || typeof uuid !== "string" || uuid.trim().length === 0) continue
      const targetName = RESTART_TARGET_NAMES[mapKey]
      if (!targetName) continue
      const existing = existingTargetByName.get(targetName.toLowerCase())
      if (existing) {
        targetByMapKey.set(mapKey, existing.id)
        skipped.push({
          name: targetName,
          reason: "restart target already exists",
        })
        continue
      }
      try {
        const target = await statusRestartTargetModel.createCoolify({
          pageId: page.id,
          name: targetName,
          config: {
            baseUrl,
            apiTokenEncrypted,
            resourceUuid: uuid.trim(),
            resourceType: "auto",
            timeoutMs,
          },
          createdBy: "system",
        })
        targetByMapKey.set(mapKey, target.id)
        createdTargets.push(targetName)
      } catch (err) {
        skipped.push({
          name: targetName,
          reason: `target create failed: ${err instanceof Error ? err.message : "unknown"}`,
        })
      }
    }
  }

  // 2. Component + check yarat / mevcut check'leri restart target'a bağla
  const defs = getDefs()
  const createdComponents: string[] = []
  const createdChecks: string[] = []
  const linkedChecks: string[] = []

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i]!
    let component = existingCompByName.get(def.componentName.toLowerCase())

    if (!component) {
      try {
        component = await statusComponentModel.create({
          pageId: page.id,
          name: def.componentName,
          description: def.componentDescription,
          groupKey: null,
          visible: true,
        })
        createdComponents.push(def.componentName)
      } catch (err) {
        skipped.push({
          name: def.componentName,
          reason: `component create failed: ${err instanceof Error ? err.message : "unknown"}`,
        })
        continue
      }
    }

    const targetId =
      def.coolifyMapKey ? (targetByMapKey.get(def.coolifyMapKey) ?? null) : null

    // Mevcut check var mı (URL'e göre)?
    const existingCheck = existingChecks.find(
      (c) => c.http.url.toLowerCase() === def.url.toLowerCase(),
    )

    if (existingCheck) {
      // Re-run: restart target eksikse şimdi bağla
      if (targetId && existingCheck.restartTargetId !== targetId) {
        try {
          await statusCheckModel.update(existingCheck.id, {
            restartTargetId: targetId,
          })
          linkedChecks.push(`${def.componentName} → ${def.checkName}`)
        } catch (err) {
          skipped.push({
            name: `${def.componentName} → ${def.checkName} (link)`,
            reason: `link failed: ${err instanceof Error ? err.message : "unknown"}`,
          })
        }
      } else {
        skipped.push({
          name: `${def.componentName} → ${def.checkName}`,
          reason: targetId ? "already linked" : "check exists; no coolify mapping",
        })
      }
      continue
    }

    if (existingUrls.has(def.url.toLowerCase())) {
      skipped.push({
        name: `${def.componentName} → ${def.checkName}`,
        reason: "check URL already exists",
      })
      continue
    }

    try {
      await statusCheckModel.create({
        componentId: component.id,
        pageId: page.id,
        name: def.checkName,
        http: {
          url: def.url,
          method: "GET",
          headers: {},
          expectedStatusMin: 200,
          expectedStatusMax: 299,
          expectedBodyContains: null,
          timeoutMs: 10000,
          degradedLatencyMs: 1000,
          insecureSkipTlsVerify: false,
        },
        intervalSeconds: 60,
        restartTargetId: targetId,
        restartFailureThreshold: 3,
        restartCooldownSeconds: 600,
      })
      createdChecks.push(
        `${def.componentName} → ${def.checkName}${targetId ? " ↻" : ""}`,
      )
    } catch (err) {
      skipped.push({
        name: `${def.componentName} → ${def.checkName}`,
        reason: `check create failed: ${err instanceof Error ? err.message : "unknown"}`,
      })
    }
  }

  return NextResponse.json({
    pageSlug,
    pageId: page.id,
    createdComponents,
    createdChecks,
    createdTargets,
    linkedChecks,
    skipped,
    summary: {
      componentsCreated: createdComponents.length,
      checksCreated: createdChecks.length,
      restartTargetsCreated: createdTargets.length,
      checksLinkedToTarget: linkedChecks.length,
      skipped: skipped.length,
    },
  })
}

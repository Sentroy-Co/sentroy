import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  authProjectModel,
  authProjectWebhookModel,
  authProjectWebhookDeliveryModel,
  auditLogModel,
  authProjectUserModel,
  authProjectTokenModel,
} from "@workspace/db/models"
import type {
  AuthWebhookEventTopic,
} from "@workspace/db/models/auth-project-webhook"
import { audit } from "@workspace/console/lib/audit"

/**
 * Dashboard handler'ları — Auth Project webhook'ları, audit log,
 * analytics, CSV user import. `auth-projects.manage` permission gerektirir.
 *
 * Tüm path'ler `/api/companies/[slug]/auth-projects/[id]/...` altında.
 */

const VALID_TOPICS: AuthWebhookEventTopic[] = [
  "user.signup",
  "user.login",
  "user.password-changed",
  "user.email-changed",
  "user.account-locked",
  "user.account-deleted",
]

async function assertProject(
  request: NextRequest,
  slug: string,
  projectId: string,
) {
  const access = await assertCompanyAccess(
    request,
    slug,
    "auth-projects.manage",
  )
  if ("error" in access) return { error: access.error }
  const project = await authProjectModel.findById(projectId)
  if (!project || project.companyId !== access.companyId) {
    return { error: jsonError("project not found", 404) }
  }
  return { access, project }
}

// ─── Webhooks CRUD ────────────────────────────────────────────────────────

export async function webhooksListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error
  const items = await authProjectWebhookModel.listByProject(ctx.project.id)
  return jsonSuccess(items)
}

export async function webhooksCreatePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error

  let body: {
    url?: string
    topicFilter?: string[]
    description?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return jsonError("url required")
  }
  if (!/^https?:\/\//i.test(body.url.trim())) {
    return jsonError("url must start with http:// or https://")
  }
  const topicFilter = Array.isArray(body.topicFilter)
    ? body.topicFilter.filter((t): t is AuthWebhookEventTopic =>
        VALID_TOPICS.includes(t as AuthWebhookEventTopic),
      )
    : []

  const { webhook, secret } = await authProjectWebhookModel.create({
    authProjectId: ctx.project.id,
    url: body.url,
    topicFilter,
    description:
      typeof body.description === "string" ? body.description : null,
  })

  await audit({
    userId: ctx.access.session!.user.id,
    companyId: ctx.access.companyId,
    action: "auth-project.webhook.create",
    resource: "auth-project-webhook",
    resourceId: webhook.id,
    details: { projectId: ctx.project.id, url: webhook.url },
  })

  // Plaintext secret — sadece bu response'ta gösterilir.
  return jsonSuccess({ ...webhook, secret }, 201)
}

export async function webhookPatch(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ slug: string; id: string; webhookId: string }> },
) {
  const { slug, id, webhookId } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error
  const existing = await authProjectWebhookModel.findById(webhookId)
  if (!existing || existing.authProjectId !== ctx.project.id) {
    return jsonError("webhook not found", 404)
  }

  // Rotate secret — destructive op, query-flag ile
  if (request.nextUrl.searchParams.get("action") === "rotate-secret") {
    const result = await authProjectWebhookModel.rotateSecret(webhookId)
    if (!result) return jsonError("rotate failed", 500)
    await audit({
      userId: ctx.access.session!.user.id,
      companyId: ctx.access.companyId,
      action: "auth-project.webhook.rotate-secret",
      resource: "auth-project-webhook",
      resourceId: webhookId,
      details: { projectId: ctx.project.id },
    })
    return jsonSuccess({ ...result.webhook, secret: result.secret })
  }

  let body: {
    url?: string
    topicFilter?: string[]
    enabled?: boolean
    description?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const patch: Parameters<typeof authProjectWebhookModel.update>[1] = {}
  if (typeof body.url === "string" && body.url.trim()) {
    if (!/^https?:\/\//i.test(body.url.trim())) {
      return jsonError("url must start with http:// or https://")
    }
    patch.url = body.url.trim()
  }
  if (Array.isArray(body.topicFilter)) {
    patch.topicFilter = body.topicFilter.filter((t): t is AuthWebhookEventTopic =>
      VALID_TOPICS.includes(t as AuthWebhookEventTopic),
    )
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled
  if (
    body.description === null ||
    typeof body.description === "string"
  ) {
    patch.description = body.description
  }

  const updated = await authProjectWebhookModel.update(webhookId, patch)
  if (!updated) return jsonError("update failed", 500)
  await audit({
    userId: ctx.access.session!.user.id,
    companyId: ctx.access.companyId,
    action: "auth-project.webhook.update",
    resource: "auth-project-webhook",
    resourceId: webhookId,
    details: { projectId: ctx.project.id, fields: Object.keys(patch) },
  })
  return jsonSuccess(updated)
}

export async function webhookDelete(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ slug: string; id: string; webhookId: string }> },
) {
  const { slug, id, webhookId } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error
  const existing = await authProjectWebhookModel.findById(webhookId)
  if (!existing || existing.authProjectId !== ctx.project.id) {
    return jsonError("webhook not found", 404)
  }
  const ok = await authProjectWebhookModel.remove(webhookId)
  if (!ok) return jsonError("delete failed", 500)
  await audit({
    userId: ctx.access.session!.user.id,
    companyId: ctx.access.companyId,
    action: "auth-project.webhook.delete",
    resource: "auth-project-webhook",
    resourceId: webhookId,
    details: { projectId: ctx.project.id, url: existing.url },
  })
  return jsonSuccess({ ok: true })
}

// ─── Webhook deliveries ───────────────────────────────────────────────────

export async function deliveriesListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error

  const url = new URL(request.url)
  const webhookId = url.searchParams.get("webhookId")?.trim() ?? undefined
  const statusParam = url.searchParams.get("status")?.trim().toLowerCase()
  const status: "delivered" | "failed" | undefined =
    statusParam === "delivered" || statusParam === "failed"
      ? (statusParam as "delivered" | "failed")
      : undefined
  const eventParam = url.searchParams.get("event")?.trim()
  const eventTopic =
    eventParam && VALID_TOPICS.includes(eventParam as AuthWebhookEventTopic)
      ? (eventParam as AuthWebhookEventTopic)
      : undefined
  const pageNum = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  )
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50),
  )
  const skip = (pageNum - 1) * pageSize

  const opts = { webhookId, status, eventTopic }
  const [items, total] = await Promise.all([
    authProjectWebhookDeliveryModel.listByProject(ctx.project.id, {
      ...opts,
      limit: pageSize,
      skip,
    }),
    authProjectWebhookDeliveryModel.countByProject(ctx.project.id, opts),
  ])
  return jsonSuccess({
    items,
    pagination: {
      page: pageNum,
      pageSize,
      total,
      hasMore: skip + items.length < total,
    },
  })
}

// ─── Audit log dashboard ──────────────────────────────────────────────────

const AUDIT_DEFAULT_ACTIONS = [
  "auth-project.user.signup",
  "auth-project.user.login",
  "auth-project.user.password-reset",
  "auth-project.user.password-reset-requested",
  "auth-project.user.password-changed",
  "auth-project.user.email-changed",
  "auth-project.user.email-change-requested",
  "auth-project.user.account-locked",
  "auth-project.user.account-deleted",
  "auth-project.user.account-delete-requested",
  "auth-project.user.signup-collision",
  "auth-project.user.session-revoked",
  "auth-project.rotate-api-key",
  "auth-project.rotate-jwt-key",
  "auth-project.webhook.create",
  "auth-project.webhook.update",
  "auth-project.webhook.delete",
  "auth-project.webhook.rotate-secret",
]

export async function auditListGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error

  const url = new URL(request.url)
  const limit = Math.min(
    500,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100),
  )
  const actionFilter = url.searchParams.get("action")?.trim()
  const actions =
    actionFilter && AUDIT_DEFAULT_ACTIONS.includes(actionFilter)
      ? [actionFilter]
      : AUDIT_DEFAULT_ACTIONS

  const items = await auditLogModel.findByCompany(ctx.access.companyId, {
    limit,
    actionPrefix: "auth-project.",
  })
  // Sadece bu project'e bağlı kayıtları döner (details.projectId match veya
  // resourceId/details içinde slug)
  const filtered = items.filter((i) => {
    const d = i.details as
      | { projectId?: string; projectSlug?: string }
      | null
      | undefined
    if (d?.projectId === ctx.project.id) return true
    if (d?.projectSlug === ctx.project.slug) return true
    // User/session/webhook resource'larında projectId direkt yok ama resourceId
    // mevcut user/webhook id'ye işaret eder; bu durumda action prefix yeterli
    // değil — false positive var. Caller'lar audit'e details.projectSlug yazdı
    // (signup/login/rotate hepsi). Filter bunu match'ler.
    return false
  })
  return jsonSuccess(
    actions.length === 0 ? filtered : filtered.filter((i) => actions.includes(i.action)),
  )
}

// ─── Analytics ────────────────────────────────────────────────────────────

export async function analyticsGet(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error

  // Son 30 günde günlük signup + login sayısı (audit-log üzerinden).
  // Yeni günlük rollup koleksiyonu yapmak yerine on-demand aggregation —
  // küçük projeler için yeterli; v2'de pre-aggregated rollup eklenebilir.
  const now = new Date()
  const fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  fromDate.setUTCHours(0, 0, 0, 0)

  const items = await auditLogModel.findByCompany(ctx.access.companyId, {
    actionPrefix: "auth-project.user.",
    limit: 5000,
    sinceDate: fromDate,
  })
  const scoped = items.filter((i) => {
    const d = i.details as { projectSlug?: string; projectId?: string } | null
    return d?.projectSlug === ctx.project.slug || d?.projectId === ctx.project.id
  })

  const dayKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
  const signups = new Map<string, number>()
  const logins = new Map<string, number>()
  const lockouts = new Map<string, number>()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = dayKey(d)
    signups.set(key, 0)
    logins.set(key, 0)
    lockouts.set(key, 0)
  }
  for (const it of scoped) {
    const key = dayKey(new Date(it.createdAt))
    if (it.action === "auth-project.user.signup") {
      signups.set(key, (signups.get(key) ?? 0) + 1)
    } else if (it.action === "auth-project.user.login") {
      logins.set(key, (logins.get(key) ?? 0) + 1)
    } else if (it.action === "auth-project.user.account-locked") {
      lockouts.set(key, (lockouts.get(key) ?? 0) + 1)
    }
  }

  const totalUsers = await authProjectUserModel.countByProject(ctx.project.id)

  return jsonSuccess({
    totalUsers,
    quotaUsage: ctx.project.quotaUsage,
    series: {
      signups: Array.from(signups.entries()).map(([date, count]) => ({ date, count })),
      logins: Array.from(logins.entries()).map(([date, count]) => ({ date, count })),
      lockouts: Array.from(lockouts.entries()).map(([date, count]) => ({ date, count })),
    },
  })
}

// ─── CSV user import ──────────────────────────────────────────────────────

interface CsvImportRow {
  email: string
  password?: string
  displayName?: string
}

export async function usersImportPost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error

  let body: { csv?: string; rows?: CsvImportRow[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  let rows: CsvImportRow[]
  if (typeof body.csv === "string" && body.csv.trim().length > 0) {
    const parsed = parseCsv(body.csv)
    if (parsed.error) return jsonError(parsed.error)
    rows = parsed.rows
  } else if (Array.isArray(body.rows)) {
    rows = body.rows
  } else {
    return jsonError("either csv string or rows array required")
  }

  if (rows.length === 0) return jsonError("no rows to import")
  if (rows.length > 1000) {
    return jsonError("too many rows (max 1000 per request)")
  }

  // Plan limit check
  const existingCount = await authProjectUserModel.countByProject(ctx.project.id)
  if (existingCount + rows.length > ctx.project.maxMau) {
    return jsonError(
      `Import would exceed plan user cap (${existingCount}+${rows.length} > ${ctx.project.maxMau}). Upgrade plan.`,
      402,
    )
  }

  const { hashPassword } = await import(
    "@workspace/console/lib/auth-project-password"
  )

  let imported = 0
  let skipped = 0
  let invalid = 0
  const errors: Array<{ row: number; reason: string }> = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || typeof r.email !== "string" || !r.email.trim()) {
      invalid++
      errors.push({ row: i + 1, reason: "email required" })
      continue
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) {
      invalid++
      errors.push({ row: i + 1, reason: "invalid email" })
      continue
    }
    const existing = await authProjectUserModel.findByEmail(
      ctx.project.id,
      r.email,
    )
    if (existing) {
      skipped++
      continue
    }
    try {
      // CSV'den password gelmediyse 32-char random — kullanıcı sonra
      // password-reset request'le kendisi belirler. Hashed argon2id.
      const passwordPlain =
        typeof r.password === "string" && r.password.length >= 8
          ? r.password
          : `tmp_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
      await authProjectUserModel.create({
        authProjectId: ctx.project.id,
        email: r.email.trim(),
        passwordHash: hashPassword(passwordPlain),
        displayName:
          typeof r.displayName === "string" ? r.displayName.trim() : null,
        emailVerified: true,
        metadata: {},
      })
      imported++
    } catch (err) {
      invalid++
      errors.push({
        row: i + 1,
        reason:
          err instanceof Error ? err.message.slice(0, 200) : "create failed",
      })
    }
  }

  await audit({
    userId: ctx.access.session!.user.id,
    companyId: ctx.access.companyId,
    action: "auth-project.users.import",
    resource: "auth-project",
    resourceId: ctx.project.id,
    details: {
      projectSlug: ctx.project.slug,
      projectId: ctx.project.id,
      imported,
      skipped,
      invalid,
      totalRows: rows.length,
    },
  })

  return jsonSuccess({
    imported,
    skipped,
    invalid,
    totalRows: rows.length,
    errors,
  })
}

// ─── User invitation (admin) ──────────────────────────────────────────────

export async function userInvitePost(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error

  let body: {
    email?: string
    displayName?: string | null
    metadata?: Record<string, unknown>
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  if (typeof body.email !== "string" || !body.email.trim()) {
    return jsonError("email required")
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
    return jsonError("invalid email")
  }

  // Existing user? Davet edilemez.
  const existing = await authProjectUserModel.findByEmail(
    ctx.project.id,
    body.email,
  )
  if (existing) {
    return jsonError("user with this email already exists", 409)
  }

  const { token } = await authProjectTokenModel.create({
    authProjectId: ctx.project.id,
    userId: "invitation-pending",
    purpose: "invitation",
    payload: {
      email: body.email.trim(),
      displayName: body.displayName ?? null,
      metadata: body.metadata ?? {},
    },
  })

  const acceptUrl = `${process.env.NEXT_PUBLIC_AUTH_APP_URL?.replace(/\/$/, "") ?? "https://auth.sentroy.com"}/p/${ctx.project.slug}/invitation/accept?token=${encodeURIComponent(token)}`
  const { sendAuthProjectMail } = await import(
    "@workspace/auth/server/auth-project-mail-events"
  )
  await sendAuthProjectMail("auth-project.invitation", {
    to: body.email.trim(),
    locale: "en",
    brand: {
      projectId: ctx.project.id,
      projectName: ctx.project.branding.displayName || ctx.project.name,
      primaryColor: ctx.project.branding.primaryColor,
      logoUrl: ctx.project.branding.logoUrl,
    },
    variables: {
      userEmail: body.email.trim(),
      acceptUrl,
    },
  }).catch(() => undefined)

  await audit({
    userId: ctx.access.session!.user.id,
    companyId: ctx.access.companyId,
    action: "auth-project.user.invited",
    resource: "auth-project",
    resourceId: ctx.project.id,
    details: {
      projectSlug: ctx.project.slug,
      projectId: ctx.project.id,
      invitedEmail: body.email.trim(),
    },
  })

  return jsonSuccess({ ok: true })
}

// ─── Mail templates ───────────────────────────────────────────────────────

export async function mailTemplatesList(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error
  const { listAuthProjectMailEvents } = await import(
    "@workspace/auth/server/auth-project-mail-events"
  )
  const { authProjectMailTemplateModel } = await import(
    "@workspace/db/models"
  )
  const [events, overrides] = await Promise.all([
    Promise.resolve(listAuthProjectMailEvents()),
    authProjectMailTemplateModel.listByProject(ctx.project.id),
  ])
  const overrideByKey = new Map(overrides.map((o) => [o.eventKey, o]))
  return jsonSuccess(
    events.map((ev) => {
      const o = overrideByKey.get(ev.key)
      return {
        key: ev.key,
        category: ev.category,
        label: ev.label,
        description: ev.description,
        variables: ev.variables,
        defaultSubject: ev.defaultSubject,
        defaultHtmlBody: ev.defaultHtmlBody,
        override: o
          ? {
              subject: o.subject,
              htmlBody: o.htmlBody,
              enabled: o.enabled,
              updatedAt: o.updatedAt,
            }
          : null,
      }
    }),
  )
}

export async function mailTemplateUpsert(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ slug: string; id: string; eventKey: string }> },
) {
  const { slug, id, eventKey } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error
  const { getAuthProjectMailEvent } = await import(
    "@workspace/auth/server/auth-project-mail-events"
  )
  const def = getAuthProjectMailEvent(eventKey)
  if (!def) return jsonError("unknown event key", 404)

  let body: {
    subject?: { tr?: string; en?: string }
    htmlBody?: { tr?: string; en?: string }
    enabled?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const { authProjectMailTemplateModel } = await import(
    "@workspace/db/models"
  )
  const upserted = await authProjectMailTemplateModel.upsert({
    authProjectId: ctx.project.id,
    eventKey,
    subject: body.subject,
    htmlBody: body.htmlBody,
    enabled: body.enabled,
  })
  await audit({
    userId: ctx.access.session!.user.id,
    companyId: ctx.access.companyId,
    action: "auth-project.mail-template.upsert",
    resource: "auth-project-mail-template",
    resourceId: upserted.id,
    details: { projectId: ctx.project.id, eventKey },
  })
  return jsonSuccess(upserted)
}

export async function mailTemplateDelete(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ slug: string; id: string; eventKey: string }> },
) {
  const { slug, id, eventKey } = await params
  const ctx = await assertProject(request, slug, id)
  if ("error" in ctx) return ctx.error
  const { authProjectMailTemplateModel } = await import(
    "@workspace/db/models"
  )
  const ok = await authProjectMailTemplateModel.remove(ctx.project.id, eventKey)
  if (!ok) return jsonError("template not found", 404)
  await audit({
    userId: ctx.access.session!.user.id,
    companyId: ctx.access.companyId,
    action: "auth-project.mail-template.reset",
    resource: "auth-project-mail-template",
    resourceId: eventKey,
    details: { projectId: ctx.project.id, eventKey },
  })
  return jsonSuccess({ ok: true })
}

function parseCsv(csv: string): { rows: CsvImportRow[]; error?: string } {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
  if (lines.length === 0) return { rows: [], error: "empty csv" }
  const header = lines[0]!.toLowerCase().split(",").map((h) => h.trim())
  const idxEmail = header.indexOf("email")
  const idxPassword = header.indexOf("password")
  const idxDisplayName = header.indexOf("displayname")
  if (idxEmail < 0) {
    return { rows: [], error: "csv header must include `email`" }
  }
  const rows: CsvImportRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",").map((c) => c.trim())
    rows.push({
      email: cells[idxEmail] ?? "",
      password: idxPassword >= 0 ? cells[idxPassword] : undefined,
      displayName: idxDisplayName >= 0 ? cells[idxDisplayName] : undefined,
    })
  }
  return { rows }
}

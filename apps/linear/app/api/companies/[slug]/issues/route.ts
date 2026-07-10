import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { getLinearContext } from "@/lib/linear/context"
import { createIssue } from "@/lib/linear/issues"
import { resolveRequester, type PanelUser } from "@/lib/linear/mapping"
import { loadNewTaskForm } from "@/lib/new-task-loader"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { IssuePriority } from "@/lib/linear/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /issues — yeni-talep formu için metadata payload'u (NewTaskDialog
 * `fetcher.load("/tasks/new")` ile çeker; shim bunu bu endpoint'in GET'ine
 * eşler). linear.view yeter (yalnız okuma); asıl oluşturma POST + linear.edit.
 * jsonSuccess zarfı client'ta normalizeActionResult ile `{ok:true, ...}` açılır.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  try {
    const load = await loadNewTaskForm(ctx, access.companyId)
    if (!load.ok) return jsonError(load.errorKey, 422)
    const { ok: _ok, ...payload } = load
    return jsonSuccess(payload)
  } catch (err) {
    logger.error({
      source: "linear",
      route: "issues.form",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    if (err instanceof LinearError) return jsonError(err.message, 502)
    return jsonError("Failed to load the form", 502)
  }
}

/**
 * POST /issues — yeni talep oluştur (triage tasks.new action portu).
 * linear.edit. Form alanları: title, description, priority, teamId, stateId,
 * assigneeId, parentId, labelIds[] (multipart/form-data ya da urlencoded).
 *
 * Başarı cevabı jsonSuccess zarfıyla `{data: {issueId, identifier}}` döner —
 * client'taki normalizeActionResult bunu triage şekline (`{ok, issueId,
 * identifier}`) açar (bkz. components/tasks/action-result.ts).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.edit")
  if ("error" in access) return access.error

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  // Requester: session modunda oturum kullanıcısı; token modunda token'ı
  // oluşturan kullanıcı (callerUserId/callerEmail) proxy kimliği olur.
  const panelUser: PanelUser = access.session
    ? {
        id: access.session.user.id,
        email: access.session.user.email ?? null,
        name: access.session.user.name ?? null,
        image: access.session.user.image ?? null,
      }
    : {
        id: access.callerUserId,
        email: access.callerEmail ?? null,
        name: null,
        image: null,
      }

  const form = await request.formData()

  const title = String(form.get("title") ?? "").trim()
  const description = String(form.get("description") ?? "").trim()
  const priorityRaw = Number(form.get("priority") ?? 0)
  const priority = (
    Number.isFinite(priorityRaw) && priorityRaw >= 0 && priorityRaw <= 4
      ? priorityRaw
      : 0
  ) as IssuePriority
  const teamId = String(form.get("teamId") ?? "").trim() || undefined
  const stateId = String(form.get("stateId") ?? "").trim() || undefined
  const assigneeId = String(form.get("assigneeId") ?? "").trim() || undefined
  const parentId = String(form.get("parentId") ?? "").trim() || undefined
  const labelIds = form
    .getAll("labelIds")
    .map((v) => String(v).trim())
    .filter(Boolean)

  if (!title || title.length < 3) {
    return jsonError("Title must be at least 3 characters", 400)
  }

  try {
    const requester = await resolveRequester(ctx, panelUser)
    const issue = await createIssue(ctx, {
      requester,
      title,
      description,
      priority,
      teamId,
      stateId,
      assigneeId,
      labelIds,
      parentId,
    })

    await audit({
      userId: access.callerUserId,
      companyId: access.companyId,
      action: "linear.issue.create",
      resource: "linear-issue",
      resourceId: issue.id,
      details: { identifier: issue.identifier, title },
      request,
    })

    return jsonSuccess(
      { issueId: issue.id, identifier: issue.identifier },
      201,
    )
  } catch (err) {
    logger.error({
      source: "linear",
      route: "issues.create",
      companyId: access.companyId,
      message: (err as Error).message,
    })
    if (err instanceof LinearError) {
      return jsonError(err.message, 502)
    }
    return jsonError("Failed to create the request", 502)
  }
}

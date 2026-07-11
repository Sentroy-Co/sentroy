export const dynamic = "force-dynamic"

/**
 * Panel toplu issue aksiyonları — triage home.tsx action'ının birebir portu.
 *
 * POST FormData intent switch: move | set-priority | set-labels |
 * set-assignee | archive | reorder | create-related.
 *
 * Auth: session VEYA Bearer stk_ (resolveCompanyAccess, permission
 * `linear.edit`). Linear bağlı değilse 412 "not_connected". Her mutasyon
 * audit'lenir (fail-bypass).
 */

import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import { getLinearContext } from "@/lib/linear/context"
import { resolveRequester } from "@/lib/linear/mapping"
import {
  archiveIssue,
  createRelatedIssue,
  updateIssue,
  updateIssueState,
  type RelatedKind,
} from "@/lib/linear/issues"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { IssuePriority } from "@/lib/linear/types"

export const runtime = "nodejs"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(req, slug, "linear.edit")
  if ("error" in access) return access.error

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  const form = await req.formData()
  const intent = String(form.get("intent") ?? "")
  const issueId = String(form.get("issueId") ?? "").trim()
  if (!issueId) return jsonError("Eksik parametre", 400)

  // Audit ortak alanları — action intent'e göre tamamlanır.
  const auditBase = {
    userId: access.callerUserId,
    companyId: access.companyId,
    resource: "linear-issue",
    request: req,
  }

  try {
    if (intent === "move") {
      const stateId = String(form.get("stateId") ?? "").trim()
      if (!stateId) return jsonError("Eksik parametre", 400)
      await updateIssueState(ctx, { issueId, stateId })
      await audit({
        ...auditBase,
        action: "linear.issue.move",
        resourceId: issueId,
        details: { stateId },
      })
      return jsonSuccess({})
    }
    if (intent === "set-priority") {
      const raw = Number(form.get("priority") ?? 0)
      const priority = (
        Number.isFinite(raw) && raw >= 0 && raw <= 4 ? raw : 0
      ) as IssuePriority
      await updateIssue(ctx, { issueId, patch: { priority } })
      await audit({
        ...auditBase,
        action: "linear.issue.set-priority",
        resourceId: issueId,
        details: { priority },
      })
      return jsonSuccess({})
    }
    if (intent === "set-labels") {
      const labelIds = form
        .getAll("labelIds")
        .map((v) => String(v).trim())
        .filter(Boolean)
      await updateIssue(ctx, { issueId, patch: { labelIds } })
      await audit({
        ...auditBase,
        action: "linear.issue.set-labels",
        resourceId: issueId,
        details: { labelIds },
      })
      return jsonSuccess({})
    }
    if (intent === "set-assignee") {
      const raw = String(form.get("assigneeId") ?? "").trim()
      await updateIssue(ctx, {
        issueId,
        patch: { assigneeId: raw === "" ? null : raw },
      })
      await audit({
        ...auditBase,
        action: "linear.issue.set-assignee",
        resourceId: issueId,
        details: { assigneeId: raw === "" ? null : raw },
      })
      return jsonSuccess({})
    }
    if (intent === "archive") {
      await archiveIssue(ctx, issueId)
      await audit({
        ...auditBase,
        action: "linear.issue.archive",
        resourceId: issueId,
      })
      return jsonSuccess({})
    }
    if (intent === "reorder") {
      const raw = Number(form.get("sortOrder"))
      if (!Number.isFinite(raw)) {
        return jsonError("Geçersiz sortOrder", 400)
      }
      await updateIssue(ctx, { issueId, patch: { sortOrder: raw } })
      await audit({
        ...auditBase,
        action: "linear.issue.reorder",
        resourceId: issueId,
        details: { sortOrder: raw },
      })
      return jsonSuccess({})
    }
    if (intent === "create-related") {
      const kind = String(form.get("kind") ?? "issue") as RelatedKind
      const title = String(form.get("title") ?? "").trim()
      const description = String(form.get("description") ?? "")
      const allowed: RelatedKind[] = [
        "issue",
        "sub",
        "parent",
        "blocking",
        "blocked",
        "related",
      ]
      if (!title || title.length < 3) {
        return jsonError("Başlık en az 3 karakter olmalı", 400)
      }
      if (!allowed.includes(kind)) {
        return jsonError("Geçersiz tür", 400)
      }
      // Requester = Sentroy session kullanıcısı (token modunda session yok;
      // callerUserId/callerEmail ile proxy kimliği kurulur).
      const sessionUser = access.session?.user
      const requester = await resolveRequester(ctx, {
        id: access.callerUserId,
        email: sessionUser?.email ?? access.callerEmail ?? null,
        name: sessionUser?.name ?? null,
        image: sessionUser?.image ?? null,
      })
      const newIssue = await createRelatedIssue(ctx, {
        requester,
        sourceIssueId: issueId,
        kind,
        title,
        description,
      })
      await audit({
        ...auditBase,
        action: "linear.issue.create-related",
        resourceId: newIssue.id,
        details: { sourceIssueId: issueId, kind, identifier: newIssue.identifier },
      })
      return jsonSuccess({
        issueId: newIssue.id,
        identifier: newIssue.identifier,
      })
    }
    return jsonError("Bilinmeyen işlem", 400)
  } catch (err) {
    logger.error({
      source: "linear",
      route: "issues/actions",
      companyId: access.companyId,
      intent,
      message: (err as Error).message,
    })
    if (err instanceof LinearError) return jsonError(err.message, 502)
    return jsonError("İşlem başarısız", 500)
  }
}

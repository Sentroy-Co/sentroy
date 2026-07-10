import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"

import { getLinearContext } from "@/lib/linear/context"
import { resolveRequester } from "@/lib/linear/mapping"
import {
  addAttachment,
  addComment,
  archiveIssue,
  createRelatedIssue,
  deleteComment,
  getIssue,
  updateComment,
  updateIssue,
  updateIssueState,
  uploadAttachmentFile,
  type RelatedKind,
} from "@/lib/linear/issues"
import { canViewIssue } from "@/lib/linear/access"
import { LinearError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import type { IssuePriority } from "@/lib/linear/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/companies/[slug]/issues/[id]/actions — tek issue üstündeki tüm
 * mutasyonlar (triage `tasks.$id` action'ının birebir portu). FormData ile
 * `intent` alanına göre dallanır:
 *   comment, attach (file|url), move, set-priority, set-labels, set-assignee,
 *   archive, edit-issue, edit-comment, delete-comment, create-related
 *
 * Permission: linear.edit (session veya Bearer stk_ token).
 * Linear bağlı değilse 412 "not_connected".
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.edit")
  if ("error" in access) return access.error

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  // Session modunda tam kullanıcı profili; token modunda yalnız
  // callerUserId/Email — resolveRequester her ikisiyle de çalışır
  // (e-posta Linear üyesiyle eşleşmezse proxy'ye düşer).
  const requester = await resolveRequester(ctx, {
    id: access.callerUserId,
    email: access.session?.user.email ?? access.callerEmail ?? null,
    name: access.session?.user.name ?? null,
    image: access.session?.user.image ?? null,
  })

  const form = await request.formData()
  const intent = String(form.get("intent") ?? "")

  // Görünürlük/varlık kontrolü — her intent için ortak (triage parity).
  const result = await getIssue(ctx, id).catch(() => null)
  if (!result) return jsonError("Issue not found", 404)
  if (!canViewIssue(result.issue, requester)) {
    return jsonError("Forbidden", 403)
  }

  const logIntentError = (err: unknown, extra?: Record<string, unknown>) => {
    logger.error({
      source: "linear",
      route: "issues.actions",
      companyId: ctx.companyId,
      issueId: id,
      intent,
      message: (err as Error).message,
      ...(extra ?? {}),
    })
  }

  const auditIntent = async (
    action: string,
    details?: Record<string, unknown>,
  ) => {
    await audit({
      userId: access.callerUserId,
      companyId: access.companyId,
      action,
      resource: "linear-issue",
      resourceId: id,
      details: { intent, ...(details ?? {}) },
      request,
    })
  }

  if (intent === "comment") {
    const body = String(form.get("body") ?? "").trim()
    const parentId = String(form.get("parentId") ?? "").trim() || undefined
    if (!body) return jsonError("Comment cannot be empty")
    try {
      const comment = await addComment(ctx, {
        issueId: id,
        requester,
        body,
        parentId,
      })
      await auditIntent("linear.comment", { commentId: comment.id })
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Comment could not be sent", 502)
    }
  }

  if (intent === "attach") {
    const title = String(form.get("title") ?? "").trim() || undefined
    const fileField = form.get("file")
    const file =
      fileField instanceof File && fileField.size > 0 ? fileField : null
    const url = String(form.get("url") ?? "").trim()

    try {
      if (file) {
        // uploadAttachmentFile içeride uploadToStorage (Sentroy CDN ya da
        // Linear signed upload) + attachmentCreate yapar.
        const attachment = await uploadAttachmentFile(ctx, {
          issueId: id,
          file,
          title,
        })
        await auditIntent("linear.attach", {
          kind: "file",
          attachmentId: attachment.id,
          fileName: file.name,
          fileSize: file.size,
        })
        return jsonSuccess({})
      }
      if (url) {
        if (!/^https?:\/\//i.test(url)) {
          return jsonError("Enter a valid URL")
        }
        const attachment = await addAttachment(ctx, { issueId: id, url, title })
        await auditIntent("linear.attach", {
          kind: "url",
          attachmentId: attachment.id,
        })
        return jsonSuccess({})
      }
      return jsonError("File or URL is required")
    } catch (err) {
      logIntentError(err, { cause: (err as { cause?: unknown }).cause })
      if (err instanceof LinearError) return jsonError(err.message, 502)
      return jsonError(
        (err as Error).message || "Attachment could not be added",
        502,
      )
    }
  }

  if (intent === "move") {
    const stateId = String(form.get("stateId") ?? "").trim()
    if (!stateId) return jsonError("Missing parameter")
    try {
      await updateIssueState(ctx, { issueId: id, stateId })
      await auditIntent("linear.move", { stateId })
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Status could not be updated", 502)
    }
  }

  if (intent === "set-priority") {
    const raw = Number(form.get("priority") ?? 0)
    const priority = (
      Number.isFinite(raw) && raw >= 0 && raw <= 4 ? raw : 0
    ) as IssuePriority
    try {
      await updateIssue(ctx, { issueId: id, patch: { priority } })
      await auditIntent("linear.set-priority", { priority })
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Priority could not be updated", 502)
    }
  }

  if (intent === "set-labels") {
    const labelIds = form
      .getAll("labelIds")
      .map((v) => String(v).trim())
      .filter(Boolean)
    try {
      await updateIssue(ctx, { issueId: id, patch: { labelIds } })
      await auditIntent("linear.set-labels", { labelIds })
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Labels could not be updated", 502)
    }
  }

  if (intent === "set-assignee") {
    const raw = String(form.get("assigneeId") ?? "").trim()
    const assigneeId = raw === "" ? null : raw
    try {
      await updateIssue(ctx, { issueId: id, patch: { assigneeId } })
      await auditIntent("linear.set-assignee", { assigneeId })
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Assignee could not be updated", 502)
    }
  }

  if (intent === "archive") {
    try {
      await archiveIssue(ctx, id)
      await auditIntent("linear.archive")
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Issue could not be archived", 502)
    }
  }

  if (intent === "edit-issue") {
    const title = String(form.get("title") ?? "").trim()
    const description = String(form.get("description") ?? "")
    if (!title || title.length < 3) {
      return jsonError("Title must be at least 3 characters")
    }
    try {
      await updateIssue(ctx, {
        issueId: id,
        patch: { title, description },
      })
      await auditIntent("linear.edit-issue")
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Issue could not be updated", 502)
    }
  }

  if (intent === "edit-comment") {
    const commentId = String(form.get("commentId") ?? "").trim()
    const body = String(form.get("body") ?? "").trim()
    if (!commentId) return jsonError("Comment not found")
    if (!body) return jsonError("Comment cannot be empty")
    try {
      await updateComment(ctx, { commentId, body })
      await auditIntent("linear.edit-comment", { commentId })
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Comment could not be updated", 502)
    }
  }

  if (intent === "delete-comment") {
    const commentId = String(form.get("commentId") ?? "").trim()
    if (!commentId) return jsonError("Comment not found")
    try {
      await deleteComment(ctx, commentId)
      await auditIntent("linear.delete-comment", { commentId })
      return jsonSuccess({})
    } catch (err) {
      logIntentError(err)
      return jsonError("Comment could not be deleted", 502)
    }
  }

  if (intent === "create-related") {
    const kind = String(form.get("kind") ?? "issue") as RelatedKind
    const title = String(form.get("title") ?? "").trim()
    const description = String(form.get("description") ?? "")
    if (!title || title.length < 3) {
      return jsonError("Title must be at least 3 characters")
    }
    const allowed: RelatedKind[] = [
      "issue",
      "sub",
      "parent",
      "blocking",
      "blocked",
      "related",
    ]
    if (!allowed.includes(kind)) {
      return jsonError("Invalid kind")
    }
    try {
      const newIssue = await createRelatedIssue(ctx, {
        requester,
        sourceIssueId: id,
        kind,
        title,
        description,
      })
      await auditIntent("linear.create-related", {
        kind,
        newIssueId: newIssue.id,
        identifier: newIssue.identifier,
      })
      return jsonSuccess({
        issueId: newIssue.id,
        identifier: newIssue.identifier,
      })
    } catch (err) {
      logIntentError(err)
      return jsonError("Related issue could not be created", 502)
    }
  }

  return jsonError("Unknown intent")
}

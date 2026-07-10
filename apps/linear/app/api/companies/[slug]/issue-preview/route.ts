import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getLinearContext } from "@/lib/linear/context"
import { getIssue } from "@/lib/linear/issues"
import { stripProxyHeader } from "@/lib/linear/access"
import { remapDescriptionImages } from "@/lib/image-assets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /issue-preview?id= — hover preview için hafif issue detayı (triage
 * api.issue-preview portu). linear.view. Tam title/state/priority/labels
 * + son 1 yorum + count'lar. listIssues'un getirdiği temel alanlar zaten
 * client'ta var; bu endpoint description preview + comment için ek atılır.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.view")
  if ("error" in access) return access.error

  const id = request.nextUrl.searchParams.get("id")?.trim()
  if (!id) return jsonError("id is required", 400)

  const ctx = await getLinearContext(access.companyId)
  if (!ctx) return jsonError("not_connected", 412)

  const result = await getIssue(ctx, id).catch(() => null)
  if (!result) return jsonError("Not found", 404)

  const { issue, comments, attachments, children } = result
  const cleanDescription = await remapDescriptionImages(
    access.companyId,
    stripProxyHeader(issue.description),
  )
  // Son yorumu al (varsa) — en yeni.
  const lastComment = comments[comments.length - 1] ?? null

  return jsonSuccess({
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      priority: issue.priority,
      state: issue.state,
      team: issue.team,
      creator: issue.creator,
      assignee: issue.assignee,
      labels: issue.labels,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    },
    descriptionPreview:
      cleanDescription.length > 240
        ? cleanDescription.slice(0, 240).trimEnd() + "…"
        : cleanDescription,
    lastComment: lastComment
      ? {
          id: lastComment.id,
          body:
            lastComment.body.length > 160
              ? lastComment.body.slice(0, 160).trimEnd() + "…"
              : lastComment.body,
          createdAt: lastComment.createdAt,
          user: lastComment.user,
        }
      : null,
    counts: {
      comments: comments.length,
      attachments: attachments.length,
      children: children.length,
    },
  })
}

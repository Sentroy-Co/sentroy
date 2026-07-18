export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { noteModel } from "@workspace/db/models"
import { audit } from "@workspace/console/lib/audit"

/** POST — çöp kutusundan geri yükle. Yalnız yazar veya owner/admin. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; noteId: string }> },
) {
  const { slug, noteId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const note = await noteModel.findById(noteId)
  if (!note || note.companyId !== access.companyId) {
    return jsonError("Note not found", 404)
  }
  const isAuthor = note.authorUserId === access.session.user.id
  const isOwnerOrAdmin =
    access.member?.role === "owner" || access.member?.role === "admin"
  if (!isAuthor && !isOwnerOrAdmin) {
    return jsonError("Cannot restore this note", 403)
  }

  const ok = await noteModel.restore(noteId)
  if (!ok) return jsonError("Note is not in the trash", 409)

  audit({
    request,
    userId: access.session.user.id,
    companyId: access.companyId,
    action: "note.restore",
    resource: "note",
    resourceId: noteId,
  })

  const restored = await noteModel.findById(noteId)
  return jsonSuccess({ note: restored })
}

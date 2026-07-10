import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { noteModel, noteWidgetPlacementModel } from "@workspace/db/models"
import type { Note, NoteColor, NoteVisibility } from "@workspace/db/types"
import { sanitizeHtml } from "@workspace/console/lib/sanitize-html"
import { audit } from "@workspace/console/lib/audit"
import {
  NOTE_COLORS,
  NOTE_VISIBILITIES,
  deriveNoteTitle,
  resolveFolderId,
  viewerIsCompanyAdmin,
} from "@/lib/notes/shared"

/** Notu görünürlük kuralına göre okuyabilir mi (yazar / members-public / admin). */
function canView(
  note: Note,
  viewerId: string,
  isAdmin: boolean,
): boolean {
  if (note.authorUserId === viewerId) return true
  if (note.visibility === "public" || note.visibility === "members") return true
  if (note.visibility === "admins") return isAdmin
  return false // "author" → yalnız yazar (yukarıda)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; noteId: string }> },
) {
  const { slug, noteId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const note = await noteModel.findById(noteId)
  if (!note || note.companyId !== access.companyId || note.deletedAt) {
    return jsonError("Note not found", 404)
  }
  const viewerId = access.session?.user.id ?? ""
  if (!canView(note, viewerId, viewerIsCompanyAdmin(access))) {
    return jsonError("Note not found", 404)
  }
  return jsonSuccess({ note })
}

interface UpdateBody {
  text?: string
  bodyHtml?: string | null
  mentions?: string[]
  visibility?: string
  color?: string
  folderId?: string | null
}

/** PATCH — yalnız yazar veya owner/admin düzenleyebilir. Autosave buraya gelir. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; noteId: string }> },
) {
  const { slug, noteId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const note = await noteModel.findById(noteId)
  if (!note || note.companyId !== access.companyId || note.deletedAt) {
    return jsonError("Note not found", 404)
  }
  const isAuthor = note.authorUserId === access.session.user.id
  const isOwnerOrAdmin =
    access.member?.role === "owner" || access.member?.role === "admin"
  if (!isAuthor && !isOwnerOrAdmin) {
    return jsonError("Cannot edit this note", 403)
  }

  let body: UpdateBody
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Partial<
    Pick<Note, "title" | "text" | "bodyHtml" | "mentions" | "visibility" | "color" | "folderId">
  > = {}

  if (body.text !== undefined) {
    const text = typeof body.text === "string" ? body.text.slice(0, 20000) : ""
    updates.text = text
    updates.title = deriveNoteTitle(text)
  }
  if (body.bodyHtml !== undefined) {
    updates.bodyHtml =
      typeof body.bodyHtml === "string" && body.bodyHtml.trim()
        ? sanitizeHtml(body.bodyHtml)
        : null
  }
  if (body.mentions !== undefined) {
    updates.mentions = Array.isArray(body.mentions)
      ? Array.from(
          new Set(
            body.mentions.filter((m): m is string => typeof m === "string"),
          ),
        ).slice(0, 50)
      : []
  }
  if (body.visibility !== undefined && NOTE_VISIBILITIES.includes(body.visibility as NoteVisibility)) {
    updates.visibility = body.visibility as NoteVisibility
  }
  if (body.color !== undefined && NOTE_COLORS.includes(body.color as NoteColor)) {
    updates.color = body.color as NoteColor
  }
  if (body.folderId !== undefined) {
    updates.folderId = await resolveFolderId(
      body.folderId,
      access.session.user.id,
      access.companyId,
    )
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No fields to update")
  }

  const updated = await noteModel.updateById(noteId, updates)
  if (!updated) return jsonError("Failed to update note", 500)

  audit({
    request,
    userId: access.session.user.id,
    companyId: access.companyId,
    action: "note.update",
    resource: "note",
    resourceId: noteId,
    details: { fields: Object.keys(updates) },
  })

  return jsonSuccess({ note: updated })
}

export async function DELETE(
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
    return jsonError("Cannot delete this note", 403)
  }

  const ok = await noteModel.softDelete(noteId)
  if (!ok) return jsonError("Already deleted", 409)
  // Not silindiğinde tüm kullanıcılardaki masaüstü widget yerleşimlerini temizle.
  await noteWidgetPlacementModel.removeAllForNote(noteId)

  audit({
    request,
    userId: access.session.user.id,
    companyId: access.companyId,
    action: "note.delete",
    resource: "note",
    resourceId: noteId,
  })

  return jsonSuccess({ deleted: true })
}

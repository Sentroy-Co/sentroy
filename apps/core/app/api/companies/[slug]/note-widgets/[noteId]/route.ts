export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { noteModel, noteWidgetPlacementModel } from "@workspace/db/models"
import { viewerIsCompanyAdmin } from "@/lib/notes/shared"

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback
  return Math.min(Math.max(v, min), max)
}

interface PlaceBody {
  x?: number
  y?: number
  w?: number
  h?: number
}

/**
 * PUT — notu masaüstüne pinle / konumunu güncelle (caller'a özel). Görebildiğin
 * bir notu pinleyebilirsin (visibility kontrolü). Idempotent upsert.
 */
export async function PUT(
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
  // Sadece görebildiğin notu pinleyebilirsin.
  const viewerId = access.session.user.id
  const isAdmin = viewerIsCompanyAdmin(access)
  const canView =
    note.authorUserId === viewerId ||
    note.visibility === "public" ||
    note.visibility === "members" ||
    (note.visibility === "admins" && isAdmin)
  if (!canView) return jsonError("Note not found", 404)

  let body: PlaceBody
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const placement = await noteWidgetPlacementModel.upsert(
    viewerId,
    access.companyId,
    noteId,
    {
      x: clamp(body.x, 0, 20000, 40),
      y: clamp(body.y, 0, 20000, 80),
      w: clamp(body.w, 160, 720, 280),
      h: clamp(body.h, 120, 720, 240),
    },
  )
  if (!placement) return jsonError("Failed to place widget", 500)
  return jsonSuccess({ placement })
}

/** DELETE — notu masaüstünden kaldır (unpin, caller'a özel). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; noteId: string }> },
) {
  const { slug, noteId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  await noteWidgetPlacementModel.remove(
    access.session.user.id,
    access.companyId,
    noteId,
  )
  return jsonSuccess({ unpinned: true })
}

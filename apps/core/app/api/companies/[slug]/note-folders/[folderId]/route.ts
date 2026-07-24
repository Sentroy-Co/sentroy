export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { noteFolderModel, noteModel } from "@workspace/db/models"

const FOLDER_COLORS = new Set(["default", "yellow", "blue", "green", "pink", "purple"])

/** Klasör caller'a ait mi? (per-user + company). */
async function ownFolder(
  folderId: string,
  userId: string,
  companyId: string,
) {
  const folder = await noteFolderModel.findById(folderId)
  if (!folder || folder.userId !== userId || folder.companyId !== companyId) {
    return null
  }
  return folder
}

/** PATCH — klasör adını ve/veya rengini değiştir. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; folderId: string }> },
) {
  const { slug, folderId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const folder = await ownFolder(folderId, access.session.user.id, access.companyId)
  if (!folder) return jsonError("Folder not found", 404)

  let body: { name?: string; color?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: { name?: string; color?: string } = {}
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : ""
    if (!name) return jsonError("Folder name is required")
    patch.name = name
  }
  if (body.color !== undefined) {
    patch.color =
      typeof body.color === "string" && FOLDER_COLORS.has(body.color) ? body.color : "default"
  }
  if (patch.name === undefined && patch.color === undefined) {
    return jsonError("Nothing to update")
  }

  const updated = await noteFolderModel.update(folderId, patch)
  return jsonSuccess({ folder: updated })
}

/** DELETE — klasörü sil; içindeki caller notları kategorisiz (null) olur. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; folderId: string }> },
) {
  const { slug, folderId } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const folder = await ownFolder(folderId, access.session.user.id, access.companyId)
  if (!folder) return jsonError("Folder not found", 404)

  await noteModel.clearFolder(folderId, access.session.user.id)
  await noteFolderModel.remove(folderId)
  return jsonSuccess({ deleted: true })
}

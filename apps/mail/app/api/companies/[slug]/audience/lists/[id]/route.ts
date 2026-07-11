export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { contactListModel } from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  try {
    const list = await contactListModel.findById(id)
    // IDOR guard: liste başka company'ye aitse 404 (varlığını da sızdırma).
    if (!list || list.companyId !== access.companyId) {
      return jsonError("List not found", 404)
    }
    return jsonSuccess(list)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get list"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  try {
    // IDOR guard: yalnız bu company'nin listesi silinebilir.
    const list = await contactListModel.findById(id)
    if (!list || list.companyId !== access.companyId) {
      return jsonError("List not found", 404)
    }
    const deleted = await contactListModel.deleteById(id)
    if (!deleted) {
      return jsonError("List not found", 404)
    }
    return jsonSuccess({ message: "List deleted" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete list"
    return jsonError(message, 500)
  }
}

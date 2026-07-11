export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { contactListModel, contactModel } from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  try {
    // IDOR guard: liste bu company'ye ait olmalı.
    const list = await contactListModel.findById(id)
    if (!list || list.companyId !== access.companyId) {
      return jsonError("List not found", 404)
    }
    const members = await contactListModel.getMembers(id)
    return jsonSuccess(members)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get members"
    return jsonError(message, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  let body: { contactId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (
    !body.contactId ||
    typeof body.contactId !== "string" ||
    !body.contactId.trim()
  ) {
    return jsonError("contactId is required")
  }

  try {
    // IDOR guard: hem liste hem kontak bu company'ye ait olmalı (başka
    // company'nin kontağını listene ekleyemezsin).
    const list = await contactListModel.findById(id)
    if (!list || list.companyId !== access.companyId) {
      return jsonError("List not found", 404)
    }
    const contact = await contactModel.findById(body.contactId.trim())
    if (!contact || contact.companyId !== access.companyId) {
      return jsonError("Contact not found", 404)
    }
    await contactListModel.addMember(id, body.contactId.trim())
    return jsonSuccess({ message: "Member added" }, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to add member"
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

  let body: { contactId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (
    !body.contactId ||
    typeof body.contactId !== "string" ||
    !body.contactId.trim()
  ) {
    return jsonError("contactId is required")
  }

  try {
    // IDOR guard: yalnız bu company'nin listesinden üye çıkarılabilir.
    const list = await contactListModel.findById(id)
    if (!list || list.companyId !== access.companyId) {
      return jsonError("List not found", 404)
    }
    await contactListModel.removeMember(id, body.contactId.trim())
    return jsonSuccess({ message: "Member removed" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to remove member"
    return jsonError(message, 500)
  }
}

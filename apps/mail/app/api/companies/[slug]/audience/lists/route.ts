export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { contactListModel } from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  try {
    const lists = await contactListModel.findByCompany(access.companyId)
    return jsonSuccess(lists)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list contact lists"
    return jsonError(message, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "audience.manage")
  if ("error" in access) return access.error

  let body: { name?: string; description?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("List name is required")
  }

  try {
    const list = await contactListModel.create({
      companyId: access.companyId,
      name: body.name.trim(),
      description: body.description?.trim(),
    })
    return jsonSuccess(list, 201)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create list"
    return jsonError(message, 500)
  }
}

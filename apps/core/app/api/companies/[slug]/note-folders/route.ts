export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import { noteFolderModel } from "@workspace/db/models"

/** GET — caller'ın bu şirketteki not klasörleri (per-user). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  const folders = await noteFolderModel.listForUser(
    access.companyId,
    access.session.user.id,
  )
  return jsonSuccess({ folders })
}

/** POST — klasör oluştur (per-user). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug)
  if ("error" in access) return access.error
  if (!access.session) return jsonError("Unauthorized", 401)

  let body: { name?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : ""
  if (!name) return jsonError("Folder name is required")

  const folder = await noteFolderModel.create({
    companyId: access.companyId,
    userId: access.session.user.id,
    name,
  })
  return jsonSuccess({ folder })
}

export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  envProjectModel,
  envTokenModel,
  envAuditLogModel,
} from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await envProjectModel.findById(id)
  if (!project || project.companyId !== auth.companyId) {
    return jsonError("project not found", 404)
  }
  const tokens = await envTokenModel.findByProject(id)
  const safe = tokens.map(({ tokenHash: _drop, ...rest }) => rest)
  return jsonSuccess(safe)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  let body: {
    name?: string
    environment?: string
    permissions?: ("read" | "write")[]
    expiresAt?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const name = (body.name ?? "").trim()
  const environment = (body.environment ?? "").trim()
  if (!name) return jsonError("name required")
  if (!environment) return jsonError("environment required")

  const project = await envProjectModel.findById(id)
  if (!project || project.companyId !== auth.companyId) {
    return jsonError("project not found", 404)
  }

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return jsonError("expiresAt must be a valid ISO date")
  }

  const { token, plainToken } = await envTokenModel.create({
    projectId: id,
    environment,
    name,
    permissions: body.permissions ?? ["read"],
    expiresAt,
    createdBy: auth.session!.user.id,
  })

  await envAuditLogModel.log({
    action: "token.create",
    projectId: id,
    environment,
    actorId: auth.session!.user.id,
    actorEmail: auth.session!.user.email ?? null,
    meta: { tokenId: token.id, name: token.name, expiresAt: token.expiresAt },
  })

  const { tokenHash: _drop, ...safe } = token
  return jsonSuccess({ ...safe, plainToken }, 201)
}

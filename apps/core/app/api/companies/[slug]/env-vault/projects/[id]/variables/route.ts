export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  envProjectModel,
  envVariableModel,
  envAuditLogModel,
} from "@workspace/db/models"
import {
  encryptValue,
  decryptValue,
  checksumValue,
} from "@workspace/console/lib/env-vault-crypto"
import { fireVariableChange } from "@workspace/console/lib/env-vault-webhook"

/**
 * Per-company variables — admin endpoint'inin kopyası, ama projeyi
 * önce companyId-scope ile doğrular (cross-company id sızdırmasın).
 */

async function loadOwnedProject(projectId: string, companyId: string) {
  const project = await envProjectModel.findById(projectId)
  if (!project || project.companyId !== companyId) return null
  return project
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error
  const project = await loadOwnedProject(id, auth.companyId!)
  if (!project) return jsonError("project not found", 404)

  const environment =
    request.nextUrl.searchParams.get("environment") || project.defaultEnvironment

  const vars = await envVariableModel.findByProjectAndEnv(id, environment)
  const decrypted = vars.map((v) => {
    let value: string | null
    try {
      value = decryptValue(v.valueCipher)
    } catch {
      value = null
    }
    const { valueCipher: _drop, ...rest } = v
    return { ...rest, value, decryptError: value === null }
  })
  return jsonSuccess(decrypted)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error
  const project = await loadOwnedProject(id, auth.companyId!)
  if (!project) return jsonError("project not found", 404)

  let body: {
    environment?: string
    key?: string
    value?: string
    type?: "string" | "number" | "boolean" | "json" | "url"
    public?: boolean
    description?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const environment =
    (body.environment ?? project.defaultEnvironment).trim()
  const key = (body.key ?? "").trim()
  const value = body.value ?? ""
  if (!key || !/^[A-Z][A-Z0-9_]*$/.test(key)) {
    return jsonError(
      "key required — uppercase + underscores only (e.g. 'DATABASE_URL')",
    )
  }
  if (typeof value !== "string") return jsonError("value must be a string")

  const existing = await envVariableModel.findOne(id, environment, key)
  let beforeChecksum: string | null = null
  if (existing) {
    try {
      beforeChecksum = checksumValue(decryptValue(existing.valueCipher))
    } catch {
      beforeChecksum = null
    }
  }

  const cipher = encryptValue(value)
  const variable = await envVariableModel.upsert({
    projectId: id,
    environment,
    key,
    valueCipher: cipher,
    type: body.type,
    public: body.public,
    description: body.description ?? null,
    updatedBy: auth.session!.user.id,
  })

  await envAuditLogModel.log({
    action: existing ? "variable.update" : "variable.create",
    projectId: id,
    environment,
    key,
    actorId: auth.session!.user.id,
    actorEmail: auth.session!.user.email ?? null,
    beforeChecksum,
    afterChecksum: checksumValue(value),
    meta: { public: variable.public, type: variable.type },
  })

  fireVariableChange(id, environment, {
    action: existing ? "update" : "create",
    keys: [key],
  })

  const { valueCipher: _drop, ...safe } = variable
  return jsonSuccess(safe, existing ? 200 : 201)
}

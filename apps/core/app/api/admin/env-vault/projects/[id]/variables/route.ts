import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
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
 * Bir project + environment'taki variable'lar.
 *
 *   GET    ?environment=prod       → liste (decrypted plaintext döner —
 *                                     admin UI'da edit panelinde gösterilir)
 *   POST                           → yeni variable upsert (key conflict =
 *                                     update). Body: { environment, key,
 *                                     value, public?, description? }
 *
 * `system-admin` only.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id } = await params
  const environment =
    request.nextUrl.searchParams.get("environment") || "prod"

  const project = await envProjectModel.findById(id)
  if (!project) return jsonError("project not found", 404)

  const vars = await envVariableModel.findByProjectAndEnv(id, environment)
  // Admin UI plaintext gösterir — decrypt edilir, ama hata durumunda
  // (örn. master key değişti, eski cipher decrypt edilemiyor) `null`
  // value ile dön; admin "rotate me" sinyalini görür.
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
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id } = await params

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

  const environment = (body.environment ?? "prod").trim()
  const key = (body.key ?? "").trim()
  const value = body.value ?? ""
  if (!key || !/^[A-Z][A-Z0-9_]*$/.test(key)) {
    return jsonError(
      "key required — uppercase + underscores only (e.g. 'DATABASE_URL')",
    )
  }
  if (typeof value !== "string") {
    return jsonError("value must be a string")
  }

  const project = await envProjectModel.findById(id)
  if (!project) return jsonError("project not found", 404)

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
    updatedBy: auth.session.user.id,
  })

  await envAuditLogModel.log({
    action: existing ? "variable.update" : "variable.create",
    projectId: id,
    environment,
    key,
    actorId: auth.session.user.id,
    actorEmail: auth.session.user.email ?? null,
    beforeChecksum,
    afterChecksum: checksumValue(value),
    meta: { public: variable.public, type: variable.type },
  })

  fireVariableChange(id, environment, {
    action: existing ? "update" : "create",
    keys: [key],
  })

  // Plaintext value cevapta echo edilmez — admin UI yeni GET ile alır.
  const { valueCipher: _drop, ...safe } = variable
  return jsonSuccess(safe, existing ? 200 : 201)
}

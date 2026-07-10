import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import {
  envVariableModel,
  envAuditLogModel,
} from "@workspace/db/models"
import {
  decryptValue,
  checksumValue,
} from "@workspace/console/lib/env-vault-crypto"
import { fireVariableChange } from "@workspace/console/lib/env-vault-webhook"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"

/**
 * Tek bir variable sil. Update için POST /variables endpoint'i (key
 * collision'da upsert eder) yeterli; ayrı PATCH route'u açmadık —
 * yeni `value`'la POST atılır, var olan kaydı günceller.
 */

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; varId: string }> },
) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error
  const { id, varId } = await params

  // Audit için silmeden önce key/env oku.
  const db = await getDb()
  let beforeChecksum: string | null = null
  let environment: string | null = null
  let key: string | null = null
  try {
    const doc = (await db.collection("env_variables").findOne({
      _id: new ObjectId(varId),
      projectId: id,
    })) as {
      environment?: string
      key?: string
      valueCipher?: string
    } | null
    if (doc) {
      environment = doc.environment ?? null
      key = doc.key ?? null
      if (doc.valueCipher) {
        try {
          beforeChecksum = checksumValue(decryptValue(doc.valueCipher))
        } catch {
          beforeChecksum = null
        }
      }
    }
  } catch {
    // varId ObjectId değilse — düşür ve 404 dön.
  }

  const ok = await envVariableModel.remove(varId)
  if (!ok) return jsonError("variable not found", 404)

  await envAuditLogModel.log({
    action: "variable.delete",
    projectId: id,
    environment,
    key,
    actorId: auth.session.user.id,
    actorEmail: auth.session.user.email ?? null,
    beforeChecksum,
    meta: {},
  })

  if (environment && key) {
    fireVariableChange(id, environment, { action: "delete", keys: [key] })
  }

  return jsonSuccess({ ok: true })
}

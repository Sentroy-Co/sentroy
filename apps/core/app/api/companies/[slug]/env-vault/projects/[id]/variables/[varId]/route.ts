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
  decryptValue,
  checksumValue,
} from "@workspace/console/lib/env-vault-crypto"
import { fireVariableChange } from "@workspace/console/lib/env-vault-webhook"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string; varId: string }> },
) {
  const { slug, id, varId } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const project = await envProjectModel.findById(id)
  if (!project || project.companyId !== auth.companyId) {
    return jsonError("project not found", 404)
  }

  const db = await getDb()
  let beforeChecksum: string | null = null
  let environment: string | null = null
  let key: string | null = null
  let found = false
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
      found = true
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

  // IDOR guard: değişken bu projeye ait değilse (scoped findOne null), sil ME.
  // envVariableModel.remove yalnız _id ile siler — projeye scope etmez.
  if (!found) return jsonError("variable not found", 404)

  const ok = await envVariableModel.remove(varId)
  if (!ok) return jsonError("variable not found", 404)

  await envAuditLogModel.log({
    action: "variable.delete",
    projectId: id,
    environment,
    key,
    actorId: auth.session!.user.id,
    actorEmail: auth.session!.user.email ?? null,
    beforeChecksum,
    meta: {},
  })

  if (environment && key) {
    fireVariableChange(id, environment, { action: "delete", keys: [key] })
  }

  return jsonSuccess({ ok: true })
}

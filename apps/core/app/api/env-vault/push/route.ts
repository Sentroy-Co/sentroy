import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  envTokenModel,
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
 * Token-auth bulk push — CLI'nin `sentroy env push` çağrısı bunu hits eder.
 * `Authorization: Bearer stk_env_<token>` zorunlu, token `write`
 * permission'ına sahip olmalı.
 *
 * Token scope'u (project + environment) belirleyici — body'den environment
 * gönderilemez; token hangi env için üretildiyse o env'e yazılır.
 *
 * Body:
 *   {
 *     entries: Array<{
 *       key: string,
 *       value: string,
 *       public?: boolean,
 *       description?: string | null,
 *       type?: "string"|"number"|"boolean"|"json"|"url"
 *     }>,
 *     deleteMissing?: boolean    // true → token scope'undaki entries'de
 *                                //   olmayan key'leri sil (full sync)
 *   }
 *
 * Returns:
 *   { added, updated, unchanged, deleted, total }
 *
 * Audit: her insert/update/delete için ayrı kayıt; checksum'lar yazılır,
 * plaintext value asla.
 */

export const dynamic = "force-dynamic"

const KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/
type VarType = "string" | "number" | "boolean" | "json" | "url"
const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
  "json",
  "url",
])

interface PushEntry {
  key: string
  value: string
  public?: boolean
  description?: string | null
  type?: VarType
}

interface PushBody {
  entries: PushEntry[]
  deleteMissing?: boolean
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || ""
  const match = authHeader.match(/^Bearer\s+(stk_env_[A-Za-z0-9]+)$/)
  if (!match) {
    return jsonError("missing or malformed Authorization Bearer token", 401)
  }
  const plainToken = match[1]

  const token = await envTokenModel.findByToken(plainToken)
  if (!token) return jsonError("invalid token", 401)
  if (token.expiresAt && token.expiresAt < new Date()) {
    return jsonError("token expired", 401)
  }
  if (!token.permissions.includes("write")) {
    return jsonError(
      "token does not have write permission — generate a new token with write enabled",
      403,
    )
  }

  let body: PushBody
  try {
    body = (await request.json()) as PushBody
  } catch {
    return jsonError("invalid JSON body", 400)
  }
  if (!body || !Array.isArray(body.entries)) {
    return jsonError("body must include `entries: Array<{key, value, ...}>`", 400)
  }

  // Pre-validate entries — fail fast before any write so we never end up
  // with a half-applied push.
  const entries: PushEntry[] = []
  const seen = new Set<string>()
  for (let i = 0; i < body.entries.length; i++) {
    const e = body.entries[i]
    if (!e || typeof e.key !== "string" || typeof e.value !== "string") {
      return jsonError(
        `entry ${i}: must have string \`key\` and string \`value\``,
        400,
      )
    }
    if (!KEY_PATTERN.test(e.key)) {
      return jsonError(
        `entry ${i}: key "${e.key}" must match [A-Z_][A-Z0-9_]*`,
        400,
      )
    }
    if (seen.has(e.key)) {
      return jsonError(`entry ${i}: duplicate key "${e.key}"`, 400)
    }
    seen.add(e.key)
    if (e.type !== undefined && !ALLOWED_TYPES.has(e.type)) {
      return jsonError(
        `entry ${i}: type "${e.type}" must be one of string|number|boolean|json|url`,
        400,
      )
    }
    entries.push({
      key: e.key,
      value: e.value,
      public: e.public === true,
      description:
        typeof e.description === "string" && e.description.trim() !== ""
          ? e.description
          : null,
      type: (e.type ?? "string") as VarType,
    })
  }

  const actorId = `token:${token.tokenPrefix}`
  const actorEmail = null
  const projectId = token.projectId
  const environment = token.environment

  // Snapshot mevcut env'i — diff hesaplamak ve deleteMissing için.
  const existing = await envVariableModel.findByProjectAndEnv(projectId, environment)
  const existingByKey = new Map(existing.map((v) => [v.key, v]))

  let added = 0
  let updated = 0
  let unchanged = 0
  const writtenKeys: string[] = []

  for (const e of entries) {
    const ex = existingByKey.get(e.key)
    let beforeChecksum: string | null = null
    let valueChanged = true
    let metadataChanged = true

    if (ex) {
      try {
        const exPlain = decryptValue(ex.valueCipher)
        beforeChecksum = checksumValue(exPlain)
        valueChanged = exPlain !== e.value
      } catch {
        // Mevcut kayıt decrypt edilemiyorsa (master key rotated etc.)
        // value'yu değişmiş kabul et — yeni master key'le re-encrypt yapalım.
        valueChanged = true
      }
      metadataChanged =
        (ex.public ?? false) !== (e.public ?? false) ||
        (ex.description ?? null) !== (e.description ?? null) ||
        ex.type !== (e.type ?? "string")
    }

    if (!ex) {
      // Yeni
      await envVariableModel.upsert({
        projectId,
        environment,
        key: e.key,
        valueCipher: encryptValue(e.value),
        type: e.type,
        public: e.public,
        description: e.description,
        updatedBy: actorId,
      })
      added++
      writtenKeys.push(e.key)
      const afterChecksum = checksumValue(e.value)
      await envAuditLogModel
        .log({
          action: "variable.create",
          projectId,
          environment,
          key: e.key,
          actorId,
          actorEmail,
          beforeChecksum: null,
          afterChecksum,
          meta: { source: "cli-push" },
        })
        .catch(() => {})
      continue
    }

    if (!valueChanged && !metadataChanged) {
      unchanged++
      continue
    }

    await envVariableModel.upsert({
      projectId,
      environment,
      key: e.key,
      valueCipher: encryptValue(e.value),
      type: e.type,
      public: e.public,
      description: e.description,
      updatedBy: actorId,
    })
    updated++
    writtenKeys.push(e.key)
    const afterChecksum = checksumValue(e.value)
    await envAuditLogModel
      .log({
        action: "variable.update",
        projectId,
        environment,
        key: e.key,
        actorId,
        actorEmail,
        beforeChecksum,
        afterChecksum,
        meta: { source: "cli-push" },
      })
      .catch(() => {})
  }

  let deleted = 0
  const deletedKeys: string[] = []
  if (body.deleteMissing) {
    const incoming = new Set(entries.map((e) => e.key))
    for (const v of existing) {
      if (!incoming.has(v.key)) {
        let beforeChecksum: string | null = null
        try {
          beforeChecksum = checksumValue(decryptValue(v.valueCipher))
        } catch {
          // ignore — silinecek zaten
        }
        const ok = await envVariableModel.remove(v.id)
        if (ok) {
          deleted++
          deletedKeys.push(v.key)
          await envAuditLogModel
            .log({
              action: "variable.delete",
              projectId,
              environment,
              key: v.key,
              actorId,
              actorEmail,
              beforeChecksum,
              afterChecksum: null,
              meta: { source: "cli-push" },
            })
            .catch(() => {})
        }
      }
    }
  }

  // Bulk push için tek webhook fire — tüm değişen key'leri tek payload'da
  // birleştir; her key için ayrı request atmak gereksiz overhead.
  if (writtenKeys.length > 0) {
    fireVariableChange(projectId, environment, {
      action: added > 0 && updated === 0 ? "create" : "update",
      keys: writtenKeys,
    })
  }
  if (deletedKeys.length > 0) {
    fireVariableChange(projectId, environment, {
      action: "delete",
      keys: deletedKeys,
    })
  }

  return jsonSuccess({
    project: projectId,
    environment,
    added,
    updated,
    unchanged,
    deleted,
    total: entries.length,
  })
}

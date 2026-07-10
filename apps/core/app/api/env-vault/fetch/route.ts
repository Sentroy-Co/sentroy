import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  envTokenModel,
  envVariableModel,
} from "@workspace/db/models"
import { decryptValue } from "@workspace/console/lib/env-vault-crypto"

/**
 * Token-auth env fetch — SDK'nın `getEnv()` çağrısı bunu hits eder.
 * `Authorization: Bearer stk_env_<token>` zorunlu.
 *
 * Token scope'u (project + environment) belirleyici — body/query'den
 * environment override gelmez; token hangi env için üretildiyse o
 * env'in tüm variable'larını döner (public + private).
 *
 * Cache header: `private, max-age=60` — SDK kendi cache'ini de tutar
 * (TTL 5 dk default), bu HTTP cache opportunistik. Auth header farklı
 * olduğu sürece response unique → public cache asla görmez.
 */

export const dynamic = "force-dynamic"

interface FetchedVariable {
  key: string
  value: string
  type: string
  public: boolean
}

export async function GET(request: NextRequest) {
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

  const vars = await envVariableModel.findByProjectAndEnv(
    token.projectId,
    token.environment,
  )

  const out: FetchedVariable[] = []
  let decryptFailures = 0
  for (const v of vars) {
    try {
      out.push({
        key: v.key,
        value: decryptValue(v.valueCipher),
        type: v.type,
        public: v.public,
      })
    } catch {
      decryptFailures++
    }
  }
  if (decryptFailures > 0) {
    console.warn(
      `[env-vault] ${decryptFailures} variables failed to decrypt for ` +
        `project=${token.projectId} env=${token.environment} — ` +
        "master key may have been rotated without re-encrypting.",
    )
  }

  const response = jsonSuccess({
    project: token.projectId,
    environment: token.environment,
    variables: out,
    decryptFailures,
  })
  // SDK için 60 sn cache hint; Authorization header response'a binding
  // sağlar (Vary).
  response.headers.set("Cache-Control", "private, max-age=60, must-revalidate")
  response.headers.set("Vary", "Authorization")
  return response
}

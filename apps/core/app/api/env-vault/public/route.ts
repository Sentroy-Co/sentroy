import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import {
  envTokenModel,
  envVariableModel,
} from "@workspace/db/models"
import { decryptValue } from "@workspace/console/lib/env-vault-crypto"

/**
 * Public-only env fetch — `useEnv()` React hook'u SSR sonrası bunu
 * client-side'da çağırabilir, browser tarafına yalnızca `public: true`
 * variable'lar sızar.
 *
 * Token-auth aynı şema (`stk_env_...`) — read-only yeterli; write
 * permission'lı token'lar da çağırabilir (read superset).
 *
 * **Önemli:** Server-only env'ler (DB URL, secret'lar) bu endpoint'ten
 * ASLA dönmez. `public: false` filter zorlanır. Cache 60 sn.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || ""
  const match = authHeader.match(/^Bearer\s+(stk_env_[A-Za-z0-9]+)$/)
  if (!match) {
    return jsonError("missing or malformed Authorization Bearer token", 401)
  }

  const token = await envTokenModel.findByToken(match[1])
  if (!token) return jsonError("invalid token", 401)
  if (token.expiresAt && token.expiresAt < new Date()) {
    return jsonError("token expired", 401)
  }

  const vars = await envVariableModel.findByProjectAndEnv(
    token.projectId,
    token.environment,
  )

  // public:true filter — tek satırda; private leak risk'ini katmanlı kapat.
  const publicVars = vars.filter((v) => v.public === true)

  const out: { key: string; value: string; type: string }[] = []
  for (const v of publicVars) {
    try {
      out.push({ key: v.key, value: decryptValue(v.valueCipher), type: v.type })
    } catch {
      // skip — admin "rotate me" sinyalini admin UI'da görür
    }
  }

  const response = jsonSuccess({
    project: token.projectId,
    environment: token.environment,
    variables: out,
  })
  response.headers.set("Cache-Control", "private, max-age=60, must-revalidate")
  response.headers.set("Vary", "Authorization")
  return response
}

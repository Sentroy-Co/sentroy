/**
 * Linear GraphQL client'ı (triage client.server.ts portu, ctx'li).
 * API key env yerine `ctx.apiKey`'den gelir (şirket başına workspace).
 */

import { request, type RetryPolicy } from "../request-manager"
import { LinearError } from "../errors"
import type { LinearContext } from "./context"

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"

/**
 * Okuma query'leri ve idempotent mutation'lar için varsayılan retry. Ağ/5xx/
 * 429 hatalarında üstel backoff ile 2 deneme daha. Linear'da kayıt YARATAN
 * (non-idempotent) mutation'larda kullanılMAMALI — ilk istek Linear'da
 * başarılı olup cevabı timeout'a düşerse retry duplicate kayıt oluşturur.
 */
const DEFAULT_RETRY: RetryPolicy = {
  attempts: 2,
  backoffMs: 400,
  retryOn: [429, 500, 502, 503, 504],
}

type GqlResponse<T> = {
  data?: T
  errors?: Array<{
    message: string
    extensions?: Record<string, unknown>
  }>
}

export type LinearGraphQLOptions = {
  /**
   * Retry politikası. Belirtilmezse DEFAULT_RETRY (idempotent okuma/güncelleme
   * için uygun). `false` → hiç retry yok; non-idempotent create mutation'larda
   * (issueCreate, commentCreate, attachmentCreate, issueRelationCreate,
   * issueLabelCreate) duplicate'i önlemek için bunu geçin.
   */
  retry?: RetryPolicy | false
}

export async function linearGraphQL<T>(
  ctx: LinearContext,
  query: string,
  variables?: Record<string, unknown>,
  options?: LinearGraphQLOptions,
): Promise<T> {
  const retry =
    options?.retry === false
      ? undefined
      : (options?.retry ?? DEFAULT_RETRY)

  const res = await request<GqlResponse<T>>(LINEAR_GRAPHQL_URL, {
    method: "POST",
    source: "linear",
    // Linear personal API key Authorization header'ına Bearer'sız/düz yazılır.
    auth: { kind: "api-key", header: "Authorization", value: ctx.apiKey },
    body: { query, variables },
    timeoutMs: 20_000,
    retry,
  })
  if (res.data.errors?.length) {
    throw new LinearError(res.data.errors.map((e) => e.message).join("; "), {
      status: 502,
    })
  }
  if (!res.data.data) {
    throw new LinearError("Linear returned empty data", { status: 502 })
  }
  return res.data.data
}

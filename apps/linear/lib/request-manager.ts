/**
 * Dış HTTP istek yöneticisi (triage request-manager.server.ts portu).
 * Timeout + üstel backoff'lu retry + Retry-After desteği + yapılandırılmış log.
 * Telegram bot API çağrıları da buradan geçer — URL'deki bot token'ı
 * redactTokenInUrl ile HER log satırında maskelenir (source: "telegram").
 */

import { RequestError } from "./errors"
import { logger } from "./logger"

export type Source = "linear" | "sentroy" | "internal" | "telegram"

export type AuthStrategy =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  | { kind: "api-key"; header: string; value: string }
  | { kind: "query-key"; param: string; value: string }

export type RetryPolicy = {
  attempts: number
  backoffMs: number
  retryOn?: number[]
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  headers?: Record<string, string>
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  auth?: AuthStrategy
  timeoutMs?: number
  retry?: RetryPolicy
  signal?: AbortSignal
  source: Source
  expect?: "json" | "text" | "raw"
  /**
   * URL'in loglanma biçimi. Varsayılan: bot/file token deseni (`/bot<id>:<secret>`)
   * her durumda maskelenir. "masked" açık talep (aynı davranış); `false` → url
   * alanı log'dan tamamen çıkarılır.
   */
  logUrl?: "masked" | false
}

export type ResponseEnvelope<T> = {
  data: T
  status: number
  headers: Headers
  requestId: string
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RETRY_STATUS = [429, 500, 502, 503, 504]

function buildUrl(url: string, query?: RequestOptions["query"]): string {
  if (!query) return url
  const u = new URL(url)
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue
    u.searchParams.set(k, String(v))
  }
  return u.toString()
}

/**
 * Log için URL'deki bot/file token'ını maskeler (`/bot<id>:<secret>` deseni).
 * Linear/Sentroy URL'lerinde geçmez; no-op ama zararsız. Secret hiçbir log
 * satırına düz yazılmaz.
 */
function redactTokenInUrl(url: string): string {
  return url.replace(/\/bot\d+:[A-Za-z0-9_-]+/g, "/bot***")
}

function applyAuth(
  url: string,
  headers: Headers,
  auth: AuthStrategy | undefined,
): string {
  if (!auth || auth.kind === "none") return url
  if (auth.kind === "bearer") {
    headers.set("Authorization", `Bearer ${auth.token}`)
    return url
  }
  if (auth.kind === "api-key") {
    headers.set(auth.header, auth.value)
    return url
  }
  if (auth.kind === "query-key") {
    const u = new URL(url)
    u.searchParams.set(auth.param, auth.value)
    return u.toString()
  }
  return url
}

function combineSignals(
  caller: AbortSignal | undefined,
  timer: AbortController,
): AbortSignal {
  if (!caller) return timer.signal
  if (caller.aborted) {
    timer.abort(caller.reason)
    return timer.signal
  }
  caller.addEventListener("abort", () => timer.abort(caller.reason), {
    once: true,
  })
  return timer.signal
}

async function safeBodyExcerpt(res: Response): Promise<string> {
  try {
    const text = await res.clone().text()
    return text.slice(0, 500)
  } catch {
    return ""
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

function shouldRetry(status: number, retry: RetryPolicy | undefined): boolean {
  if (!retry || retry.attempts <= 0) return false
  const codes = retry.retryOn ?? DEFAULT_RETRY_STATUS
  return codes.includes(status)
}

function retryAfterMs(res: Response, fallbackMs: number): number {
  const header = res.headers.get("Retry-After")
  if (!header) return fallbackMs
  const seconds = Number(header)
  if (!Number.isNaN(seconds)) return seconds * 1000
  const dateMs = Date.parse(header)
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now())
  return fallbackMs
}

export async function request<T = unknown>(
  url: string,
  opts: RequestOptions,
): Promise<ResponseEnvelope<T>> {
  const requestId = crypto.randomUUID()
  const method = opts.method ?? "GET"
  const headers = new Headers(opts.headers ?? {})

  let bodyInit: BodyInit | undefined
  if (opts.body !== undefined && opts.body !== null) {
    if (typeof opts.body === "string" || opts.body instanceof FormData) {
      bodyInit = opts.body as BodyInit
    } else {
      if (!headers.has("Content-Type"))
        headers.set("Content-Type", "application/json")
      bodyInit = JSON.stringify(opts.body)
    }
  }

  const composedUrl = applyAuth(buildUrl(url, opts.query), headers, opts.auth)
  // Log için token'ı maskele; logUrl:false ise url'i hiç loglama.
  const loggedUrl =
    opts.logUrl === false ? undefined : redactTokenInUrl(composedUrl)

  const retry = opts.retry
  const maxAttempts = (retry?.attempts ?? 0) + 1
  let attempt = 0
  let lastError: unknown

  while (attempt < maxAttempts) {
    attempt++
    const timer = new AbortController()
    const timeoutId = setTimeout(
      () => timer.abort(new Error("Request timeout")),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    const signal = combineSignals(opts.signal, timer)
    const start = performance.now()

    try {
      const res = await fetch(composedUrl, {
        method,
        headers,
        body: bodyInit,
        signal,
      })
      const durMs = Math.round(performance.now() - start)

      if (!res.ok) {
        const excerpt = await safeBodyExcerpt(res)
        logger.warn({
          source: opts.source,
          method,
          url: loggedUrl,
          status: res.status,
          durMs,
          requestId,
          attempt,
        })
        if (shouldRetry(res.status, retry) && attempt < maxAttempts) {
          const wait = retryAfterMs(
            res,
            retry!.backoffMs * Math.pow(2, attempt - 1),
          )
          await sleep(wait)
          continue
        }
        throw new RequestError({
          source: opts.source,
          status: res.status,
          bodyExcerpt: excerpt,
          requestId,
        })
      }

      logger.info({
        source: opts.source,
        method,
        url: loggedUrl,
        status: res.status,
        durMs,
        requestId,
      })

      const expect = opts.expect ?? "json"
      let data: unknown
      if (expect === "json") {
        data = res.status === 204 ? null : await res.json()
      } else if (expect === "text") {
        data = await res.text()
      } else {
        data = res
      }

      return {
        data: data as T,
        status: res.status,
        headers: res.headers,
        requestId,
      }
    } catch (err) {
      lastError = err
      const durMs = Math.round(performance.now() - start)
      const isAbort = (err as { name?: string })?.name === "AbortError"
      logger.error({
        source: opts.source,
        method,
        url: loggedUrl,
        status: 0,
        durMs,
        requestId,
        attempt,
        error: (err as Error).message,
        aborted: isAbort,
      })
      if (err instanceof RequestError) throw err
      if (isAbort && opts.signal?.aborted) throw err
      if (retry && attempt < maxAttempts) {
        await sleep(retry.backoffMs * Math.pow(2, attempt - 1))
        continue
      }
      throw new RequestError({
        source: opts.source,
        status: 0,
        bodyExcerpt: (err as Error).message ?? "Network error",
        requestId,
        cause: err,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw lastError ?? new Error("request: exhausted attempts")
}

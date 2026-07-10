import { createConnection } from "node:net"
import {
  statusProbeEventModel,
  statusHealthStateModel,
} from "@workspace/db/models"
import type { StatusCheck } from "@workspace/db/models/status-check"
import type { ProbeStatus } from "@workspace/db/models/status-probe-event"

/**
 * HTTP probe runner — bir check'i probe eder, sonucu DB'ye yazar,
 * health-state counter'ını günceller. Restart trigger karar
 * mantığı outer scheduler'da (main.ts).
 *
 * Probe akışı:
 *   1. AbortController + timeout
 *   2. fetch URL, latency ölç
 *   3. Status code expected range içinde mi?
 *   4. Body match (varsa) doğrula
 *   5. Latency degraded threshold'u aşıyor mu?
 *   6. status_probe_events.record (dedup 5dk)
 *   7. status_health_state recordFailure/recordSuccess
 *
 * TLS skip flag desteklenir (`insecureSkipTlsVerify`) ama production'da
 * Node global agent değiştirilemediği için per-request override yok.
 * Geçici workaround: `NODE_TLS_REJECT_UNAUTHORIZED=0` env, ama bu tüm
 * worker'ı etkiler. v1'de bu flag UI'da var ama backend ignore — user
 * dev için lokalde NODE_TLS_REJECT_UNAUTHORIZED set etmeli.
 */

export interface ProbeResult {
  status: ProbeStatus
  latencyMs: number | null
  httpStatus: number | null
  error: string | null
}

/**
 * TCP socket probe — host:port 3-way handshake. Latency = connect süresi.
 *
 * Success: connect başarılı.
 * Degraded: connect başarılı ama latency degradedLatencyMs üstü.
 * Down: ECONNREFUSED / timeout / DNS fail.
 */
async function probeTcpOnce(check: StatusCheck): Promise<ProbeResult> {
  if (!check.tcp) {
    return {
      status: "down",
      latencyMs: null,
      httpStatus: null,
      error: "tcp config missing",
    }
  }
  const { host, port, timeoutMs, degradedLatencyMs } = check.tcp
  const start = Date.now()
  return new Promise<ProbeResult>((resolve) => {
    const socket = createConnection({ host, port })
    let settled = false
    const finish = (result: ProbeResult) => {
      if (settled) return
      settled = true
      try {
        socket.destroy()
      } catch {
        // ignore
      }
      resolve(result)
    }
    const timer = setTimeout(() => {
      finish({
        status: "down",
        latencyMs: null,
        httpStatus: null,
        error: `Timeout after ${timeoutMs}ms`,
      })
    }, timeoutMs)
    socket.once("connect", () => {
      clearTimeout(timer)
      const latency = Date.now() - start
      if (latency > degradedLatencyMs) {
        finish({
          status: "degraded",
          latencyMs: latency,
          httpStatus: null,
          error: `Latency ${latency}ms exceeds degraded threshold ${degradedLatencyMs}ms`,
        })
      } else {
        finish({
          status: "operational",
          latencyMs: latency,
          httpStatus: null,
          error: null,
        })
      }
    })
    socket.once("error", (err: Error & { code?: string }) => {
      clearTimeout(timer)
      finish({
        status: "down",
        latencyMs: Date.now() - start,
        httpStatus: null,
        error: `${err.code ?? "ERR"}: ${err.message}`.slice(0, 200),
      })
    })
  })
}

/**
 * Tek bir HTTP probe attempt — retry/categorization yok.
 */
async function probeOnce(check: StatusCheck): Promise<ProbeResult> {
  const start = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), check.http.timeoutMs)

  try {
    const res = await fetch(check.http.url, {
      method: check.http.method,
      headers: check.http.headers ?? {},
      signal: controller.signal,
      // Cache disabled — every probe must hit origin
      cache: "no-store",
    })
    const latency = Date.now() - start

    const statusOk =
      res.status >= check.http.expectedStatusMin &&
      res.status <= check.http.expectedStatusMax
    if (!statusOk) {
      return {
        status: "down",
        latencyMs: latency,
        httpStatus: res.status,
        error: `HTTP ${res.status} not in [${check.http.expectedStatusMin}-${check.http.expectedStatusMax}]`,
      }
    }

    if (check.http.expectedBodyContains) {
      const text = await res.text().catch(() => "")
      if (!text.includes(check.http.expectedBodyContains)) {
        return {
          status: "down",
          latencyMs: latency,
          httpStatus: res.status,
          error: `Body did not contain expected substring`,
        }
      }
    }

    if (latency > check.http.degradedLatencyMs) {
      return {
        status: "degraded",
        latencyMs: latency,
        httpStatus: res.status,
        error: `Latency ${latency}ms exceeds degraded threshold ${check.http.degradedLatencyMs}ms`,
      }
    }

    return {
      status: "operational",
      latencyMs: latency,
      httpStatus: res.status,
      error: null,
    }
  } catch (err) {
    const latency = Date.now() - start
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")
    const message = isAbort
      ? `Timeout after ${check.http.timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : "Unknown probe error"
    return {
      status: "down",
      latencyMs: isAbort ? null : latency,
      httpStatus: null,
      error: message.slice(0, 200),
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Transient error sayılan failure tipleri — DNS hıçkırığı, connection
 * reset, timeout. Bu failure'lar için 1 retry yapılır (1.5s wait).
 *
 * HTTP 4xx/5xx + body-mismatch retry edilmez (deterministic — origin
 * server bilinçli yanıt verdi).
 */
function isTransientFailure(result: ProbeResult): boolean {
  if (result.status !== "down") return false
  if (result.httpStatus !== null) return false // server yanıt verdi, retry no-op
  if (!result.error) return false
  const e = result.error.toLowerCase()
  return (
    e.includes("timeout") ||
    e.includes("econnreset") ||
    e.includes("econnrefused") ||
    e.includes("etimedout") ||
    e.includes("eai_again") ||
    e.includes("enotfound") ||
    e.includes("fetch failed") ||
    e.includes("network")
  )
}

const RETRY_DELAY_MS = 1500

/**
 * Probe with 1-retry on transient failures (DNS hiccup, conn reset,
 * timeout). HTTP 4xx/5xx + body-mismatch deterministic kabul edilir,
 * retry edilmez.
 *
 * Type'a göre HTTP veya TCP probe dispatch.
 */
export async function probeCheck(check: StatusCheck): Promise<ProbeResult> {
  const attempt =
    check.type === "tcp"
      ? probeTcpOnce
      : probeOnce
  const first = await attempt(check)
  if (!isTransientFailure(first)) return first
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
  const second = await attempt(check)
  return second
}

/**
 * Probe sonucunu DB'ye yaz + health-state counter güncelle.
 * Returns updated health state — caller restart kararı için kullanır.
 */
const HEARTBEAT_INTERVAL_MS = 23 * 60 * 60 * 1000 // 23 saat — günde min 1 event

export async function recordProbeResult(
  check: StatusCheck,
  result: ProbeResult,
): Promise<{ recorded: boolean; consecutiveFailures: number }> {
  // 1. Probe event — dedup 5dk; status değişikliği VEYA 23s heartbeat
  // (her gün min 1 event garanti). Heartbeat olmadan sürekli operational
  // bir check günlerce hiç event yazmaz, public page'in 90-day chart'ı
  // boş kalır (forward-fill ile kapatılır ama daily aggregate eksik
  // kalır).
  const previousLatest = await statusProbeEventModel.findLatest(check.id)
  const statusChanged = previousLatest?.status !== result.status
  const sinceLastMs = previousLatest
    ? Date.now() - new Date(previousLatest.timestamp).getTime()
    : Number.POSITIVE_INFINITY
  const heartbeatDue = sinceLastMs >= HEARTBEAT_INTERVAL_MS
  await statusProbeEventModel.record({
    checkId: check.id,
    componentId: check.componentId,
    pageId: check.pageId,
    status: result.status,
    latencyMs: result.latencyMs,
    httpStatus: result.httpStatus,
    error: result.error,
    forceWrite: statusChanged || heartbeatDue,
  })

  // 2. Health state counter
  if (result.status === "down") {
    const state = await statusHealthStateModel.recordFailure(check.id)
    return { recorded: true, consecutiveFailures: state.consecutiveFailures }
  } else {
    await statusHealthStateModel.recordSuccess(check.id)
    return { recorded: true, consecutiveFailures: 0 }
  }
}

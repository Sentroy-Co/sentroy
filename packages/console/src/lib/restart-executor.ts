import { NodeSSH } from "node-ssh"
import type {
  HttpRestartConfig,
  SshRestartConfig,
  CoolifyRestartConfig,
} from "@workspace/db/models/status-restart-target"

/**
 * Paylaşılan restart executor — worker (apps/status-worker) sustained
 * failure'da, dashboard handler (status-restart-targets) manuel test
 * fire'da aynı kodu kullanır.
 *
 * decrypt callback'i caller'dan gelir — worker `./crypto`, handler
 * `@workspace/console/lib/env-vault-crypto`. İkisi de aynı AES-GCM
 * `v1:iv:tag:cipher` formatını okuyabilir.
 */

export type DecryptFn = (cipherText: string) => string

export interface ExecResult {
  success: boolean
  message: string
  /** HTTP target için response code (varsa). UI debug için. */
  httpStatus?: number | null
  /** Caller side time taken (ms). */
  latencyMs?: number
}

export async function executeHttpRestart(
  cfg: HttpRestartConfig,
  decrypt: DecryptFn,
): Promise<ExecResult> {
  const startedAt = Date.now()
  try {
    const headers: Record<string, string> = { ...(cfg.headers || {}) }
    if (cfg.authHeaderEncrypted && cfg.authHeaderName) {
      try {
        headers[cfg.authHeaderName] = decrypt(cfg.authHeaderEncrypted)
      } catch (err) {
        return {
          success: false,
          message: `auth header decrypt failed: ${err instanceof Error ? err.message : "unknown"}`,
          latencyMs: Date.now() - startedAt,
        }
      }
    }

    const init: RequestInit = {
      method: cfg.method,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(cfg.timeoutMs),
    }
    if (cfg.method === "POST" && cfg.bodyTemplate) {
      init.body = cfg.bodyTemplate
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json"
      }
    }

    const res = await fetch(cfg.url, init)
    const inRange =
      res.status >= cfg.expectedStatusMin && res.status <= cfg.expectedStatusMax
    return {
      success: inRange,
      message: inRange
        ? `HTTP ${res.status} OK`
        : `HTTP ${res.status} not in [${cfg.expectedStatusMin}-${cfg.expectedStatusMax}]`,
      httpStatus: res.status,
      latencyMs: Date.now() - startedAt,
    }
  } catch (err) {
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")
    return {
      success: false,
      message: isAbort
        ? `timeout after ${cfg.timeoutMs}ms`
        : err instanceof Error
          ? err.message.slice(0, 200)
          : "unknown error",
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
    }
  }
}

/**
 * SSH executor — encrypted private key + opsiyonel passphrase ile uzak
 * makineye bağlan, tek komut çalıştır. Exit 0 = success.
 */
export async function executeSshRestart(
  cfg: SshRestartConfig,
  decrypt: DecryptFn,
): Promise<ExecResult> {
  const startedAt = Date.now()
  let privateKey: string
  try {
    privateKey = decrypt(cfg.privateKeyEncrypted)
  } catch (err) {
    return {
      success: false,
      message: `private key decrypt failed: ${err instanceof Error ? err.message : "unknown"}`,
      latencyMs: Date.now() - startedAt,
    }
  }

  let passphrase: string | undefined
  if (cfg.passphraseEncrypted) {
    try {
      passphrase = decrypt(cfg.passphraseEncrypted)
    } catch (err) {
      return {
        success: false,
        message: `passphrase decrypt failed: ${err instanceof Error ? err.message : "unknown"}`,
        latencyMs: Date.now() - startedAt,
      }
    }
  }

  const ssh = new NodeSSH()
  const timeoutHandle = setTimeout(() => {
    ssh.dispose()
  }, cfg.timeoutMs)

  try {
    await ssh.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      privateKey,
      ...(passphrase ? { passphrase } : {}),
      readyTimeout: Math.min(cfg.timeoutMs, 30_000),
    })
    const result = await ssh.execCommand(cfg.command, {
      execOptions: { pty: false },
    })
    clearTimeout(timeoutHandle)
    ssh.dispose()

    const exitCode = result.code ?? -1
    const success = exitCode === 0
    const out = (result.stdout || result.stderr || "").trim().slice(0, 200)
    return {
      success,
      message: success
        ? `exit 0${out ? `: ${out}` : ""}`
        : `exit ${exitCode}: ${out || "no output"}`,
      latencyMs: Date.now() - startedAt,
    }
  } catch (err) {
    clearTimeout(timeoutHandle)
    try {
      ssh.dispose()
    } catch {
      // ignore double-dispose
    }
    return {
      success: false,
      message:
        err instanceof Error
          ? err.message.slice(0, 200)
          : "ssh connection failed",
      latencyMs: Date.now() - startedAt,
    }
  }
}

/**
 * Coolify built-in executor — GET /api/v1/deploy?uuid=...&force=true.
 * 2xx = success.
 */
export async function executeCoolifyRestart(
  cfg: CoolifyRestartConfig,
  decrypt: DecryptFn,
): Promise<ExecResult> {
  const startedAt = Date.now()
  let apiToken: string
  try {
    apiToken = decrypt(cfg.apiTokenEncrypted)
  } catch (err) {
    return {
      success: false,
      message: `api token decrypt failed: ${err instanceof Error ? err.message : "unknown"}`,
      latencyMs: Date.now() - startedAt,
    }
  }

  const baseUrl = cfg.baseUrl.replace(/\/+$/, "")
  const url = `${baseUrl}/api/v1/deploy?uuid=${encodeURIComponent(cfg.resourceUuid)}&force=true`

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(cfg.timeoutMs),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        success: false,
        message: `Coolify HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
        httpStatus: res.status,
        latencyMs: Date.now() - startedAt,
      }
    }
    const data = (await res.json().catch(() => ({}))) as {
      deployments?: Array<{ uuid?: string; message?: string }>
    }
    const first = data.deployments?.[0]
    return {
      success: true,
      message: first?.message
        ? `deploy queued (${first.message})`
        : `deploy queued${first?.uuid ? ` (${first.uuid.slice(0, 8)}…)` : ""}`,
      httpStatus: res.status,
      latencyMs: Date.now() - startedAt,
    }
  } catch (err) {
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")
    return {
      success: false,
      message: isAbort
        ? `timeout after ${cfg.timeoutMs}ms`
        : err instanceof Error
          ? err.message.slice(0, 200)
          : "coolify call failed",
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
    }
  }
}

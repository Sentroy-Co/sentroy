import {
  statusRestartTargetModel,
  statusHealthStateModel,
  auditLogModel,
} from "@workspace/db/models"
import type { StatusCheck } from "@workspace/db/models/status-check"
import {
  executeHttpRestart,
  executeSshRestart,
  executeCoolifyRestart,
} from "@workspace/console/lib/restart-executor"
import { decryptValue } from "./crypto"

/**
 * Restart trigger — sustained failure'da check'in restart target'ını
 * çalıştırır. v1: HTTP only. v2: SSH + Coolify built-in.
 *
 * Karar logic'i scheduler'da:
 *   - check.restartTargetId set olmalı
 *   - state.consecutiveFailures >= check.restartFailureThreshold
 *   - now - state.lastRestartAt >= check.restartCooldownSeconds
 *   - target.enabled = true
 *
 * Bu fonksiyon kararı verilmiş target'ı çağırır, sonucu DB'ye ve audit
 * log'a yazar. Restart sonrası counter sıfırlanmaz — sonraki başarılı
 * probe kendisi sıfırlar (operational dönerse).
 */

export interface RestartOutcome {
  triggered: boolean
  success: boolean
  message: string
  /** Throttled: cooldown veya disabled ise tetiklenmedi. */
  skipped?: "cooldown" | "disabled" | "no-target" | "unsupported-type"
}

export async function maybeTriggerRestart(
  check: StatusCheck,
  consecutiveFailures: number,
): Promise<RestartOutcome> {
  if (!check.restartTargetId) {
    return {
      triggered: false,
      success: false,
      message: "no restart target configured",
      skipped: "no-target",
    }
  }
  if (consecutiveFailures < check.restartFailureThreshold) {
    return {
      triggered: false,
      success: false,
      message: `below threshold (${consecutiveFailures}/${check.restartFailureThreshold})`,
    }
  }

  const target = await statusRestartTargetModel.findById(check.restartTargetId)
  if (!target || !target.enabled) {
    return {
      triggered: false,
      success: false,
      message: "target not found or disabled",
      skipped: "disabled",
    }
  }

  // Cooldown check
  const state = await statusHealthStateModel.findByCheck(check.id)
  const lastRestart = state?.lastRestartAt
  if (lastRestart) {
    const sinceMs = Date.now() - new Date(lastRestart).getTime()
    if (sinceMs < check.restartCooldownSeconds * 1000) {
      return {
        triggered: false,
        success: false,
        message: `cooldown (${Math.ceil((check.restartCooldownSeconds * 1000 - sinceMs) / 1000)}s remaining)`,
        skipped: "cooldown",
      }
    }
  }

  // Execute by type — paylaşılan executor (decrypt callback worker-local)
  let result: { success: boolean; message: string }
  switch (target.type) {
    case "http":
      result = target.http
        ? await executeHttpRestart(target.http, decryptValue)
        : { success: false, message: "http config missing" }
      break
    case "ssh":
      result = target.ssh
        ? await executeSshRestart(target.ssh, decryptValue)
        : { success: false, message: "ssh config missing" }
      break
    case "coolify":
      result = target.coolify
        ? await executeCoolifyRestart(target.coolify, decryptValue)
        : { success: false, message: "coolify config missing" }
      break
  }

  await statusRestartTargetModel.recordTrigger(target.id, result)
  await statusHealthStateModel.recordRestart(check.id)

  try {
    await auditLogModel.insert({
      userId: "system",
      companyId: "system",
      action: "status-page.restart.triggered",
      resource: "status-check",
      resourceId: check.id,
      details: {
        pageId: check.pageId,
        checkName: check.name,
        targetId: target.id,
        targetName: target.name,
        targetType: target.type,
        consecutiveFailures,
        success: result.success,
        message: result.message,
      },
    } as Parameters<typeof auditLogModel.insert>[0])
  } catch (err) {
    console.warn("[status-worker] audit log write failed:", err)
  }

  return {
    triggered: true,
    success: result.success,
    message: result.message,
  }
}


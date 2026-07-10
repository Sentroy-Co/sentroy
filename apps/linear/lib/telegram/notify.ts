/**
 * Linear webhook → Telegram durum bildirimi. Bottan açılan bir talebin
 * (linear_telegram_requests eşleşmesi) Linear durumu değiştiğinde ilgili
 * chat'e mesaj gönderir. Mesaj biçimi kaynaktaki durum satırı formatıdır
 * (STATE_EMOJI + identifier + durum adı + başlık — /taleplerim ile aynı).
 *
 * Spam koruması: request dokümanındaki `lastNotifiedState` ile durum-adı
 * dedup'u — yalnız durum GERÇEKTEN değiştiyse mesaj gider (Linear "Issue
 * update" event'i başlık/etiket değişiminde de tetiklenir).
 *
 * Fire-and-forget: webhook route'u bu fonksiyonu await etmeden çağırır;
 * hatalar loglanır, Linear'ın 200 alması engellenmez.
 */

import { getDb } from "@workspace/db/client"
import { getLinearSettings } from "../settings"
import { logger } from "../logger"
import { createTelegramApi } from "./api"
import { REQUESTS, resolveBotConfig } from "./store"
import { botText } from "./messages"
import type { IssueStateType } from "../linear/types"

// flow.ts'teki STATE_EMOJI ile aynı harita (kaynak formatı korunur).
const STATE_EMOJI: Record<string, string> = {
  triage: "🟠",
  backlog: "⚪",
  unstarted: "🔵",
  started: "🟡",
  completed: "🟢",
  canceled: "⚫",
} satisfies Record<IssueStateType, string>

type WebhookBody = {
  action?: string
  type?: string
  data?: Record<string, unknown> | null
}

export async function notifyTelegramOnIssueUpdate(
  companyId: string,
  body: WebhookBody,
): Promise<void> {
  if (body.type !== "Issue" || body.action !== "update") return
  const d = body.data ?? {}
  const issueId = typeof d.id === "string" ? d.id : null
  const state = d.state as { name?: unknown; type?: unknown } | undefined
  const stateName = typeof state?.name === "string" ? state.name : null
  const stateType = typeof state?.type === "string" ? state.type : null
  if (!issueId || !stateName) return

  const db = await getDb()
  const request = await db.collection(REQUESTS).findOne({
    companyId,
    issueId,
    status: "done",
  })
  // Eşleşme yok / chat_id KVKK maskesiyle silinmiş / durum değişmemiş → çık.
  if (!request || !request.chatId) return
  if (request.lastNotifiedState === stateName) return

  // Şirketin botu aktif değilse bildirim yok.
  const settings = await getLinearSettings(companyId)
  const config = resolveBotConfig(companyId, settings?.telegram)
  if (!config) return

  const api = createTelegramApi(config.botToken)
  const dot = (stateType && STATE_EMOJI[stateType]) || "•"
  const identifier =
    (request.issueIdentifier as string | null) ??
    botText(config.language, "untitled")
  const title = typeof d.title === "string" ? d.title : ""
  const message = [
    botText(config.language, "statusUpdated"),
    "",
    `${dot} ${identifier} · ${stateName}`,
    ...(title ? [`   ${title}`] : []),
  ].join("\n")

  await api.sendMessage(request.chatId as string, message)

  // Dedup işareti — bir sonraki aynı durum event'inde tekrar göndermeyelim.
  await db
    .collection(REQUESTS)
    .updateOne(
      { companyId, issueId, status: "done" },
      { $set: { lastNotifiedState: stateName } },
    )

  logger.info({
    source: "telegram",
    companyId,
    message: "durum bildirimi gönderildi",
    identifier,
    state: stateName,
  })
}

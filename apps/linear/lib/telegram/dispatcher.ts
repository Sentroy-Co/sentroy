/**
 * Gelen update yönlendirici (triage dispatcher.server.ts portu). Poller buraya
 * verir. Sorumluluk: (1) Mongo-tabanlı update_id dedup (unique index, atomik);
 * (2) operatör yetkisi (company-scoped zengin allowlist) + keşif (dinleme)
 * modu; (3) yalnız private chat; (4) rate-limit; (5) message vs callback
 * ayrımı → flow. Bir handler hatası diğer akışları bloke etmez.
 *
 * Keşif modu: allowlist DIŞI bir kullanıcıdan private mesaj gelirse ve
 * discovery penceresi aktifse yalnız KİMLİĞİ kaydedilir (KVKK: mesaj içeriği
 * ASLA yazılmaz) ve ilk kayıtta tek bilgilendirme mesajı gönderilir.
 * Discovery durumu DB'den taze okunur (runner config'i 60sn gecikmeli olabilir).
 */

import { logger } from "../logger"
import type { TgUpdate } from "./api"
import {
  findOperator,
  isPrivateChat,
  markUpdateProcessed,
  readDiscoveryActiveUntil,
  recordSeenUser,
  type BotRuntime,
} from "./store"
import { botText } from "./messages"
import { checkSubmitRate } from "./ratelimit"
import * as flow from "./flow"

export async function dispatch(
  bot: BotRuntime,
  update: TgUpdate,
): Promise<void> {
  // 1) Dedup (atomik unique-index insert) — handler'dan ÖNCE işaretle.
  if (!(await markUpdateProcessed(bot.companyId, update.update_id))) {
    return
  }

  const cb = update.callback_query
  const msg = update.message
  const edited = update.edited_message
  const from = cb?.from ?? msg?.from ?? edited?.from
  const chat = cb?.message?.chat ?? msg?.chat ?? edited?.chat
  if (!from || !chat) return

  const lang = bot.config.language

  // 2) Operatör yetkisi (numeric user_id allowlist — zengin şema).
  const op = findOperator(bot.config.operators, from.id)
  if (!op) {
    // Keşif modu: yalnız private MESAJ (callback değil) kimlik olarak kaydedilir.
    if (!cb && isPrivateChat(chat.type)) {
      const activeUntil = await readDiscoveryActiveUntil(bot.companyId).catch(
        () => null,
      )
      if (activeUntil && activeUntil.getTime() > Date.now()) {
        const firstTime = await recordSeenUser(bot.companyId, from).catch(
          () => false,
        )
        logger.info({
          source: "telegram",
          companyId: bot.companyId,
          message: "keşif modunda kimlik kaydedildi",
          tgUserId: `tg_${from.id}`,
        })
        // Tek bilgilendirme mesajı (yalnız ilk kayıtta — spam önlenir).
        if (firstTime) {
          await bot.api.sendMessage(chat.id, botText(lang, "discoveryAck"))
        }
        return
      }
    }
    logger.warn({
      source: "telegram",
      companyId: bot.companyId,
      message: "yetkisiz erişim denemesi",
      tgUserId: `tg_${from.id}`,
    })
    const text = botText(lang, "unauthorized")
    if (cb) await bot.api.answerCallbackQuery(cb.id, text)
    else await bot.api.sendMessage(chat.id, text)
    return
  }

  // 3) Yalnız private chat (grup/kanal reddedilir; grupta sessiz kal).
  if (!isPrivateChat(chat.type)) {
    if (cb) await bot.api.answerCallbackQuery(cb.id, botText(lang, "privateOnly"))
    return
  }

  // 4) Rate-limit / abuse (submit-rate, in-memory sliding-window).
  const rl = checkSubmitRate(bot.companyId, from.id)
  if (!rl.allowed) {
    logger.warn({
      source: "telegram",
      companyId: bot.companyId,
      message: "rate-limit aşımı",
      tgUserId: `tg_${from.id}`,
    })
    const text = botText(lang, "rateLimited", {
      seconds: rl.retryAfterSec ?? 60,
    })
    if (cb) await bot.api.answerCallbackQuery(cb.id, text)
    else await bot.api.sendMessage(chat.id, text)
    return
  }

  // 5) Yönlendir (hata izole — diğer akışları bloke etmesin).
  try {
    if (cb) {
      await flow.handleCallback(bot, cb, op)
    } else if (msg) {
      const text = (msg.text ?? "").trim()
      if (text.startsWith("/")) await flow.handleCommand(bot, msg, op)
      else await flow.handleMessage(bot, msg, op)
    } else if (edited) {
      // Düzenlenen mesaj — taslaktaki ilgili segmenti güncelle.
      await flow.handleEditedMessage(bot, edited, op)
    }
  } catch (e) {
    logger.error({
      source: "telegram",
      companyId: bot.companyId,
      message: "dispatch handler hata",
      updateId: update.update_id,
      error: (e as Error).message,
    })
    try {
      if (cb)
        await bot.api.answerCallbackQuery(cb.id, botText(lang, "genericErrorShort"))
      else if (msg || edited)
        await bot.api.sendMessage(chat.id, botText(lang, "genericError"))
    } catch {
      // bildirim de başarısızsa yut
    }
  }
}

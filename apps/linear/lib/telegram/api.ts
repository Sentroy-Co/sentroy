/**
 * Telegram Bot API istemcisi (triage api.server.ts portu, multi-tenant).
 *
 * Triage'da token module-level settings'ten geliyordu; Linear Lite'ta her
 * şirketin kendi botu var → `createTelegramApi(token)` factory'si token'a
 * bağlı bir istemci döner. Token URL path'inde gider; request-manager
 * `logUrl:"masked"` + redactTokenInUrl ile ASLA loglanmaz. Gönderimler
 * non-idempotent olduğundan retry VERİLMEZ (undefined) — duplicate önlenir.
 */

import { request } from "../request-manager"

const API_BASE = "https://api.telegram.org"

// --- Telegram tip alt kümesi (ihtiyacımız olan alanlar) ------------------
export type TgUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}
export type TgChat = {
  id: number
  type: "private" | "group" | "supergroup" | "channel"
}
export type TgPhotoSize = {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}
export type TgMessage = {
  message_id: number
  from?: TgUser
  chat: TgChat
  date: number
  text?: string
  caption?: string
  photo?: TgPhotoSize[]
  media_group_id?: string
}
export type TgCallbackQuery = {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}
export type TgUpdate = {
  update_id: number
  message?: TgMessage
  edited_message?: TgMessage
  callback_query?: TgCallbackQuery
}
export type InlineKeyboardButton = { text: string; callback_data: string }
export type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] }
export type SendOpts = {
  reply_markup?: InlineKeyboardMarkup
  parse_mode?: "Markdown" | "MarkdownV2" | "HTML"
  disable_web_page_preview?: boolean
}

type TgResponse<T> =
  | { ok: true; result: T }
  | {
      ok: false
      error_code?: number
      description?: string
      parameters?: { retry_after?: number }
    }

export type TelegramApi = ReturnType<typeof createTelegramApi>

/** Token'a bağlı Bot API istemcisi üretir (şirket başına bir instance). */
export function createTelegramApi(token: string) {
  /** Tek bir Bot API metodu çağrısı (token maskeli, retry yok). */
  async function tgCall<T>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const res = await request<TgResponse<T>>(
      `${API_BASE}/bot${token}/${method}`,
      {
        method: "POST",
        source: "telegram",
        body: params ?? {},
        timeoutMs: 35_000,
        logUrl: "masked",
        // retry VERİLMEZ (undefined) — non-idempotent; duplicate'i önler.
      },
    )
    const data = res.data
    if (!data.ok) {
      const err = new Error(
        `Telegram ${method}: ${data.description ?? data.error_code ?? "bilinmeyen hata"}`,
      ) as Error & { tgErrorCode?: number }
      err.tgErrorCode = data.error_code
      throw err
    }
    return data.result
  }

  return {
    getMe(): Promise<TgUser> {
      return tgCall<TgUser>("getMe")
    },

    sendMessage(
      chatId: number | string,
      text: string,
      opts?: SendOpts,
    ): Promise<TgMessage> {
      return tgCall<TgMessage>("sendMessage", { chat_id: chatId, text, ...opts })
    },

    editMessageText(
      chatId: number | string,
      messageId: number | string,
      text: string,
      opts?: SendOpts,
    ): Promise<TgMessage | boolean> {
      return tgCall<TgMessage | boolean>("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        ...opts,
      })
    },

    answerCallbackQuery(
      callbackQueryId: string,
      text?: string,
    ): Promise<boolean> {
      return tgCall<boolean>("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text,
      })
    },

    getFile(
      fileId: string,
    ): Promise<{ file_id: string; file_path?: string; file_size?: number }> {
      return tgCall("getFile", { file_id: fileId })
    },

    deleteWebhook(): Promise<boolean> {
      return tgCall<boolean>("deleteWebhook", { drop_pending_updates: false })
    },

    getUpdates(offset?: number, timeoutSec = 25): Promise<TgUpdate[]> {
      return tgCall<TgUpdate[]>("getUpdates", {
        offset,
        timeout: timeoutSec,
        allowed_updates: ["message", "edited_message", "callback_query"],
      })
    },

    /**
     * Dosya indir: getFile.file_path → …/file/bot<token>/<path>.
     * URL token içerir → auth:none + logUrl:"masked". Ham bayt + content-type.
     */
    async downloadFile(
      filePath: string,
    ): Promise<{ buffer: ArrayBuffer; contentType: string }> {
      const res = await request<Response>(
        `${API_BASE}/file/bot${token}/${filePath}`,
        {
          method: "GET",
          source: "telegram",
          auth: { kind: "none" },
          expect: "raw",
          timeoutMs: 30_000,
          logUrl: "masked",
        },
      )
      const response = res.data
      const buffer = await response.arrayBuffer()
      const contentType =
        response.headers.get("content-type") || "application/octet-stream"
      return { buffer, contentType }
    },
  }
}

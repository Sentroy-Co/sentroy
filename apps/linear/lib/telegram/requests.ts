/**
 * Telegram girdisi → Linear talebi eşlemesi (triage mapping.server.ts portu).
 * Proxy requester (appUserId='tg_<id>') aynen korunur; kategori→takım/etiket
 * çözümlemesi yerine kullanıcı akışta LINEAR TAKIMI seçer (mimari karar).
 * `linear_telegram_requests` idempotency (companyId+key unique index) ile
 * duplicate-create engellenir; createIssue ÇEKİRDEK imzası değişmez.
 * Fotoğraflar issue oluşturulduktan sonra attachment olarak bağlanır.
 */

import { getDb } from "@workspace/db/client"
import { createIssue, getIssueStates } from "../linear/issues"
import type { LinearContext } from "../linear/context"
import type { ResolvedRequester } from "../linear/mapping"
import type { IssuePriority } from "../linear/types"
import { REQUESTS, displayNameOf } from "./store"
import { botText, DEFAULT_BOT_LANG, type BotLang } from "./messages"
import { attachTelegramPhotos } from "./images"
import { recordSubmit } from "./ratelimit"
import { logger } from "../logger"
import type { TelegramApi, TgUser } from "./api"

/** Telegram göndereni → proxy requester (appUserId='tg_<id>'). */
export function buildRequester(from: TgUser): ResolvedRequester {
  return {
    kind: "proxy",
    displayName: displayNameOf(from),
    email: "",
    appUserId: `tg_${from.id}`,
    avatarUrl: null,
  }
}

/**
 * Serbest metindeki sahte atıf/blockquote enjeksiyonlarını etkisizleştirir
 * (kullanıcı '> App User: …' yazıp atıf taklidi yapamasın). Satır başındaki
 * `>` markdown'da `\>` ile literal'e çevrilir.
 */
function sanitize(text: string): string {
  return text.replace(
    /^(\s*)>(\s*(?:Submitted by|Submitted on behalf of|Submitted:|Source:|App User:))/gim,
    "$1\\>$2",
  )
}

type RequestDoc = {
  companyId: string
  idempotencyKey: string
  issueId: string | null
  issueIdentifier: string | null
  chatId: string | null
  tgUserId: string | null
  tgUsername: string | null
  tgDisplayName: string | null
  sourceMessageId: string | null
  teamId: string | null
  teamName: string | null
  priority: number | null
  photoCount: number
  status: "pending" | "done"
  /** Son bildirilen Linear durumu (webhook → chat bildirimi dedup'u). */
  lastNotifiedState: string | null
  createdAt: Date
}

async function col() {
  const db = await getDb()
  return db.collection<RequestDoc>(REQUESTS)
}

export type TelegramUserRequest = {
  issueId: string
  identifier: string | null
  teamName: string | null
  priority: number | null
  createdAt: Date
}

/** Bir operatörün bottan açtığı (tamamlanmış) talepleri — en yeni önce. */
export async function listUserRequests(
  companyId: string,
  tgUserId: string | number,
  limit = 10,
): Promise<TelegramUserRequest[]> {
  const c = await col()
  const rows = await c
    .find({
      companyId,
      tgUserId: String(tgUserId),
      status: "done",
      issueId: { $ne: null },
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  return rows.map((r) => ({
    issueId: r.issueId as string,
    identifier: r.issueIdentifier,
    teamName: r.teamName,
    priority: r.priority,
    createdAt: r.createdAt,
  }))
}

export type CreateTelegramIssueInput = {
  from: TgUser
  chatId: string | number
  sourceMessageId: number | string | null
  teamId: string
  teamName: string
  priority: IssuePriority
  title: string
  text: string
  photoFileIds: string[]
  idempotencyKey: string
  /** Talep gövdesindeki sabit metinlerin dili (bot dili). */
  lang?: BotLang
}

export type CreateTelegramIssueResult = {
  identifier: string
  issueId: string
  uploaded: number
  duplicate: boolean
}

export { getIssueStates }

export async function createTelegramIssue(
  ctx: LinearContext,
  api: TelegramApi,
  input: CreateTelegramIssueInput,
): Promise<CreateTelegramIssueResult> {
  const c = await col()

  // İdempotency: aynı anahtar tamamlandıysa mevcut talebi dön.
  const existing = await c.findOne({
    companyId: ctx.companyId,
    idempotencyKey: input.idempotencyKey,
  })
  if (existing?.issueIdentifier && existing.issueId) {
    return {
      identifier: existing.issueIdentifier,
      issueId: existing.issueId,
      uploaded: existing.photoCount,
      duplicate: true,
    }
  }

  // Pending kaydı önce yaz — unique index çakışması eşzamanlı submit'i engeller.
  if (!existing) {
    try {
      await c.insertOne({
        companyId: ctx.companyId,
        idempotencyKey: input.idempotencyKey,
        issueId: null,
        issueIdentifier: null,
        chatId: String(input.chatId),
        tgUserId: String(input.from.id),
        tgUsername: input.from.username ?? null,
        tgDisplayName: displayNameOf(input.from),
        sourceMessageId:
          input.sourceMessageId != null ? String(input.sourceMessageId) : null,
        teamId: input.teamId,
        teamName: input.teamName,
        priority: input.priority,
        photoCount: 0,
        status: "pending",
        lastNotifiedState: null,
        createdAt: new Date(),
      })
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        const again = await c.findOne({
          companyId: ctx.companyId,
          idempotencyKey: input.idempotencyKey,
        })
        if (again?.issueIdentifier && again.issueId) {
          return {
            identifier: again.issueIdentifier,
            issueId: again.issueId,
            uploaded: again.photoCount,
            duplicate: true,
          }
        }
        throw new Error("Bu talep şu anda işleniyor.")
      }
      throw err
    }
  }

  const requester = buildRequester(input.from)

  // Seçilen takım gövdeye bağlam olarak (triage'daki kategori yolu deseni).
  const lang = input.lang ?? DEFAULT_BOT_LANG
  const pathLine = input.teamName
    ? botText(lang, "bodyTeamLine", { team: input.teamName })
    : ""
  const body = [pathLine, sanitize(input.text).trim()].filter(Boolean).join("\n\n")

  const created = await createIssue(ctx, {
    requester,
    title: input.title,
    description: body || botText(lang, "bodyEmpty"),
    priority: input.priority,
    teamId: input.teamId,
    extraMetadata: {
      telegram: {
        chatId: String(input.chatId),
        userId: String(input.from.id),
        username: input.from.username ?? null,
        messageId: input.sourceMessageId,
        teamId: input.teamId,
        teamName: input.teamName,
        submittedVia: "telegram",
      },
    },
  })

  // Fotoğrafları attachment olarak bağla (kısmi başarı kabul — talep açıldı).
  let uploaded = 0
  if (input.photoFileIds.length > 0) {
    const res = await attachTelegramPhotos(
      ctx,
      api,
      created.id,
      input.photoFileIds,
    ).catch((e) => {
      logger.error({
        source: "telegram",
        message: "foto ekleri bağlanamadı",
        issueId: created.id,
        error: (e as Error).message,
      })
      return { uploaded: 0, failed: input.photoFileIds.length }
    })
    uploaded = res.uploaded
  }

  await c.updateOne(
    { companyId: ctx.companyId, idempotencyKey: input.idempotencyKey },
    {
      $set: {
        issueId: created.id,
        issueIdentifier: created.identifier,
        photoCount: uploaded,
        status: "done" as const,
      },
    },
  )
  // Rate-limit sayacı — kaynak semantiği (yalnız gerçekleşen create sayılır).
  recordSubmit(ctx.companyId, input.from.id)
  logger.info({
    source: "telegram",
    message: "talep oluşturuldu",
    companyId: ctx.companyId,
    identifier: created.identifier,
    tgUserId: `tg_${input.from.id}`,
  })

  return {
    identifier: created.identifier,
    issueId: created.id,
    uploaded,
    duplicate: false,
  }
}

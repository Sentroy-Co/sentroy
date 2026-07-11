export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { audit } from "@workspace/console/lib/audit"
import {
  checksumValue,
  encryptValue,
  isVaultConfigured,
} from "@workspace/console/lib/env-vault-crypto"
import { linearSettingsModel } from "@workspace/db/models"
import type {
  LinearSettings,
  LinearSettingsPatch,
  LinearTelegramOperator,
  LinearTelegramSettings,
} from "@workspace/db/models/linear-settings"
import { getLinearSettings, resolveUiFlags } from "@/lib/settings"
import { UI_FLAG_KEYS } from "@/lib/ui-flags"
import { linearGraphQL } from "@/lib/linear/client"
import { VIEWER_QUERY } from "@/lib/linear/queries"
import { linearWebhookEndpoint } from "@/lib/linear/webhooks"
import { createTelegramApi } from "@/lib/telegram/api"
import {
  OPERATOR_ID_RE,
  purgeSeenUsers,
  resolveOperators,
} from "@/lib/telegram/store"
import { normalizeBotLang } from "@/lib/telegram/messages"
import type { LinearContext } from "@/lib/linear/context"

/**
 * Şirketin Linear Lite bağlantı ayarları (linear.manage).
 *
 * GÜVENLİK: cipher/plaintext secret ASLA response'a yazılmaz — yalnız
 * prefix'ler (ilk 12 char) döner. Deseni bkz. apps/core polar route'u.
 */

type SettingsView = {
  connected: boolean
  apiKeyPrefix: string | null
  panelLabelName: string
  defaultTeamId: string | null
  defaultLabelName: string | null
  defaultStateName: string | null
  actorApp: boolean
  storageProvider: "linear" | "sentroy"
  sentroyApiKeyPrefix: string | null
  sentroyBucketId: string | null
  sentroyCompanySlug: string | null
  sentroyBaseUrl: string | null
  uiFlags: Record<string, boolean>
  webhookId: string | null
  lastWebhookAt: string | null
  webhookEndpoint: string
  vaultConfigured: boolean
  telegram: TelegramSettingsView
}

/** Telegram bot ayarlarının response görünümü — token ASLA plaintext dönmez. */
type TelegramSettingsView = {
  enabled: boolean
  /** Maskeli gösterim için son 4 karakter (••••1234); token kayıtlı değilse null. */
  botTokenLast4: string | null
  /** Zengin operatör listesi (legacy operatorIds otomatik map'lenmiş halde). */
  operators: LinearTelegramOperator[]
  defaultTeamId: string | null
  /** Bot dili — default "en". */
  language: "en" | "tr"
  /** Son başarılı poll zamanı (bağlantı sağlığı) — ISO string. */
  lastPolledAt: string | null
  /** Aktif keşif (dinleme) penceresinin bitişi — ISO string; aktif değilse null. */
  discoveryActiveUntil: string | null
}

function serializeTelegram(
  telegram: LinearTelegramSettings | null | undefined,
): TelegramSettingsView {
  const discoveryUntil = telegram?.discovery?.activeUntil
    ? new Date(telegram.discovery.activeUntil)
    : null
  return {
    enabled: telegram?.enabled ?? false,
    botTokenLast4: telegram?.botTokenLast4 ?? null,
    operators: resolveOperators(telegram),
    defaultTeamId: telegram?.defaultTeamId ?? null,
    language: normalizeBotLang(telegram?.language),
    lastPolledAt: telegram?.lastPolledAt
      ? new Date(telegram.lastPolledAt).toISOString()
      : null,
    discoveryActiveUntil:
      discoveryUntil && discoveryUntil.getTime() > Date.now()
        ? discoveryUntil.toISOString()
        : null,
  }
}

function serializeSettings(
  companyId: string,
  settings: LinearSettings | null,
): SettingsView {
  return {
    connected: Boolean(settings?.apiKeyCipher),
    apiKeyPrefix: settings?.apiKeyPrefix ?? null,
    panelLabelName: settings?.panelLabelName || "Linear Lite",
    defaultTeamId: settings?.defaultTeamId ?? null,
    defaultLabelName: settings?.defaultLabelName ?? null,
    defaultStateName: settings?.defaultStateName ?? null,
    actorApp: settings?.actorApp ?? false,
    storageProvider: settings?.storageProvider ?? "linear",
    sentroyApiKeyPrefix: settings?.sentroyApiKeyPrefix ?? null,
    sentroyBucketId: settings?.sentroyBucketId ?? null,
    sentroyCompanySlug: settings?.sentroyCompanySlug ?? null,
    sentroyBaseUrl: settings?.sentroyBaseUrl ?? null,
    uiFlags: resolveUiFlags(settings?.uiFlags),
    webhookId: settings?.webhookId ?? null,
    lastWebhookAt: settings?.lastWebhookAt
      ? new Date(settings.lastWebhookAt).toISOString()
      : null,
    webhookEndpoint: linearWebhookEndpoint(companyId),
    vaultConfigured: isVaultConfigured(),
    telegram: serializeTelegram(settings?.telegram),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.manage")
  if ("error" in access) return access.error

  const settings = await getLinearSettings(access.companyId)
  return jsonSuccess(serializeSettings(access.companyId, settings))
}

/** Boş string/null → null, dolu string → trim'li değer, diğer tipler → undefined (dokunma). */
function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
  }
  return undefined
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "linear.manage")
  if ("error" in access) return access.error

  // Master key olmadan secret şifrelenemez; ayar yazmayı komple kapatıyoruz
  // (UI aynı durumda banner gösterir). PLAN gereği 503.
  if (!isVaultConfigured()) {
    return jsonError(
      "SENTROY_ENV_MASTER_KEY is not configured — settings cannot be saved",
      503,
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return jsonError("Invalid JSON body")
  }

  const patch: LinearSettingsPatch = {}
  const changed: string[] = []
  // Audit'e plaintext yerine SHA-256 checksum yazılır — değer görünmez ama
  // "değişti mi" karşılaştırılabilir (env-vault deseni).
  const details: Record<string, unknown> = {}

  // --- Linear API key (write-only) ----------------------------------------
  if ("apiKey" in body) {
    const raw = body.apiKey
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      patch.apiKeyCipher = null
      patch.apiKeyPrefix = null
      changed.push("apiKey:cleared")
    } else if (typeof raw === "string") {
      const key = raw.trim()
      // Kaydetmeden önce viewer sorgusuyla doğrula — geçersiz key DB'ye girmesin.
      const probeCtx: LinearContext = {
        companyId: access.companyId,
        apiKey: key,
        panelLabelName: "Linear Lite",
        defaultTeamId: null,
        defaultLabelName: null,
        defaultStateName: null,
        actorApp: false,
      }
      try {
        await linearGraphQL<{ viewer: { id: string } }>(
          probeCtx,
          VIEWER_QUERY,
          undefined,
          { retry: false },
        )
      } catch {
        return jsonError(
          "Linear API key could not be verified — check the key and try again",
          400,
        )
      }
      patch.apiKeyCipher = encryptValue(key)
      patch.apiKeyPrefix = key.slice(0, 12)
      changed.push("apiKey")
      details.apiKeyChecksum = checksumValue(key)
    } else {
      return jsonError("apiKey must be a string or null")
    }
  }

  // --- Panel konfigürasyonu -------------------------------------------------
  if (typeof body.panelLabelName === "string" && body.panelLabelName.trim()) {
    patch.panelLabelName = body.panelLabelName.trim()
    changed.push("panelLabelName")
  }
  for (const key of [
    "defaultTeamId",
    "defaultLabelName",
    "defaultStateName",
  ] as const) {
    if (!(key in body)) continue
    const value = normalizeNullableString(body[key])
    if (value !== undefined) {
      patch[key] = value
      changed.push(key)
    }
  }
  if (typeof body.actorApp === "boolean") {
    patch.actorApp = body.actorApp
    changed.push("actorApp")
  }

  // --- Depolama sağlayıcısı --------------------------------------------------
  if (body.storageProvider === "linear" || body.storageProvider === "sentroy") {
    patch.storageProvider = body.storageProvider
    changed.push("storageProvider")
  }
  if ("sentroyApiKey" in body) {
    const raw = body.sentroyApiKey
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      patch.sentroyApiKeyCipher = null
      patch.sentroyApiKeyPrefix = null
      changed.push("sentroyApiKey:cleared")
    } else if (typeof raw === "string") {
      const key = raw.trim()
      patch.sentroyApiKeyCipher = encryptValue(key)
      patch.sentroyApiKeyPrefix = key.slice(0, 12)
      changed.push("sentroyApiKey")
      details.sentroyApiKeyChecksum = checksumValue(key)
    } else {
      return jsonError("sentroyApiKey must be a string or null")
    }
  }
  for (const key of [
    "sentroyBucketId",
    "sentroyCompanySlug",
    "sentroyBaseUrl",
  ] as const) {
    if (!(key in body)) continue
    const value = normalizeNullableString(body[key])
    if (value !== undefined) {
      patch[key] = value
      changed.push(key)
    }
  }

  // --- UI flag override'ları --------------------------------------------------
  if (body.uiFlags && typeof body.uiFlags === "object") {
    const incoming = body.uiFlags as Record<string, unknown>
    const sanitized: Record<string, boolean> = {}
    for (const key of UI_FLAG_KEYS) {
      if (typeof incoming[key] === "boolean") sanitized[key] = incoming[key]
    }
    patch.uiFlags = sanitized
    changed.push("uiFlags")
  }

  // --- Telegram bot ayarları ---------------------------------------------
  // Not: subdoc bütün olarak yazılır ($set telegram) — bu yüzden mevcut
  // dokümandaki runtime alanları (updateOffset/lastPolledAt) merge'e taşınır.
  // Poller'ın eşzamanlı offset yazımıyla ufak bir yarış kalır; offset gerilirse
  // dedup koleksiyonu replay'i no-op yapar (veri bütünlüğü bozulmaz).
  if (body.telegram && typeof body.telegram === "object") {
    const input = body.telegram as Record<string, unknown>
    const current = (await getLinearSettings(access.companyId))?.telegram ?? null
    const merged: LinearTelegramSettings = {
      enabled: current?.enabled ?? false,
      botTokenCipher: current?.botTokenCipher ?? null,
      botTokenLast4: current?.botTokenLast4 ?? null,
      operatorIds: current?.operatorIds ?? [],
      // Okurken legacy → zengin şema map'lenir; PUT her zaman zengin yazar.
      operators: resolveOperators(current),
      defaultTeamId: current?.defaultTeamId ?? null,
      language: normalizeBotLang(current?.language),
      updateOffset: current?.updateOffset ?? null,
      lastPolledAt: current?.lastPolledAt ?? null,
      discovery: current?.discovery ?? null,
    }
    const tgChanged: string[] = []

    // Bot token (write-only). Kaydetmeden önce getMe ile doğrula —
    // geçersiz token DB'ye girmesin (apiKey viewer-probe deseni).
    if ("botToken" in input) {
      const raw = input.botToken
      if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
        merged.botTokenCipher = null
        merged.botTokenLast4 = null
        tgChanged.push("botToken:cleared")
      } else if (typeof raw === "string") {
        const token = raw.trim()
        try {
          await createTelegramApi(token).getMe()
        } catch {
          return jsonError(
            "Telegram bot token could not be verified — check the token and try again",
            400,
          )
        }
        merged.botTokenCipher = encryptValue(token)
        merged.botTokenLast4 = token.slice(-4)
        tgChanged.push("botToken")
        details.telegramBotTokenChecksum = checksumValue(token)
      } else {
        return jsonError("telegram.botToken must be a string or null")
      }
    }

    if (typeof input.enabled === "boolean") {
      merged.enabled = input.enabled
      tgChanged.push("enabled")
    }

    // Zengin operatör listesi — yeni şema. tgUserId numeric zorunlu; yetki
    // boolean'ları verilmezse true (güvenli default: mevcut davranış).
    if (Array.isArray(input.operators)) {
      const sanitized: LinearTelegramOperator[] = []
      const seenIds = new Set<string>()
      for (const rawOp of input.operators) {
        if (!rawOp || typeof rawOp !== "object") {
          return jsonError("telegram.operators must be an array of objects", 400)
        }
        const o = rawOp as Record<string, unknown>
        const tgUserId = typeof o.tgUserId === "string" ? o.tgUserId.trim() : ""
        if (!OPERATOR_ID_RE.test(tgUserId)) {
          return jsonError(
            "telegram.operators[].tgUserId must be a numeric Telegram user id",
            400,
          )
        }
        if (seenIds.has(tgUserId)) continue // duplicate id — ilkini koru
        seenIds.add(tgUserId)
        sanitized.push({
          tgUserId,
          tgUsername:
            typeof o.tgUsername === "string" && o.tgUsername.trim()
              ? o.tgUsername.trim()
              : null,
          tgDisplayName:
            typeof o.tgDisplayName === "string" && o.tgDisplayName.trim()
              ? o.tgDisplayName.trim()
              : null,
          memberUserId:
            typeof o.memberUserId === "string" && o.memberUserId.trim()
              ? o.memberUserId.trim()
              : null,
          canCreate: typeof o.canCreate === "boolean" ? o.canCreate : true,
          canListAll: typeof o.canListAll === "boolean" ? o.canListAll : true,
          canCancel: typeof o.canCancel === "boolean" ? o.canCancel : true,
          // Takım erişimi: "all" | teamId | null. Alan HİÇ verilmemişse "all"
          // (eski API çağıranları kırılmasın); UI yeni eklenenlerde explicit
          // null gönderir ("erişim yok" başlangıcı).
          teamAccess:
            o.teamAccess === "all"
              ? ("all" as const)
              : typeof o.teamAccess === "string" && o.teamAccess.trim()
                ? o.teamAccess.trim()
                : o.teamAccess === null
                  ? null
                  : ("all" as const),
        })
      }
      merged.operators = sanitized
      // Legacy alan ayna olarak senkron tutulur (eski okuyucular tutarlı kalsın).
      merged.operatorIds = sanitized.map((o) => o.tgUserId)
      tgChanged.push("operators")
    }
    // LEGACY: düz operatorIds hâlâ kabul edilir (API geriye uyumu) — mevcut
    // operatörlerin yetkileri korunur, yeni id'ler default yetkilerle eklenir.
    else if (Array.isArray(input.operatorIds)) {
      const invalid = input.operatorIds.filter(
        (id) => typeof id !== "string" || !OPERATOR_ID_RE.test(id.trim()),
      )
      if (invalid.length > 0) {
        return jsonError(
          "telegram.operatorIds must be numeric Telegram user ids",
          400,
        )
      }
      const ids = [
        ...new Set((input.operatorIds as string[]).map((id) => id.trim())),
      ]
      const existing = new Map(merged.operators!.map((o) => [o.tgUserId, o]))
      merged.operators = ids.map(
        (tgUserId) =>
          existing.get(tgUserId) ?? {
            tgUserId,
            tgUsername: null,
            tgDisplayName: null,
            memberUserId: null,
            canCreate: true,
            canListAll: true,
            canCancel: true,
            // Legacy giriş yolu → "all" (geriye uyum; çalışan operatör kırılmaz).
            teamAccess: "all" as const,
          },
      )
      merged.operatorIds = ids
      tgChanged.push("operatorIds")
    }

    if ("defaultTeamId" in input) {
      const value = normalizeNullableString(input.defaultTeamId)
      if (value !== undefined) {
        merged.defaultTeamId = value
        tgChanged.push("defaultTeamId")
      }
    }

    // Bot dili — yalnız bilinen değerler ("en" | "tr").
    if (input.language === "en" || input.language === "tr") {
      merged.language = input.language
      tgChanged.push("language")
    }

    // Keşif (dinleme) modu: true → 5 dk pencere başlat; false → kapat +
    // görülen kimlikleri hemen temizle (KVKK — kısa saklama).
    if (typeof input.discovery === "boolean") {
      if (input.discovery) {
        merged.discovery = { activeUntil: new Date(Date.now() + 5 * 60_000) }
        tgChanged.push("discovery:start")
      } else {
        merged.discovery = null
        await purgeSeenUsers(access.companyId).catch(() => {})
        tgChanged.push("discovery:stop")
      }
    }

    // enabled=true için token şart — poller token'sız şirketi zaten atlar ama
    // kullanıcıya erken/net hata verelim.
    if (merged.enabled && !merged.botTokenCipher) {
      return jsonError(
        "A bot token is required before enabling the Telegram bot",
        400,
      )
    }

    if (tgChanged.length > 0) {
      patch.telegram = merged
      changed.push(...tgChanged.map((c) => `telegram.${c}`))
    }
  }

  if (changed.length === 0) {
    return jsonError("Nothing to update")
  }

  const updated = await linearSettingsModel.upsertByCompany(
    access.companyId,
    patch,
  )

  await audit({
    userId: access.callerUserId,
    companyId: access.companyId,
    action: "linear.settings.update",
    resource: "linear-settings",
    resourceId: updated.id,
    details: { changed, ...details },
    request,
  })

  return jsonSuccess(serializeSettings(access.companyId, updated))
}

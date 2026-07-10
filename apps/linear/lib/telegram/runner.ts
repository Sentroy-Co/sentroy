/**
 * Multi-tenant Telegram long-polling runner (triage poller.server.ts portu).
 * Next instrumentation'dan başlatılır (tek replica; ayrı worker YOK).
 *
 * globalThis singleton → process başına TEK runner (HMR/çift-import güvenli).
 * Runner 60 sn'de bir linear_settings koleksiyonunu tarar: telegram.enabled +
 * token'ı olan şirketler için poller başlat/durdur (Map<companyId, Poller>).
 * Kaynak getUpdates offset/long-poll deseni korunur ama offset ARTIK şirket
 * başına Mongo'da saklanır (linear_settings.telegram.updateOffset, dot-path).
 *
 * T18 invariant (triage): polling yalnız TEK-REPLICA güvenlidir — aynı token'la
 * iki getUpdates döngüsü Telegram 409'u üretir. apps/linear tek replica koşar;
 * yine de dev+prod aynı bota bakarsa 409 loglanıp backoff'a düşülür.
 */

import { getDb } from "@workspace/db/client"
import type { LinearTelegramSettings } from "@workspace/db/models/linear-settings"
import { logger } from "../logger"
import { createTelegramApi } from "./api"
import {
  bumpTelegramOffset,
  ensureTelegramIndexes,
  resolveBotConfig,
  touchTelegramPolledAt,
  type BotRuntime,
  type TelegramBotConfig,
} from "./store"
import { dispatch } from "./dispatcher"
import { maybeRunTelegramCleanup } from "./cleanup"

const SCAN_INTERVAL_MS = 60_000
const ERROR_BACKOFF_MS = 3_000
const CONFLICT_BACKOFF_MS = 30_000

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Tek şirketin long-poll döngüsü. stop() bir sonraki turda döngüyü bitirir. */
class CompanyPoller {
  private stopped = false
  /** Runner her taramada yerinde günceller (operatör listesi vb. canlı kalır). */
  readonly runtime: BotRuntime
  /** Token değişimini tespit için cipher parmak izi (runner karşılaştırır). */
  tokenFingerprint: string

  constructor(config: TelegramBotConfig, tokenFingerprint: string) {
    this.tokenFingerprint = tokenFingerprint
    this.runtime = {
      companyId: config.companyId,
      api: createTelegramApi(config.botToken),
      config,
    }
  }

  stop(): void {
    this.stopped = true
  }

  start(): void {
    void this.loop()
  }

  private async loop(): Promise<void> {
    const { companyId, api } = this.runtime
    logger.info({ source: "telegram", companyId, message: "poller başlatıldı" })
    // Polling, aktif webhook ile çakışır (getUpdates → 409). Polling'e geçerken
    // kayıtlı webhook'u otomatik temizle (idempotent, pending update'leri korur).
    await api.deleteWebhook().catch((e) => {
      logger.warn({
        source: "telegram",
        companyId,
        message: "polling öncesi webhook temizlenemedi",
        error: (e as Error).message,
      })
    })

    // Offset başlangıçta DB'den okunur; döngü boyunca bellek otoritedir,
    // her işlenen update sonrası DB'ye yazılır (restart devamlılığı).
    let offset = this.runtime.config.updateOffset

    for (;;) {
      if (this.stopped) {
        logger.info({
          source: "telegram",
          companyId,
          message: "poller durduruldu (enabled/token değişti)",
        })
        return
      }
      try {
        const updates = await api.getUpdates(
          offset != null ? offset + 1 : undefined,
          25,
        )
        if (updates.length === 0) {
          // Boş tur — yalnız sağlık zamanını işaretle (best-effort).
          await touchTelegramPolledAt(companyId).catch(() => {})
          continue
        }
        for (const u of updates) {
          try {
            await dispatch(this.runtime, u)
          } catch (e) {
            logger.error({
              source: "telegram",
              companyId,
              message: "poll dispatch hata",
              updateId: u.update_id,
              error: (e as Error).message,
            })
          }
          offset = u.update_id
          await bumpTelegramOffset(companyId, u.update_id).catch(() => {})
        }
      } catch (e) {
        const err = e as Error & { tgErrorCode?: number; status?: number }
        // 409 = aynı token'la başka bir getUpdates/webhook aktif — uzun backoff.
        const conflict =
          err.tgErrorCode === 409 || /409/.test(err.message ?? "")
        logger.error({
          source: "telegram",
          companyId,
          message: conflict
            ? "getUpdates 409 — başka bir poller/webhook aynı token'ı kullanıyor"
            : "getUpdates hata",
          error: err.message,
        })
        await sleep(conflict ? CONFLICT_BACKOFF_MS : ERROR_BACKOFF_MS)
      }
    }
  }
}

type RunnerState = {
  started: boolean
  pollers: Map<string, CompanyPoller>
  indexesEnsured: boolean
}

const g = globalThis as unknown as { __linearTgRunner?: RunnerState }

/** Idempotent: instrumentation register()'dan çağrılır; tek runner başlatır. */
export function ensureTelegramRunnerStarted(): void {
  if (!g.__linearTgRunner) {
    g.__linearTgRunner = { started: false, pollers: new Map(), indexesEnsured: false }
  }
  const state = g.__linearTgRunner
  if (state.started) return
  state.started = true
  logger.info({ source: "telegram", message: "telegram runner başlatıldı" })
  void scanLoop(state)
}

/**
 * 60 sn'de bir linear_settings taraması: enabled+token'lı şirketler için
 * poller başlat; kapananları/token değiştirenleri durdur; config snapshot'ını
 * (operatör listesi, varsayılan takım) yerinde tazele. Günde bir cleanup.
 */
async function scanLoop(state: RunnerState): Promise<void> {
  for (;;) {
    try {
      const db = await getDb()
      if (!state.indexesEnsured) {
        await ensureTelegramIndexes()
        state.indexesEnsured = true
      }

      const docs = await db
        .collection("linear_settings")
        .find(
          { "telegram.enabled": true, "telegram.botTokenCipher": { $ne: null } },
          { projection: { companyId: 1, telegram: 1 } },
        )
        .toArray()

      const active = new Set<string>()
      for (const doc of docs) {
        const companyId = doc.companyId as string
        const telegram = doc.telegram as LinearTelegramSettings
        const config = resolveBotConfig(companyId, telegram)
        if (!config) continue // decrypt edilemedi (master key yok) → pasif
        active.add(companyId)

        const fingerprint = telegram.botTokenCipher ?? ""
        const existing = state.pollers.get(companyId)
        if (existing && existing.tokenFingerprint === fingerprint) {
          // Çalışıyor — config snapshot'ını yerinde tazele (restart gerekmez;
          // operatör/dil değişiklikleri bir sonraki mesajda geçerli olur).
          existing.runtime.config.operators = config.operators
          existing.runtime.config.language = config.language
          continue
        }
        if (existing) {
          // Token değişti — eski poller'ı durdur, yenisini başlat.
          existing.stop()
          state.pollers.delete(companyId)
        }
        const poller = new CompanyPoller(config, fingerprint)
        state.pollers.set(companyId, poller)
        poller.start()
      }

      // Artık aktif olmayan şirketlerin poller'larını durdur.
      for (const [companyId, poller] of state.pollers) {
        if (!active.has(companyId)) {
          poller.stop()
          state.pollers.delete(companyId)
        }
      }

      // KVKK/temizlik — günde bir (throttle cleanup içinde).
      await maybeRunTelegramCleanup()
    } catch (e) {
      // DB erişilemiyor olabilir (örn. lokal dev, tünel kapalı) — runner'ı
      // düşürme, bir sonraki turda tekrar dene.
      logger.error({
        source: "telegram",
        message: "runner tarama hatası",
        error: (e as Error).message,
      })
    }
    await sleep(SCAN_INTERVAL_MS)
  }
}

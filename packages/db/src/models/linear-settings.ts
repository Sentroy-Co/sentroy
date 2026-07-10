import { getDb } from "../client"
import { toId } from "./_helpers"

/**
 * Linear Lite — şirket başına Linear workspace bağlantı ayarları. Company-scoped,
 * şirket başına TEK doküman (unique index {companyId:1}). API key ve webhook
 * secret'ı AES-256-GCM cipher olarak saklanır (`@workspace/console/lib/env-vault-crypto`,
 * master key `SENTROY_ENV_MASTER_KEY`) — GET response'larında cipher/plaintext ASLA
 * dönülmez, yalnız `apiKeyPrefix` (ilk 12 char) gösterilir. Bkz. [[linear-image-asset]].
 */

const COLLECTION = "linear_settings"

export type LinearStorageProvider = "linear" | "sentroy"

/**
 * Zengin operatör kaydı — komut bazlı yetkiler + opsiyonel Sentroy şirket
 * kullanıcısı eşlemesi. Legacy `operatorIds` kayıtları okuma sırasında tüm
 * yetkiler açık (memberUserId null) olarak bu şemaya map'lenir.
 */
export interface LinearTelegramOperator {
  /** Numeric Telegram user_id (allowlist anahtarı). */
  tgUserId: string
  tgUsername: string | null
  tgDisplayName: string | null
  /** Opsiyonel eşleme: Sentroy şirket kullanıcısı (better-auth user id). */
  memberUserId: string | null
  /** /talep — yeni talep açabilir. */
  canCreate: boolean
  /** /talepler — paneldeki tüm talepleri listeleyebilir. */
  canListAll: boolean
  /** /iptal + akış içi iptal butonu. */
  canCancel: boolean
  /**
   * Takım erişimi: "all" → tüm takımlar; <teamId> → yalnız o takım (/talep'te
   * takım adımı atlanır, /talepler o takıma filtrelenir); null → erişim yok
   * (talep/list komutları kibarca reddedilir). Alan eksikse (eski kayıt)
   * okuma sırasında "all" kabul edilir; UI'dan yeni eklenenler null başlar.
   */
  teamAccess?: "all" | string | null
}

/**
 * Telegram bot entegrasyonu (Linear Lite — m/triage bot portu). Şirket başına
 * bir bot; token AES-256-GCM cipher olarak saklanır (Linear API key ile aynı
 * desen). Response'larda plaintext ASLA dönmez — yalnız son 4 karakter
 * (`botTokenLast4`) maskeli gösterim için tutulur.
 */
export interface LinearTelegramSettings {
  /** Bot aktif mi — poller yalnız enabled + token'lı şirketler için çalışır. */
  enabled: boolean
  /** BotFather token'ı — AES-256-GCM cipher. Decrypt yalnız server-side. */
  botTokenCipher: string | null
  /** Token'ın SON 4 karakteri — UI'da maskeli gösterim (••••1234). */
  botTokenLast4: string | null
  /**
   * LEGACY allowlist — yalnız geriye uyum için okunur (operators yoksa tüm
   * yetkiler açık kabul edilir). PUT, operators yazarken bu alanı ayna
   * (mirror) olarak senkron tutar.
   */
  operatorIds: string[]
  /** Zengin operatör kayıtları (yetki bazlı). Yoksa operatorIds fallback. */
  operators?: LinearTelegramOperator[] | null
  /** Bot'un takım seçtirme adımında öne çıkarılacak varsayılan takım (opsiyonel). */
  defaultTeamId: string | null
  /** Bot'un kullanıcıya konuştuğu dil — default "en" (okuma sırasında uygulanır). */
  language?: "en" | "tr"
  /** getUpdates long-poll offset'i — son işlenen update_id (poller yazar). */
  updateOffset: number | null
  /** Son başarılı poll zamanı (bağlantı sağlığı göstergesi; poller yazar). */
  lastPolledAt: Date | null
  /**
   * Operatör keşfi (dinleme modu) — aktifken allowlist DIŞI kullanıcılardan
   * gelen özel mesajların yalnız KİMLİĞİ (mesaj içeriği DEĞİL — KVKK)
   * linear_telegram_seen koleksiyonuna yazılır; UI listeden operatör ekler.
   */
  discovery?: { activeUntil: Date } | null
}

export interface LinearSettings {
  id: string
  companyId: string
  /** Linear API key — AES-256-GCM cipher. Decrypt yalnız server-side servis katmanında. */
  apiKeyCipher: string | null
  /** API key'in ilk 12 karakteri — UI'da maskeli gösterim için. */
  apiKeyPrefix: string | null
  /** Linear webhook imza secret'ı — AES-256-GCM cipher. */
  webhookSecretCipher: string | null
  /** Linear tarafında kayıtlı webhook id'si (register/delete için). */
  webhookId: string | null
  defaultTeamId: string | null
  /** Panel'e düşen issue'ları işaretleyen Linear label adı. */
  panelLabelName: string
  defaultLabelName: string | null
  defaultStateName: string | null
  /** true → Linear mutasyonları app actor'ı olarak atılır (OAuth app kimliği). */
  actorApp: boolean
  /** Görsel/ek yükleme hedefi: Linear native upload veya Sentroy Storage. */
  storageProvider: LinearStorageProvider
  /** Sentroy Storage provider config (storageProvider === "sentroy" iken). */
  sentroyApiKeyCipher: string | null
  sentroyApiKeyPrefix: string | null
  sentroyBucketId: string | null
  sentroyCompanySlug: string | null
  sentroyBaseUrl: string | null
  /** UI feature flag override'ları — kısmi map; verilmeyen flag default TRUE kabul edilir. */
  uiFlags: Record<string, boolean>
  /** Telegram bot entegrasyonu — null = hiç yapılandırılmamış (additive alan). */
  telegram: LinearTelegramSettings | null
  /** Son doğrulanmış webhook event zamanı (bağlantı sağlığı göstergesi). */
  lastWebhookAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type LinearSettingsPatch = Partial<
  Omit<LinearSettings, "id" | "companyId" | "createdAt" | "updatedAt">
>

/** Yeni doküman default'ları — upsert insert path'inde patch'te olmayan alanlara uygulanır. */
const DEFAULTS: Omit<
  LinearSettings,
  "id" | "companyId" | "createdAt" | "updatedAt"
> = {
  apiKeyCipher: null,
  apiKeyPrefix: null,
  webhookSecretCipher: null,
  webhookId: null,
  defaultTeamId: null,
  panelLabelName: "Linear Lite",
  defaultLabelName: null,
  defaultStateName: null,
  actorApp: false,
  storageProvider: "linear",
  sentroyApiKeyCipher: null,
  sentroyApiKeyPrefix: null,
  sentroyBucketId: null,
  sentroyCompanySlug: null,
  sentroyBaseUrl: null,
  uiFlags: {},
  telegram: null,
  lastWebhookAt: null,
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function findByCompany(
  companyId: string,
): Promise<LinearSettings | null> {
  const c = await col()
  return toId(await c.findOne({ companyId })) as LinearSettings | null
}

export async function upsertByCompany(
  companyId: string,
  patch: LinearSettingsPatch,
): Promise<LinearSettings> {
  const c = await col()
  const now = new Date()
  // $set ile $setOnInsert aynı key'i paylaşamaz — patch'te gelen alanları
  // insert default'larından düş.
  const onInsert: Record<string, unknown> = { createdAt: now }
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!(key in patch)) onInsert[key] = value
  }
  const updated = await c.findOneAndUpdate(
    { companyId },
    { $set: { ...patch, updatedAt: now }, $setOnInsert: onInsert },
    { upsert: true, returnDocument: "after" },
  )
  return toId(updated) as LinearSettings
}

export async function deleteByCompany(companyId: string): Promise<void> {
  const c = await col()
  await c.deleteMany({ companyId })
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ companyId: 1 }, { unique: true })
}

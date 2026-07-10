import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "landing_apps"

/**
 * Kök domain — `@workspace/auth/lib/domains` ile aynı mantık; ancak db→auth
 * circular bağımlılığını önlemek için burada inline. Default `sentroy.com`
 * (env set edilmezse mevcut seed URL'leri BİREBİR aynı kalır).
 */
function rootDomain(): string {
  const raw =
    process.env.SENTROY_ROOT_DOMAIN || process.env.NEXT_PUBLIC_ROOT_DOMAIN
  const t = (raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
  return t || "sentroy.com"
}

export type LocalizedString = Record<string, string>

/**
 * Landing'in "Apps" bölümünde görünen platform ürünü. Mail/Storage gibi her
 * subdomain için bir record. Yeni app eklemek için sadece bu collection'a
 * yeni doc — kod değişikliği `iconKey` ve `sdkExampleKey` whitelist'leriyle
 * sınırlı (gerçekten yeni icon/SDK örneği gerekirse).
 */
export interface LandingApp {
  id: string
  /** Stable identifier — i18n key + SDK örneği eşleştirmesi için. Örn: "mail" */
  key: string
  name: LocalizedString
  tagline: LocalizedString
  description: LocalizedString
  /** Whitelisted hugeicon adı (apps/core/components/landing/landing-page.tsx içinde mapping). */
  iconKey: string
  /** 3-5 madde, her biri çok dilli. */
  features: LocalizedString[]
  /** "https://mail.sentroy.com" — locale agnostik (subdomain kendi locale'ini handle eder). */
  ctaUrl: string
  ctaLabel: LocalizedString
  /** Hangi SDK kod örneği tab'ı gösterilsin. null ise SDK bölümü kart için render edilmez. */
  sdkExampleKey: string | null
  order: number
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

export async function list(opts: { onlyEnabled?: boolean } = {}): Promise<LandingApp[]> {
  const c = await col()
  const filter = opts.onlyEnabled ? { enabled: true } : {}
  const docs = await c.find(filter).sort({ order: 1, createdAt: 1 }).toArray()
  return docs.map(toId) as LandingApp[]
}

export async function findByKey(key: string): Promise<LandingApp | null> {
  const c = await col()
  const doc = await c.findOne({ key })
  return toId(doc) as LandingApp | null
}

export async function findById(id: string): Promise<LandingApp | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return toId(doc) as LandingApp | null
}

export async function create(data: {
  key: string
  name: LocalizedString
  tagline: LocalizedString
  description: LocalizedString
  iconKey: string
  features?: LocalizedString[]
  ctaUrl: string
  ctaLabel: LocalizedString
  sdkExampleKey?: string | null
  order?: number
  enabled?: boolean
}): Promise<LandingApp> {
  const c = await col()
  const now = new Date()
  const doc = {
    key: data.key,
    name: data.name,
    tagline: data.tagline,
    description: data.description,
    iconKey: data.iconKey,
    features: data.features ?? [],
    ctaUrl: data.ctaUrl,
    ctaLabel: data.ctaLabel,
    sdkExampleKey: data.sdkExampleKey ?? null,
    order: data.order ?? 0,
    enabled: data.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function updateById(
  id: string,
  data: Partial<Omit<LandingApp, "id" | "createdAt" | "updatedAt">>,
): Promise<LandingApp | null> {
  const c = await col()
  const updated = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return toId(updated) as LandingApp | null
}

export async function deleteById(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

/**
 * Seed — varsayılan landing app'lerini ekler. Per-key idempotent: hangi
 * `key` collection'da yoksa onu insert eder, mevcut record'lara dokunmaz.
 * Bu sayede:
 *   - Yeni install: hepsini ekler.
 *   - Mevcut install (eski mail+storage): yeni eklenen app'ler (örn. vault)
 *     bir sonraki çağrıda otomatik düşer; admin'in manuel düzenlemeleri
 *     korunur.
 */
export async function seedDefaults(): Promise<void> {
  const c = await col()
  const now = new Date()
  const root = rootDomain()

  const defaults: Array<Omit<LandingApp, "id">> = [
    {
      key: "mail",
      name: { en: "Mail", tr: "Mail" },
      tagline: {
        en: "Transactional email infrastructure",
        tr: "Islemsel e-posta altyapisi",
      },
      description: {
        en: "Send OTPs, verifications, and notifications with enterprise-grade deliverability. Own your domain reputation.",
        tr: "OTP, dogrulama ve bildirimleri kurumsal teslim edilebilirlikle gonderin. Domain itibarinizi koruyun.",
      },
      iconKey: "MailSend02Icon",
      features: [
        { en: "DKIM, SPF, DMARC automation", tr: "DKIM, SPF, DMARC otomasyonu" },
        { en: "Templating & dynamic variables", tr: "Sablon ve dinamik degisken" },
        { en: "Bounce, complaint, suppression handling", tr: "Geri donus, sikayet, supheli list yonetimi" },
        { en: "Webhooks for every event", tr: "Her olay icin webhook" },
      ],
      ctaUrl: `https://mail.${root}`,
      ctaLabel: { en: "Open Mail", tr: "Mail'i ac" },
      sdkExampleKey: "mail-send",
      order: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      key: "storage",
      name: { en: "Storage", tr: "Depolama" },
      tagline: {
        en: "S3-compatible object storage with CDN",
        tr: "CDN'li S3 uyumlu nesne depolama",
      },
      description: {
        en: "Upload, organize, and serve files across buckets with edge caching and signed URLs.",
        tr: "Dosyalari bucket'larda yukleyin, edge cache ve imzali URL ile sunun.",
      },
      iconKey: "FolderLibraryIcon",
      features: [
        { en: "Bucket-scoped access tokens", tr: "Bucket'a ozel erisim token'lari" },
        { en: "Public / private visibility", tr: "Acik / kapali gorunurluk" },
        { en: "Image transforms on the fly", tr: "Anlik gorsel donusumleri" },
        { en: "Edge cache + signed URL", tr: "Edge cache + imzali URL" },
      ],
      ctaUrl: `https://storage.${root}`,
      ctaLabel: { en: "Open Storage", tr: "Depolama'yi ac" },
      sdkExampleKey: "storage-upload",
      order: 2,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      key: "vault",
      name: { en: "Env Vault", tr: "Env Vault" },
      tagline: {
        en: "Runtime env management without rebuilds",
        tr: "Rebuild gerektirmeyen runtime env yönetimi",
      },
      description: {
        en: "Manage every environment variable from one dashboard. Bootstrap your deploy with a single token; change values without rebuilding the image.",
        tr: "Tüm ortam değişkenlerini tek dashboard'dan yönet. Deploy'unu tek bir token'la başlat; image'ı yeniden build etmeden değer güncelle.",
      },
      iconKey: "ShieldKeyIcon",
      features: [
        { en: "AES-256-GCM encryption at rest", tr: "Bekleme halinde AES-256-GCM şifreleme" },
        { en: "Public/private split for browser hooks", tr: "Browser hook'ları için public/private ayrımı" },
        { en: "Audit log with checksums — never plaintext", tr: "Plaintext yerine checksum tutan audit log" },
        { en: "useEnv() React hook + getEnv() server helper", tr: "useEnv() React hook'u + getEnv() server helper" },
      ],
      ctaUrl: `https://vault.${root}`,
      ctaLabel: { en: "Open Vault", tr: "Vault'u aç" },
      sdkExampleKey: "vault-fetch",
      order: 3,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      key: "auth",
      name: { en: "Sentroy Auth", tr: "Sentroy Auth" },
      tagline: {
        en: "Add \"Sign in with Sentroy\" to your site",
        tr: "Sitenize \"Sentroy ile giriş yap\" ekleyin",
      },
      description: {
        en: "Standard OAuth 2.0 + OpenID Connect provider. Your users authenticate with their existing Sentroy account; you get a verified profile back. Works with any OIDC-aware library — NextAuth, Authlib, Spring Security, you name it.",
        tr: "Standart OAuth 2.0 + OpenID Connect sağlayıcısı. Kullanıcılarınız mevcut Sentroy hesabıyla giriş yapar, siz doğrulanmış profili alırsınız. Her OIDC-uyumlu kütüphaneyle çalışır — NextAuth, Authlib, Spring Security ve diğerleri.",
      },
      iconKey: "Key01Icon",
      features: [
        { en: "OIDC discovery endpoint — one-line config", tr: "OIDC discovery endpoint — tek satır config" },
        { en: "Authorization code flow with HS256 id_token", tr: "HS256 id_token ile authorization code flow" },
        { en: "Per-app redirect_uri allow-list + scope control", tr: "App başına redirect_uri allow-list + scope kontrolü" },
        { en: "Cross-subdomain SSO with existing Sentroy session", tr: "Mevcut Sentroy oturumuyla cross-subdomain SSO" },
      ],
      ctaUrl: `https://auth.${root}`,
      ctaLabel: { en: "Open Auth", tr: "Auth'u aç" },
      sdkExampleKey: null,
      order: 4,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ]

  for (const def of defaults) {
    const existing = await c.findOne({ key: def.key })
    if (!existing) {
      await c.insertOne(def)
    }
  }
}

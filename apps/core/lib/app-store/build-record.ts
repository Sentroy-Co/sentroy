import { randomBytes } from "crypto"
import { manifestSlug, manifestEmbedOrigin, type SentroyAppManifest } from "@workspace/app-manifest"
import type {
  SentroyApp,
  SentroyAppSource,
  SentroyAppStatus,
  SentroyAppVisibility,
} from "@workspace/db/types"
import { computeSandboxAttr, computeAllowAttr } from "./security"

export interface BuildAppContext {
  /** registry satırlarında NULL (merkezi kayıt, yerel company yok). */
  developerCompanyId: string | null
  /** registry satırlarında NULL. */
  submittedByUserId: string | null
  source: SentroyAppSource
  /**
   * true → public mağaza için onaya gönder (status pending, admin onayı + origin
   * doğrulaması). false → ŞİRKETE-ÖZEL kayıt (status approved, visibility private,
   * yalnız developerCompanyId üyeleri görür; review/origin-doğrulama yok).
   * source="registry" için YOK SAYILIR (merkezi olarak zaten onaylı+public).
   */
  submitForReview: boolean
  /** source="registry" — merkezde çalışan origin doğrulamasının damgası. */
  registryOriginVerifiedAt?: Date | null
}

/**
 * Doğrulanmış manifest → `SentroyApp` create input. Güvenlik değerleri
 * (sandbox/allow/embedOrigin/scopes) SERVER-side burada türetilir.
 *
 * source="registry" (Faz 5): merkezi katalogdan sync — visibility=public,
 * status=approved, ownerUserId=null, originVerifiedAt merkezden taşınır.
 * Güvenlik attribute'ları yine YEREL olarak yeniden türetilir (wire'daki
 * önhesaplanmış değerlere ASLA güvenilmez).
 */
export function buildAppCreateInput(m: SentroyAppManifest, ctx: BuildAppContext, now: Date): Omit<SentroyApp, "id"> {
  const isRegistry = ctx.source === "registry"
  const visibility: SentroyAppVisibility = isRegistry
    ? "public"
    : ctx.submitForReview
      ? "public"
      : "private"
  const status: SentroyAppStatus = isRegistry
    ? "approved"
    : ctx.submitForReview
      ? "pending"
      : "approved"
  // private app sahibi şirkete-kapsamlı (developerCompanyId); ownerUserId = gönderen.
  // registry: public → ownerUserId null.
  const ownerUserId = isRegistry ? null : visibility === "private" ? ctx.submittedByUserId : null
  return {
    appId: m.identity.id,
    slug: manifestSlug(m),
    name: m.identity.name,
    tagline: m.identity.tagline ?? null,
    developerCompanyId: ctx.developerCompanyId,
    submittedByUserId: ctx.submittedByUserId,
    visibility,
    ownerUserId,
    status,
    source: ctx.source,
    currentVersion: m.identity.version,
    manifestVersion: m.manifestVersion,
    embedUrl: m.embed.url,
    embedOrigin: manifestEmbedOrigin(m),
    injectedParams: m.embed.injectedParams,
    minHeight: m.embed.minHeight ?? null,
    authMode: m.auth.mode,
    jwksAudience: m.auth.jwksAudience ?? null,
    requiredScopes: m.auth.requiredScopes ?? [],
    oauthClientId: null,
    sandboxAttr: computeSandboxAttr(m, visibility),
    allowAttr: computeAllowAttr(m, visibility),
    appearance: {
      logoUrl: m.appearance.logoUrl,
      color: m.appearance.color,
      category: m.appearance.category,
      screenshots: (m.appearance.screenshots ?? []).map((s) => ({
        url: s.url,
        alt: s.alt ?? null,
        width: s.width ?? null,
        height: s.height ?? null,
      })),
    },
    store: {
      description: m.store.description,
      longDescription: m.store.longDescription ?? null,
      supportUrl: m.store.supportUrl ?? null,
      privacyUrl: m.store.privacyUrl,
      termsUrl: m.store.termsUrl ?? null,
      supportedLangs: m.i18n.supportedLangs,
      fallbackLang: m.i18n.fallbackLang,
    },
    pricing: {
      model: m.pricing.model,
      polar: m.pricing.model === "paid" ? m.pricing.polar : null,
    },
    // Faz 5: self-host uyumluluk kapısı + advisory rozet — manifest'ten türetilir
    // (registry sync bunları wire'dan değil re-parse'tan alır → güvenli).
    supportsSelfHostedIssuers: m.capabilities.supportsSelfHostedIssuers ?? false,
    hostedOnly: m.store.hostedOnly ?? false,
    verificationToken: `sentroy-verify-${randomBytes(16).toString("hex")}`,
    originVerifiedAt: isRegistry ? (ctx.registryOriginVerifiedAt ?? null) : null,
    reviewedByUserId: null,
    reviewedAt: null,
    rejectionReason: null,
    installCount: 0,
    ratingAvg: 0,
    ratingCount: 0,
    versions: [
      {
        version: m.identity.version,
        manifestVersion: m.manifestVersion,
        manifestSnapshot: m as unknown as Record<string, unknown>,
        syncedAt: now,
        changelog: null,
      },
    ],
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

/** semver "a.b.c" karşılaştırma — b > a ise pozitif. */
export function semverGt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (y > x) return true
    if (y < x) return false
  }
  return false
}

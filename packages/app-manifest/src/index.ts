import {
  sentroyAppManifestSchema,
  MANIFEST_VERSION,
  INJECTABLE_PARAMS,
  SUPPORTED_LANGS,
  OAUTH_SCOPES,
  APP_CATEGORIES,
  RESERVED_IDS,
  type SentroyAppManifest,
  type InjectableParam,
  type ManifestLang,
  type ManifestScope,
} from "./schema"

export {
  sentroyAppManifestSchema,
  MANIFEST_VERSION,
  INJECTABLE_PARAMS,
  SUPPORTED_LANGS,
  OAUTH_SCOPES,
  APP_CATEGORIES,
  RESERVED_IDS,
}
export type { SentroyAppManifest, InjectableParam, ManifestLang, ManifestScope }

export interface ParseIssue {
  path: string
  message: string
}

export type ParseResult =
  | { ok: true; manifest: SentroyAppManifest }
  | { ok: false; issues: ParseIssue[] }

/**
 * Manifest JSON'unu (ham `unknown`) doğrula. Hem CI repo'su hem core'un
 * gönderim/sync kodu BUNU kullanır — tek doğrulama yolu.
 */
export function parseManifest(input: unknown): ParseResult {
  const res = sentroyAppManifestSchema.safeParse(input)
  if (res.success) return { ok: true, manifest: res.data }
  return {
    ok: false,
    issues: res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  }
}

/** Mağaza URL slug'ı — açıkça verilmemişse id'ye düşer. */
export function manifestSlug(m: SentroyAppManifest): string {
  return m.identity.slug ?? m.identity.id
}

/** Embed iframe'inin origin'i (CSP frame-src + token aud için). */
export function manifestEmbedOrigin(m: SentroyAppManifest): string {
  return new URL(m.embed.url).origin
}

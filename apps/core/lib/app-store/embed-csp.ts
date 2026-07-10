/**
 * App Store iframe için CSP `frame-src` allow-list. OS dökümanlarına (dashboard
 * + admin) middleware ile basılır. İçerir: `'self'` (core overview/billing/
 * profile), tüm `*.sentroy.com` (ilk-parti app'ler: mail/storage/auth/tools/…),
 * ve onaylı store app origin'leri. Yalnız `frame-src` — script/style kısıtlamaz
 * (mevcut davranışı bozmaz), sadece neyin frame'leneceğini sınırlar.
 */
import { serverRootDomain, wildcardHttpsOrigin } from "@workspace/auth/lib/domains"

export function buildFrameSrc(storeOrigins: string[]): string {
  // `https://*.<root>` tek kök domain'den (default sentroy.com — davranış aynı).
  const sources = [
    "'self'",
    wildcardHttpsOrigin(serverRootDomain()),
    ...storeOrigins.filter(Boolean),
  ]
  const uniq = Array.from(new Set(sources))
  return `frame-src ${uniq.join(" ")};`
}

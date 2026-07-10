import { AnalyticsClient } from "./analytics-client"

export interface AnalyticsScriptsSeo {
  gaId: string | null
  gtmId: string | null
  metaPixelId: string | null
  plausibleDomain: string | null
  hotjarId: string | null
}

export interface AnalyticsScriptsProps {
  seo: AnalyticsScriptsSeo
}

/**
 * Server-component wrapper that injects analytics scripts gated by cookie consent.
 *
 * Pass the SEO ids from your data layer (each may be `null` if not configured).
 * If every id is empty/null, this renders nothing — no client bundle is shipped.
 *
 * Consent is read on the client from `useCookieConsent`:
 * - `consent.analytics === true` → GA4, GTM, Plausible, Hotjar
 * - `consent.marketing === true` → Meta Pixel
 */
export function AnalyticsScripts({ seo }: AnalyticsScriptsProps) {
  const hasAny =
    Boolean(seo?.gaId) ||
    Boolean(seo?.gtmId) ||
    Boolean(seo?.metaPixelId) ||
    Boolean(seo?.plausibleDomain) ||
    Boolean(seo?.hotjarId)

  if (!hasAny) return null

  return <AnalyticsClient ids={seo} />
}

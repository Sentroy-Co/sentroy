import type { MetadataRoute } from "next"
import { serverRootDomain, rootOrigin } from "@workspace/auth/lib/domains"

/**
 * Dynamic robots.txt — Next.js 16 metadata file convention.
 *
 * Strategy:
 *  - Default crawlers (asterisk wildcard): allow the public surface, disallow
 *    API + dashboard (/[lang]/d), platform admin (/[lang]/admin), per-company
 *    invite/profile redemption (/[lang]/profile/c), and every auth flow page.
 *    Locale-prefix paths use /asterisk/ glob so both /en/... and /tr/... covered.
 *  - AI agent crawlers: explicitly allow / so models/training can index public
 *    landing + docs surfaces. (Listing them separately also serves as a
 *    documentation/audit record of which crawlers we permit.)
 *  - host pins the canonical origin (avoids www / preview duplication).
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    "/*/d/",
    "/*/admin/",
    "/*/profile/c/",
    "/*/login",
    "/*/signup",
    "/*/forgot-password",
    "/*/reset-password",
    "/*/two-factor",
    "/*/passwordless",
    "/*/verify-email",
    "/*/verify-email-pending",
  ]

  const aiCrawlers = [
    "GPTBot",
    "ClaudeBot",
    "PerplexityBot",
    "Claude-Web",
    "anthropic-ai",
    "Bingbot",
    "Googlebot",
  ]

  // Kök origin ROOT_DOMAIN'den türetilir (default sentroy.com → mevcut aynı).
  const origin = rootOrigin(serverRootDomain())

  return {
    rules: [
      { userAgent: "*", allow: ["/"], disallow },
      ...aiCrawlers.map((userAgent) => ({ userAgent, allow: ["/"] })),
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}

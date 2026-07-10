import type { MetadataRoute } from "next"
import { getDb } from "@workspace/db/client"
import {
  serverRootDomain,
  rootOrigin,
  docsHost,
} from "@workspace/auth/lib/domains"

/**
 * Dynamic sitemap.xml — Next.js 16 metadata file convention.
 *
 * Surfaces enumerated:
 *  1. Locale landings (`/en`, `/tr`) — priority 1.0
 *  2. Docs (cross-subdomain on `docs.sentroy.com`) — top-level + product
 *     sections + compare pages
 *  3. Public user profiles (`/[lang]/profile/u/[slug]`) — DB lookup for
 *     `user` collection rows with `isPublicProfile=true` + `profileSlug`
 *     (better-auth managed; no `@workspace/db` user model, direct query)
 *  4. CMS static pages (`/[lang]/p/[slug]`) — `static_pages` collection,
 *     `published: true`
 *
 * DB failures degrade gracefully — sitemap still returns the static
 * landing/docs entries instead of crashing the route.
 */

// Kök + docs origin ROOT_DOMAIN'den türetilir (default sentroy.com → aynı).
const ROOT_DOMAIN = serverRootDomain()
const ROOT = rootOrigin(ROOT_DOMAIN)
const DOCS = `https://${docsHost(ROOT_DOMAIN)}`
const LOCALES = ["en", "tr"] as const

const DOCS_SECTIONS = [
  "/",
  "/mail",
  "/storage",
  "/react",
  "/auth",
  "/auth-projects",
  "/env-vault",
  "/status-pages",
  "/cli",
  "/ai-skills",
  "/tools/curl",
] as const

const COMPARE_PAGES = [
  "resend",
  "mailgun",
  "firebase-auth",
  "s3",
  "doppler",
] as const

const PROFILE_LIMIT = 1000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = []

  // ── 1. Landings (high priority, weekly refresh) ───────────────────
  for (const lang of LOCALES) {
    entries.push({
      url: `${ROOT}/${lang}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    })
  }

  // ── 2. Docs cross-subdomain ───────────────────────────────────────
  for (const section of DOCS_SECTIONS) {
    entries.push({
      url: `${DOCS}${section === "/" ? "" : section}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    })
  }

  // ── 3. Compare landing pages (lower freq) ─────────────────────────
  for (const slug of COMPARE_PAGES) {
    entries.push({
      url: `${DOCS}/compare/${slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    })
  }

  // ── 4. Public user profiles — better-auth `user` collection ───────
  // No `@workspace/db` user model (better-auth owns the schema); query
  // the collection directly with the same projection contract used by
  // /api/profile/u/[slug] (isPublicProfile + profileSlug).
  try {
    const db = await getDb()
    const users = await db
      .collection("user")
      .find(
        { isPublicProfile: true, profileSlug: { $exists: true, $ne: null } },
        { projection: { profileSlug: 1, updatedAt: 1, createdAt: 1 } },
      )
      .sort({ createdAt: -1 })
      .limit(PROFILE_LIMIT)
      .toArray()

    for (const user of users) {
      const slug = (user.profileSlug as string | undefined)?.toLowerCase()
      if (!slug) continue
      const lastModified =
        (user.updatedAt as Date | undefined) ??
        (user.createdAt as Date | undefined) ??
        now
      for (const lang of LOCALES) {
        entries.push({
          url: `${ROOT}/${lang}/profile/u/${slug}`,
          lastModified,
          changeFrequency: "weekly",
          priority: 0.5,
        })
      }
    }
  } catch (err) {
    // Sitemap must keep responding even if Mongo is down; skip the
    // dynamic block and rely on static landing/docs entries.
    console.error("[sitemap] failed to enumerate public profiles", err)
  }

  // ── 5. CMS pages — `static_pages` collection ──────────────────────
  try {
    const db = await getDb()
    const pages = await db
      .collection("static_pages")
      .find(
        { published: true },
        { projection: { slug: 1, updatedAt: 1, createdAt: 1 } },
      )
      .sort({ order: 1, createdAt: -1 })
      .toArray()

    for (const page of pages) {
      const slug = page.slug as string | undefined
      if (!slug) continue
      const lastModified =
        (page.updatedAt as Date | undefined) ??
        (page.createdAt as Date | undefined) ??
        now
      for (const lang of LOCALES) {
        entries.push({
          url: `${ROOT}/${lang}/p/${slug}`,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.6,
        })
      }
    }
  } catch (err) {
    console.error("[sitemap] failed to enumerate CMS pages", err)
  }

  return entries
}

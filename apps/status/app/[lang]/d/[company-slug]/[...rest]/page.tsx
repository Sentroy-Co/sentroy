import { permanentRedirect } from "next/navigation"

/**
 * Catch-all — `apps/status` yalnızca status page yönetimini hosts ediyor
 * (`/d/[company-slug]/status`). Company-level diğer route'lar (settings,
 * members, billing, posts, oauth-clients, auth-projects, vault vs.) bu
 * app'te yok; user URL bar'a yazsa veya cross-app link tıklasa core'a
 * redirect ediyoruz (kalıcı 308 — bookmark/index taşınmasın). Cross-
 * subdomain better-auth cookie sayesinde session aynen taşınır.
 *
 * `status` segmenti specific route olarak `status/page.tsx`'te tanımlı,
 * Next.js önce specific match'i denediği için bu catch-all'a düşmez.
 */
export default async function StatusCompanyCatchAll({
  params,
}: {
  params: Promise<{ lang: string; "company-slug": string; rest: string[] }>
}) {
  const { lang, "company-slug": slug, rest } = await params
  const coreUrl =
    process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
  const restPath = (rest ?? []).join("/")
  const target = `${coreUrl}/${lang}/d/${slug}${restPath ? `/${restPath}` : ""}`
  permanentRedirect(target)
}

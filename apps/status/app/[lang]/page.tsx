import { redirect } from "next/navigation"

/**
 * Sentroy internal status — root URL multi-tenant infrastructure'ı
 * dogfood eder. Sentroy şirketi kendi public status page'ini "sentroy"
 * slug'ı altında host'lar; bu route oraya redirect.
 *
 * Slug env'le override edilebilir (dev/staging için farklı slug).
 * Default: "sentroy".
 *
 * Phase 1.0'daki hardcoded `buildStatusSnapshot()` (5 service)
 * `apps/status/app/api/public/status` ve `app/feed.json` legacy
 * endpoint'lerinde hâlâ kullanılıyor (eski tüketiciler için).
 */
interface Props {
  params: Promise<{ lang: string }>
}

const SENTROY_PAGE_SLUG = process.env.NEXT_PUBLIC_SENTROY_STATUS_SLUG || "sentroy"

export default async function RootRedirectPage({ params }: Props) {
  const { lang } = await params
  redirect(`/${lang}/p/${SENTROY_PAGE_SLUG}`)
}

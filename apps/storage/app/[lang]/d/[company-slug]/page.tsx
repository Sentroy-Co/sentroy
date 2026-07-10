import { redirect } from "next/navigation"

/**
 * Storage app dashboard'u Overview sayfasına ta\u015f\u0131nd\u0131. Eski 3 stat-kart
 * \u00f6zeti yerine `/usage` art\u0131k overview (chart'lar + recent uploads + plan
 * kotas\u0131) i\u00e7eriyor; root segment direkt o sayfaya y\u00f6nlendiriyor.
 */
export default async function CompanyRootPage({
  params,
}: {
  params: Promise<{ lang: string; "company-slug": string }>
}) {
  const { lang, "company-slug": companySlug } = await params
  redirect(`/${lang}/d/${companySlug}/usage`)
}

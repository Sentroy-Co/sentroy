import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { companyModel, companyMemberModel } from "@workspace/db/models"
import { CompanyAvatar } from "@workspace/console/components/shared"

/**
 * `/[lang]/d` landing — kullanıcının status sayfası yöneteceği company'i
 * seçtiği yer.
 *
 * Flow:
 *   - Session yok → core login redirect (callbackUrl=/d)
 *   - Session var + 1 active company → auto-redirect /d/<slug>/status
 *   - Session var + multi company → picker UI
 *   - Session var + 0 company → core /d landing'e yönlendir (yeni company yarat)
 */
interface Props {
  params: Promise<{ lang: string }>
}

export default async function StatusDashboardLanding({ params }: Props) {
  const { lang } = await params
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    const statusUrl =
      process.env.NEXT_PUBLIC_STATUS_APP_URL || "https://status.sentroy.com"
    const callback = encodeURIComponent(`${statusUrl}/${lang}/d`)
    redirect(`${coreUrl}/${lang}/login?callbackUrl=${callback}`)
  }

  const memberships = await companyMemberModel.findByUser(session.user.id)
  const activeMemberships = memberships.filter((m) => m.status === "active")

  if (activeMemberships.length === 0) {
    // Hiç şirket yok → core dashboard'a yönlendir, kullanıcı orada yarar
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    redirect(`${coreUrl}/${lang}/d`)
  }

  if (activeMemberships.length === 1) {
    const m = activeMemberships[0]!
    const company = await companyModel.findById(m.companyId)
    if (company) {
      redirect(`/${lang}/d/${company.slug}/status`)
    }
  }

  // Multi-company picker
  const companies = await Promise.all(
    activeMemberships.map(async (m) => {
      const c = await companyModel.findById(m.companyId)
      return c
        ? { id: c.id, slug: c.slug, name: c.name, avatarUrl: c.avatarUrl ?? null }
        : null
    }),
  )
  const validCompanies = companies.filter(
    (c): c is { id: string; slug: string; name: string; avatarUrl: string | null } =>
      c !== null,
  )

  const t = await getTranslations({ locale: lang, namespace: "statusDashboard" })
  const heading = t("pickCompanyHeading")
  const subtitle = t("pickCompanySubtitle")

  return (
    <div className="min-h-svh bg-background text-foreground flex items-center justify-center p-6">
      <main className="w-full max-w-md space-y-6">
        <header>
          <h1 className="text-xl font-semibold">{heading}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </header>
        <ul className="overflow-hidden rounded-xl border bg-card">
          {validCompanies.map((c, idx) => (
            <li key={c.id} className={idx > 0 ? "border-t" : ""}>
              <Link
                href={`/${lang}/d/${c.slug}/status`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <CompanyAvatar
                  name={c.name}
                  avatarUrl={c.avatarUrl}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    /{c.slug}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

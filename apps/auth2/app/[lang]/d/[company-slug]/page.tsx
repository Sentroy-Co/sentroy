import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { Key01Icon, ShieldUserIcon } from "@hugeicons/core-free-icons"

/**
 * auth.sentroy.com dashboard overview — Auth ürünlerinin iki ana giriş
 * noktası: OAuth Clients (federation) ve Auth Projects (end-user pool).
 *
 * Hangi ürünü seçeceğini netleştiren kısa açıklamalar Phase 6 docs
 * sayfasında genişler; bu overview shorthand orientation.
 */
export default async function AuthDashboardOverviewPage({
  params,
}: {
  params: Promise<{ "company-slug": string; lang: string }>
}) {
  const { "company-slug": slug, lang } = await params
  const basePath = `/${lang}/d/${slug}`

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sentroy Auth</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Identity ürünleri için tek merkez: kullanıcılarınıza &ldquo;Sign in
          with Sentroy&rdquo; düğmesi sunun veya kendi end-user havuzunuzu
          Sentroy üzerinde host edin.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={`${basePath}/oauth-clients`}
          className="group flex flex-col gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={Key01Icon} strokeWidth={2} className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">OAuth Clients</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              &ldquo;Sign in with Sentroy&rdquo; akışı için OAuth 2.0 / OIDC
              client kaydet. Kullanıcılar Sentroy hesaplarıyla sitenize giriş
              yapar.
            </p>
          </div>
        </Link>

        <Link
          href={`${basePath}/auth-projects`}
          className="group flex flex-col gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={ShieldUserIcon}
              strokeWidth={2}
              className="size-5"
            />
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              Auth Projects
              <span className="rounded-full border bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                Soon
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Kendi end-user havuzunuzu Sentroy üzerinde host edin —
              signup/login/JWT/password reset için tek SDK. Firebase Auth
              alternatifi.
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ShieldKeyIcon,
  Tick02Icon,
  Cancel01Icon,
  GlobalIcon,
} from "@hugeicons/core-free-icons"
import { getAuthSession } from "@workspace/console/lib/api-helpers"
import { oauthClientModel } from "@workspace/db/models"
import {
  ALLOWED_SCOPES,
  type OAuthScope,
} from "@workspace/db/models/oauth-client"
import { Button } from "@workspace/ui/components/button"
import { makeTranslator, type Locale } from "@/lib/i18n"

/**
 * GET /[lang]/oauth/consent — internal redirect target from /oauth/authorize.
 *
 * Server component renders the consent UI; the "Allow" / "Deny" buttons
 * are server actions that issue the authorization code (Allow) or
 * redirect to redirect_uri with `error=access_denied` (Deny).
 *
 * Locale URL segment'inden alınır — `/oauth/authorize` Accept-Language
 * detect edip `/{lang}/oauth/consent?...`'a redirect eder.
 *
 * Consent ekranı kasıtlı olarak chrome'suz — focused OAuth flow UX
 * (Google / GitHub / Apple sign-in pattern). Header/footer landing'e özel.
 */

const SCOPE_KEY: Record<OAuthScope, string> = {
  openid: "consent.scope.openid",
  profile: "consent.scope.profile",
  email: "consent.scope.email",
  offline_access: "consent.scope.offline_access",
}

interface ConsentPageProps {
  params: Promise<{ lang: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ConsentPage({
  params,
  searchParams,
}: ConsentPageProps) {
  const { lang } = await params
  const sp = await searchParams
  const get = (k: string): string | null => {
    const v = sp[k]
    if (typeof v === "string") return v
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0]
    return null
  }
  const clientId = get("client_id")
  const redirectUri = get("redirect_uri")
  const scopeRaw = get("scope")
  const state = get("state")
  const nonce = get("nonce")
  const codeChallenge = get("code_challenge")
  const codeChallengeMethod = get("code_challenge_method")

  const t = makeTranslator(lang as Locale)

  if (!clientId || !redirectUri || !scopeRaw) {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <h1 className="mb-2 text-lg font-semibold">{t("consent.invalidTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("consent.invalidBody")}</p>
      </div>
    )
  }

  const client = await oauthClientModel.findByClientId(clientId)
  if (!client || !client.enabled) {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <h1 className="mb-2 text-lg font-semibold">
          {t("consent.unknownClientTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("consent.unknownClientBody")}
        </p>
      </div>
    )
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <h1 className="mb-2 text-lg font-semibold">
          {t("consent.invalidRedirectTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("consent.invalidRedirectBody")}
        </p>
      </div>
    )
  }

  // Session check — getAuthSession needs a NextRequest-like; build from headers
  const hdrs = await headers()
  const fakeReq = { headers: hdrs } as unknown as Parameters<typeof getAuthSession>[0]
  const session = await getAuthSession(fakeReq)
  if (!session) {
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    // Public URL detect — proxy arkasında `host` header `0.0.0.0:3003`
    // dönebileceği için NEXT_PUBLIC_AUTH_APP_URL → X-Forwarded-* → host
    // fallback chain.
    const envUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL
    const fwdHost = hdrs.get("x-forwarded-host")
    const fwdProto = hdrs.get("x-forwarded-proto") || "https"
    const base = envUrl
      ? envUrl.replace(/\/+$/, "")
      : fwdHost
        ? `${fwdProto}://${fwdHost}`
        : `https://${hdrs.get("host")}`
    const next = new URL(`/${lang}/oauth/consent`, base)
    Object.entries(sp).forEach(([k, v]) => {
      if (typeof v === "string") next.searchParams.set(k, v)
    })
    redirect(`${coreUrl}/${lang}/login?next=${encodeURIComponent(next.toString())}`)
  }

  const scopes = scopeRaw
    .split(/\s+/)
    .filter((s): s is OAuthScope => ALLOWED_SCOPES.has(s as OAuthScope))

  const userEmail = (session?.user as { email?: string })?.email ?? null
  const userName = (session?.user as { name?: string })?.name ?? t("consent.you")

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="flex w-full flex-col gap-6 rounded-2xl border bg-card p-7 shadow-sm">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HugeiconsIcon icon={ShieldKeyIcon} strokeWidth={2} className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">{client.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t("consent.signInAs")}{" "}
            <strong className="text-foreground">{userName}</strong>
            {userEmail ? (
              <>
                {" "}
                (<code className="font-mono text-[12px]">{userEmail}</code>)
              </>
            ) : null}
          </p>
          {client.homepageUrl ? (
            <Link
              href={client.homepageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={GlobalIcon} strokeWidth={2} className="size-3" />
              {new URL(client.homepageUrl).hostname}
            </Link>
          ) : null}
        </div>

        {/* Scopes */}
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("consent.intro", { name: client.name })}
          </p>
          <ul className="flex flex-col gap-2">
            {scopes.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  className="mt-0.5 size-4 shrink-0 text-emerald-500"
                />
                <span>{t(SCOPE_KEY[s])}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <form action="/api/oauth/consent" method="post" className="flex flex-col gap-2">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="scope" value={scopes.join(" ")} />
          {state ? <input type="hidden" name="state" value={state} /> : null}
          {nonce ? <input type="hidden" name="nonce" value={nonce} /> : null}
          {codeChallenge ? (
            <>
              <input type="hidden" name="code_challenge" value={codeChallenge} />
              <input
                type="hidden"
                name="code_challenge_method"
                value={codeChallengeMethod || "S256"}
              />
            </>
          ) : null}
          <Button type="submit" name="decision" value="allow" className="w-full">
            <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} data-icon="inline-start" />
            {t("consent.allow")}
          </Button>
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="outline"
            className="w-full"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} data-icon="inline-start" />
            {t("consent.deny")}
          </Button>
        </form>

        <p className="text-center text-[11px] text-muted-foreground">
          {t("consent.afterChoice", { host: new URL(redirectUri).hostname })}
        </p>
      </div>
    </main>
  )
}

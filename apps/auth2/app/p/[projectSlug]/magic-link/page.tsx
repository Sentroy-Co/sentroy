import { notFound } from "next/navigation"
import {
  authProjectModel,
  authProjectUserModel,
  authProjectSessionModel,
  authProjectTokenModel,
} from "@workspace/db/models"
import {
  signProjectIdToken,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@workspace/console/lib/auth-project-jwt"
import { AuthProjectShell } from "../_components/auth-project-shell"

export const dynamic = "force-dynamic"
export const metadata = { title: "Sign in" }

/**
 * Magic-link landing — mail'deki linkten gelir.
 *   /p/{slug}/magic-link?token={apt_...}
 *
 * Token consume + access/refresh issue + browser'a status mesajı.
 * `redirectUri` payload'taysa fragment-encoded token'la oraya yönlendirir
 * (SPA'lar window.location.hash'tan parse eder).
 */

interface Props {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function MagicLinkPage({ params, searchParams }: Props) {
  const { projectSlug } = await params
  const sp = await searchParams
  const tokenRaw = sp.token
  const token =
    typeof tokenRaw === "string"
      ? tokenRaw
      : Array.isArray(tokenRaw)
        ? tokenRaw[0]
        : null

  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project) notFound()

  if (!token) {
    return (
      <AuthProjectShell project={project} title="Sign in">
        <ErrorState message="No sign-in token provided. Use the link from your email." />
      </AuthProjectShell>
    )
  }

  const consume = await authProjectTokenModel.consume(token, "magic-link")
  if (!consume.ok) {
    return (
      <AuthProjectShell project={project} title="Sign in">
        <ErrorState
          message={
            consume.reason === "expired"
              ? "This sign-in link has expired. Request a new one."
              : consume.reason === "already-used"
                ? "This link has already been used."
                : "This link is invalid."
          }
        />
      </AuthProjectShell>
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return (
      <AuthProjectShell project={project} title="Sign in">
        <ErrorState message="This link doesn't belong to this project." />
      </AuthProjectShell>
    )
  }

  const user = await authProjectUserModel.findById(consume.token.userId)
  if (!user) {
    return (
      <AuthProjectShell project={project} title="Sign in">
        <ErrorState message="Account no longer exists." />
      </AuthProjectShell>
    )
  }

  if (!user.emailVerified) {
    await authProjectUserModel.update(user.id, { emailVerified: true })
  }

  const { token: refreshToken } = await authProjectSessionModel.create({
    authProjectId: project.id,
    userId: user.id,
  })
  const now = Math.floor(Date.now() / 1000)
  const accessToken = signProjectIdToken(project, {
    sub: user.id,
    iss: `${process.env.NEXT_PUBLIC_AUTH_APP_URL || "https://auth.sentroy.com"}/p/${project.slug}`,
    aud: project.apiKeyPrefix,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    email: user.email,
    email_verified: user.emailVerified,
    name: user.displayName ?? undefined,
    picture: user.image ?? undefined,
  })

  const payload = consume.token.payload as { redirectUri?: string } | null
  // GÜVENLİK: redirectUri token payload'undan gelir (token oluşturulurken
  // kullanıcı girdisinden). Doğrulanmadan window.location'a verilirse
  // attacker `redirectUri=https://evil.com` ile kurbanın access/refresh
  // token'larını (hash'te) çalabilir; `javascript:`/`data:` ile XSS olur.
  // Yalnız http(s) + projenin allowedOrigins'inde kayıtlı origin'e izin ver;
  // değilse redirect'i (ve token teslimini) iptal et.
  const redirectUri =
    payload?.redirectUri &&
    isAllowedRedirect(payload.redirectUri, project.allowedOrigins ?? [])
      ? payload.redirectUri
      : null

  return (
    <AuthProjectShell project={project} title="Signed in">
      <div className="space-y-3 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: `${project.branding.primaryColor || "#16a34a"}1a` }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={project.branding.primaryColor || "#16a34a"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="text-base font-medium">Welcome back, {user.displayName || user.email}.</p>
        <p className="text-sm text-muted-foreground">
          You're signed in. {redirectUri ? "Redirecting…" : "You can close this tab."}
        </p>
        {redirectUri ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function(){
                  var p = new URLSearchParams({
                    access_token: ${JSON.stringify(accessToken)},
                    refresh_token: ${JSON.stringify(refreshToken)},
                    token_type: "Bearer",
                    expires_in: ${ACCESS_TOKEN_TTL_SECONDS}
                  }).toString();
                  var u = new URL(${JSON.stringify(redirectUri)});
                  u.hash = p;
                  window.location.replace(u.toString());
                })();
              `,
            }}
          />
        ) : null}
      </div>
    </AuthProjectShell>
  )
}

/**
 * redirectUri yalnızca http(s) VE origin'i projenin allowedOrigins'inde
 * kayıtlıysa güvenli sayılır (token exfiltration / open-redirect / javascript:
 * şema koruması). allowedOrigins boşsa hiçbir redirect kabul edilmez —
 * fail-closed.
 */
function isAllowedRedirect(uri: string, allowedOrigins: string[]): boolean {
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false
  return allowedOrigins.some((o) => {
    try {
      return new URL(o).origin === u.origin
    } catch {
      return o === u.origin
    }
  })
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="space-y-3 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-destructive"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

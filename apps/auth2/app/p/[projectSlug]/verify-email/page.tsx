import { notFound } from "next/navigation"
import { authProjectModel, authProjectUserModel, authProjectTokenModel } from "@workspace/db/models"
import { AuthProjectShell } from "../_components/auth-project-shell"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Verify email",
}

/**
 * Verify-email landing page. Mail link'inden açılır:
 *   /p/{projectSlug}/verify-email?token={apt_...}
 *
 * Server component — sayfa render'ından önce token'ı consume eder.
 * Başarılıysa "email doğrulandı" mesajı; başarısızsa specifik hata
 * (expired / consumed / invalid / wrong-project). RP'nin branding'i ile
 * render edilir (logoUrl, primaryColor, displayName).
 *
 * Note: Bu sayfa direkt model'i çağırır (HTTP roundtrip yok) çünkü
 * auth2 process'i zaten DB'ye bağlı. API endpoint'i (`/api/v1/auth/.../
 * verify-email`) ile aynı iş mantığını paylaşır — burada `audit` log
 * atmıyoruz çünkü browser'dan landing page render'ında audit gerçek
 * "kullanıcı eylemi" olarak çift kayıt yaratırdı; audit verify-email
 * API POST'unda zaten yazılıyor.
 */

interface Props {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function VerifyEmailPage({ params, searchParams }: Props) {
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

  // Token yok → form prompt'a düşürmek anlamsız (verify token email
  // link'inden gelir, manuel girilmez). Sadece error state göster.
  if (!token) {
    return (
      <AuthProjectShell project={project} title="Verify your email">
        <ErrorState
          message="No verification token was provided. Please use the link from your email."
        />
      </AuthProjectShell>
    )
  }

  const consume = await authProjectTokenModel.consume(token, "verify-email")
  if (!consume.ok) {
    return (
      <AuthProjectShell project={project} title="Verify your email">
        <ErrorState
          message={
            consume.reason === "expired"
              ? "This verification link has expired. Sign in again to request a new one."
              : consume.reason === "already-used"
                ? "This link has already been used. Your email may already be verified — try signing in."
                : "This verification link is invalid. It may have been mistyped."
          }
        />
      </AuthProjectShell>
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return (
      <AuthProjectShell project={project} title="Verify your email">
        <ErrorState message="This link doesn't belong to this project." />
      </AuthProjectShell>
    )
  }

  const user = await authProjectUserModel.update(consume.token.userId, {
    emailVerified: true,
  })
  if (!user) {
    return (
      <AuthProjectShell project={project} title="Verify your email">
        <ErrorState message="The account associated with this link no longer exists." />
      </AuthProjectShell>
    )
  }

  return (
    <AuthProjectShell project={project} title="Email verified">
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
        <p className="text-base font-medium">You're all set, {user.displayName || user.email}.</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{user.email}</span> has been verified.
          You can close this tab and sign in.
        </p>
      </div>
    </AuthProjectShell>
  )
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

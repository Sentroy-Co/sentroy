import { notFound } from "next/navigation"
import {
  authProjectModel,
  authProjectUserModel,
  authProjectSessionModel,
  authProjectTokenModel,
} from "@workspace/db/models"
import { AuthProjectShell } from "../_components/auth-project-shell"

export const dynamic = "force-dynamic"
export const metadata = { title: "Confirm email change" }

/**
 * Email-change consume landing — yeni email adresine giden mail link'i.
 *   /p/{slug}/email-change?token={apt_...}
 *
 * Token consume + user.email update + tüm session'ları revoke.
 */

interface Props {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ token?: string | string[] }>
}

export default async function EmailChangePage({ params, searchParams }: Props) {
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
      <AuthProjectShell project={project} title="Email change">
        <Err message="No confirmation token provided." />
      </AuthProjectShell>
    )
  }
  const consume = await authProjectTokenModel.consume(token, "email-change")
  if (!consume.ok) {
    return (
      <AuthProjectShell project={project} title="Email change">
        <Err
          message={
            consume.reason === "expired"
              ? "This confirmation link has expired."
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
      <AuthProjectShell project={project} title="Email change">
        <Err message="This link doesn't belong to this project." />
      </AuthProjectShell>
    )
  }
  const newEmail = (consume.token.payload as { newEmail?: string } | null)?.newEmail
  if (!newEmail) {
    return (
      <AuthProjectShell project={project} title="Email change">
        <Err message="Confirmation payload missing." />
      </AuthProjectShell>
    )
  }
  const user = await authProjectUserModel.changeEmail(
    consume.token.userId,
    newEmail,
  )
  if (!user) {
    return (
      <AuthProjectShell project={project} title="Email change">
        <Err message="That email is already in use; pick another." />
      </AuthProjectShell>
    )
  }
  await authProjectSessionModel.revokeAllForUser(project.id, user.id)

  return (
    <AuthProjectShell project={project} title="Email changed">
      <div className="space-y-3 text-center">
        <p className="text-base font-medium">Your new email is confirmed.</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{user.email}</span> is now your account
          address. All other sessions have been signed out — sign in again
          on your devices.
        </p>
      </div>
    </AuthProjectShell>
  )
}

function Err({ message }: { message: string }) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-sm text-destructive">{message}</p>
    </div>
  )
}

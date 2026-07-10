import { notFound } from "next/navigation"
import { authProjectModel, authProjectTokenModel } from "@workspace/db/models"
import { AuthProjectShell } from "../../_components/auth-project-shell"
import { InvitationAcceptForm } from "./invitation-accept-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Accept invitation" }

interface Props {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ token?: string | string[] }>
}

/**
 * Invitation accept landing — admin'in invite ettiği user mail link'inden
 * gelir, password set ile hesabını oluşturur.
 */
export default async function InvitationAcceptPage({
  params,
  searchParams,
}: Props) {
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
      <AuthProjectShell project={project} title="Accept invitation">
        <p className="text-sm text-destructive text-center">No invitation token.</p>
      </AuthProjectShell>
    )
  }

  // Token consume DEĞİL, sadece varlık check (form submit'inde consume olur)
  const found = await authProjectTokenModel.findByToken(token, "invitation")
  if (
    !found ||
    found.authProjectId !== project.id ||
    found.consumedAt ||
    found.expiresAt < new Date()
  ) {
    return (
      <AuthProjectShell project={project} title="Accept invitation">
        <p className="text-sm text-destructive text-center">
          This invitation is invalid or expired.
        </p>
      </AuthProjectShell>
    )
  }

  const email = (found.payload as { email?: string } | null)?.email ?? null
  if (!email) {
    return (
      <AuthProjectShell project={project} title="Accept invitation">
        <p className="text-sm text-destructive text-center">
          Invitation payload missing.
        </p>
      </AuthProjectShell>
    )
  }

  return (
    <AuthProjectShell project={project} title="Set your password">
      <p className="text-sm text-muted-foreground text-center pb-3">
        You've been invited to {project.branding.displayName || project.name} as
        <span className="font-medium"> {email}</span>. Set a password to finish.
      </p>
      <InvitationAcceptForm
        projectSlug={project.slug}
        token={token}
        email={email}
        passwordPolicy={project.passwordPolicy}
        primaryColor={project.branding.primaryColor}
      />
    </AuthProjectShell>
  )
}

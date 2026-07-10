import { notFound } from "next/navigation"
import {
  authProjectModel,
  authProjectUserModel,
  authProjectSessionModel,
  authProjectTokenModel,
} from "@workspace/db/models"
import { AuthProjectShell } from "../_components/auth-project-shell"

export const dynamic = "force-dynamic"
export const metadata = { title: "Confirm account deletion" }

interface Props {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ token?: string | string[] }>
}

/**
 * Account-delete consume landing.
 * Tıklandığında hesabı kalıcı olarak siler — irreversible.
 */
export default async function AccountDeletePage({ params, searchParams }: Props) {
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
      <AuthProjectShell project={project} title="Account deletion">
        <p className="text-sm text-destructive text-center">No confirmation token.</p>
      </AuthProjectShell>
    )
  }
  const consume = await authProjectTokenModel.consume(token, "account-deletion")
  if (!consume.ok) {
    return (
      <AuthProjectShell project={project} title="Account deletion">
        <p className="text-sm text-destructive text-center">
          {consume.reason === "expired"
            ? "This link has expired. Request a new deletion."
            : consume.reason === "already-used"
              ? "This link has already been used."
              : "Invalid link."}
        </p>
      </AuthProjectShell>
    )
  }
  if (consume.token.authProjectId !== project.id) {
    return (
      <AuthProjectShell project={project} title="Account deletion">
        <p className="text-sm text-destructive text-center">Wrong project.</p>
      </AuthProjectShell>
    )
  }
  const user = await authProjectUserModel.findById(consume.token.userId)
  if (!user) {
    return (
      <AuthProjectShell project={project} title="Account deleted">
        <p className="text-sm text-center">
          Account no longer exists.
        </p>
      </AuthProjectShell>
    )
  }
  await authProjectSessionModel.revokeAllForUser(project.id, user.id)
  await authProjectUserModel.remove(user.id)

  return (
    <AuthProjectShell project={project} title="Account deleted">
      <div className="space-y-3 text-center">
        <p className="text-base font-medium">Your account has been removed.</p>
        <p className="text-sm text-muted-foreground">
          All sessions ended and account data erased. You can close this tab.
        </p>
      </div>
    </AuthProjectShell>
  )
}

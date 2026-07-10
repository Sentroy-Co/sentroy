import { notFound } from "next/navigation"
import { authProjectModel } from "@workspace/db/models"
import { AuthProjectShell } from "../_components/auth-project-shell"
import { AccountClient } from "./account-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Account" }

/**
 * End-user account page — hosted self-service hub. Login form +
 * 4-tab management UI (Profile / Sessions / MFA / Danger zone).
 *
 * Token storage: sessionStorage (XSS yüzeyi var ama HTTP-only cookie
 * implementation v2 epic; hosted UI'nin v1 versiyonu bu pragmatik
 * trade-off ile gider).
 *
 * Server component sadece branding bilgisini fetch eder; tüm interaktif
 * logic AccountClient içinde.
 */

interface Props {
  params: Promise<{ projectSlug: string }>
}

export default async function AccountPage({ params }: Props) {
  const { projectSlug } = await params
  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project) notFound()

  return (
    <AuthProjectShell project={project} title="Your account">
      <AccountClient
        projectSlug={project.slug}
        projectName={project.branding.displayName || project.name}
        primaryColor={project.branding.primaryColor}
        magicLinkEnabled={project.magicLinkEnabled}
        socialGoogleEnabled={project.socialProviders?.google?.enabled ?? false}
        socialGithubEnabled={project.socialProviders?.github?.enabled ?? false}
      />
    </AuthProjectShell>
  )
}

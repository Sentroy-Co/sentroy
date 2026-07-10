import { notFound } from "next/navigation"
import { authProjectModel } from "@workspace/db/models"
import { AuthProjectShell } from "../_components/auth-project-shell"
import { HostedAuthForm } from "../_components/hosted-auth-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Create account" }

/**
 * Standalone hosted signup page.
 *   /p/{slug}/signup?redirectUri=https://app.example.com/callback
 *
 * emailVerificationRequired=true ise success'te "check inbox" info,
 * RP'ye token redirect verify sonrası (mail link açılınca) olur.
 * false ise hemen access+refresh + fragment redirect.
 */

interface Props {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ redirectUri?: string | string[] }>
}

export default async function HostedSignupPage({ params, searchParams }: Props) {
  const { projectSlug } = await params
  const sp = await searchParams
  const ruRaw = sp.redirectUri
  const redirectUri =
    typeof ruRaw === "string"
      ? ruRaw
      : Array.isArray(ruRaw)
        ? ruRaw[0] ?? null
        : null

  const project = await authProjectModel.findBySlug(projectSlug)
  if (!project || !project.enabled) notFound()

  return (
    <AuthProjectShell
      project={project}
      title={`Create your ${project.branding.displayName || project.name} account`}
    >
      <HostedAuthForm
        projectSlug={project.slug}
        primaryColor={project.branding.primaryColor}
        initialMode="signup"
        magicLinkEnabled={project.magicLinkEnabled}
        socialGoogleEnabled={project.socialProviders?.google?.enabled ?? false}
        socialGithubEnabled={project.socialProviders?.github?.enabled ?? false}
        passwordPolicy={project.passwordPolicy}
        redirectUri={redirectUri}
      />
    </AuthProjectShell>
  )
}

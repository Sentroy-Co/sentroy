import { notFound } from "next/navigation"
import { authProjectModel } from "@workspace/db/models"
import { AuthProjectShell } from "../_components/auth-project-shell"
import { HostedAuthForm } from "../_components/hosted-auth-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Sign in" }

/**
 * Standalone hosted login page.
 *   /p/{slug}/login?redirectUri=https://app.example.com/callback
 *
 * RP'ler "Sentroy hosted login" akışı kullanmak isterse buraya yönlendirir.
 * Success'te `redirectUri` fragment'ında access_token + refresh_token
 * döner (SPA window.location.hash parse).
 */

interface Props {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<{ redirectUri?: string | string[] }>
}

export default async function HostedLoginPage({ params, searchParams }: Props) {
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
    <AuthProjectShell project={project} title={`Sign in to ${project.branding.displayName || project.name}`}>
      <HostedAuthForm
        projectSlug={project.slug}
        primaryColor={project.branding.primaryColor}
        initialMode="login"
        magicLinkEnabled={project.magicLinkEnabled}
        socialGoogleEnabled={project.socialProviders?.google?.enabled ?? false}
        socialGithubEnabled={project.socialProviders?.github?.enabled ?? false}
        passwordPolicy={project.passwordPolicy}
        redirectUri={redirectUri}
      />
    </AuthProjectShell>
  )
}

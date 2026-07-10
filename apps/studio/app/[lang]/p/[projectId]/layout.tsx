import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { auth } from "@workspace/auth/server/auth"
import {
  studioProjectModel,
  companyModel,
  companyMemberModel,
} from "@workspace/db/models"

/**
 * Editor full-screen layout — header + sidebar tamamen yok.
 *
 * Dashboard layout'tan ayrı bir top-level segment (`/[lang]/p/[projectId]`)
 * sayesinde parent shell devre dışı. Editor'dan çıkış için "back to
 * dashboard" butonu editor'un kendi UI'ında.
 *
 * Auth: session + project membership check (project'in companyId'sine
 * member olmak yeterli). Project bulunmazsa veya erişim yoksa 404.
 */
export default async function EditorLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string; projectId: string }>
}) {
  const { lang, projectId } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    const coreUrl =
      process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"
    const studioUrl =
      process.env.NEXT_PUBLIC_STUDIO_APP_URL || "https://studio.sentroy.com"
    const callback = encodeURIComponent(`${studioUrl}/${lang}/p/${projectId}`)
    redirect(`${coreUrl}/${lang}/login?callbackUrl=${callback}`)
  }

  const project = await studioProjectModel.findById(projectId)
  if (!project) notFound()

  const company = await companyModel.findById(project.companyId)
  if (!company) notFound()

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  const isSystemAdmin = (session.user as { role?: string }).role === "admin"
  if (!member && !isSystemAdmin) notFound()

  return (
    <div className="min-h-svh bg-background text-foreground antialiased">
      {children}
    </div>
  )
}

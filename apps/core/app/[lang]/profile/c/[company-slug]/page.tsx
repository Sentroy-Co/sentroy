import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { companyModel, companyMemberModel } from "@workspace/db/models"
import { CompanyProfileContent } from "@workspace/console/components/profile/company-profile-content"

interface PageProps {
  params: Promise<{ lang: string; "company-slug": string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang, "company-slug": slug } = await params
  const company = await companyModel.findBySlug(slug.toLowerCase())
  if (!company) {
    const t = await getTranslations({ locale: lang, namespace: "publicProfile" })
    return { title: t("notFoundTitle") }
  }
  return { title: `${company.name} · Sentroy` }
}

/**
 * Company profile (`/[lang]/profile/c/[company-slug]`).
 *
 * Visibility is intranet-only: any non-member (anonymous or signed-in
 * but not in this company) gets a 404 redirect to `notFound()`. The
 * social feed pulled in by `CompanyFeed` reuses the same auth gate at
 * the API layer so even a leaked link can't surface posts.
 */
export default async function CompanyProfilePage({ params }: PageProps) {
  const { lang, "company-slug": slug } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    // Bounce to login then come back here. If they end up not being a
    // member after auth, the second visit will hit notFound().
    redirect(`/${lang}/login?redirect=/${lang}/profile/c/${slug}`)
  }

  const company = await companyModel.findBySlug(slug.toLowerCase())
  if (!company) notFound()

  const member = await companyMemberModel.findByCompanyAndUser(
    company.id,
    session.user.id,
  )
  if (!member || member.status !== "active") notFound()

  const allMembers = await companyMemberModel.findByCompany(company.id)
  const memberCount = allMembers.filter((m) => m.status === "active").length

  return (
    <CompanyProfileContent
      profile={{
        id: company.id,
        slug: company.slug,
        name: company.name,
        avatarUrl: company.avatarUrl ?? null,
        coverImageUrl: company.coverImageUrl ?? null,
        description: company.description ?? null,
        memberCount,
        canManage: member.role === "owner" || member.role === "admin",
      }}
      lang={lang}
      viewer={{
        id: session.user.id,
        name: session.user.name ?? null,
        image: (session.user as { image?: string | null }).image ?? null,
      }}
    />
  )
}

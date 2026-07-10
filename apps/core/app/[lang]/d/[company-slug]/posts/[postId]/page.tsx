import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import {
  socialPostModel,
  companyModel,
} from "@workspace/db/models"
import { hydratePosts } from "@/lib/social/hydrate"
import { PostDetailContent } from "@workspace/console/components/social/post-detail-content"

interface PageProps {
  params: Promise<{
    lang: string
    "company-slug": string
    postId: string
  }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params
  const t = await getTranslations({ locale: lang, namespace: "social" })
  return { title: t("postTitle") }
}

export default async function PostDetailPage({ params }: PageProps) {
  const { lang, "company-slug": slug, postId } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect(`/${lang}/login`)

  const company = await companyModel.findBySlug(slug)
  if (!company) notFound()

  const post = await socialPostModel.findById(postId)
  if (!post || post.companyId !== company.id || post.deletedAt) notFound()

  const [hydrated] = await hydratePosts([post], session.user.id)

  return (
    <PostDetailContent
      post={JSON.parse(JSON.stringify(hydrated))}
      lang={lang}
      companySlug={slug}
      viewer={{
        id: session.user.id,
        name: session.user.name ?? null,
        image: (session.user as { image?: string | null }).image ?? null,
      }}
    />
  )
}

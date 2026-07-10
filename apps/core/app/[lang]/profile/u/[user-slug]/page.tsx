import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getDb } from "@workspace/db/client"
import { getTranslations } from "next-intl/server"
import { auth } from "@workspace/auth/server/auth"
import { PublicUserProfile } from "@workspace/console/components/profile/public-user-profile"

interface PublicUser {
  id: string
  name: string
  image: string | null
  profileSlug: string
  bio: string | null
  headline: string | null
  location: string | null
  website: string | null
  coverImage: string | null
  socialLinks: Array<{ type: string; url: string }>
  createdAt: Date | null
}

async function loadPublicUser(slug: string): Promise<PublicUser | null> {
  const db = await getDb()
  const user = await db.collection("user").findOne(
    { profileSlug: slug.toLowerCase(), isPublicProfile: true },
    {
      projection: {
        _id: 1,
        name: 1,
        image: 1,
        profileSlug: 1,
        bio: 1,
        headline: 1,
        location: 1,
        website: 1,
        coverImage: 1,
        socialLinks: 1,
        createdAt: 1,
      },
    },
  )
  if (!user) return null
  return {
    id: user._id.toString(),
    name: (user.name as string) ?? "",
    image: (user.image as string | null | undefined) ?? null,
    profileSlug: user.profileSlug as string,
    bio: (user.bio as string | null | undefined) ?? null,
    headline: (user.headline as string | null | undefined) ?? null,
    location: (user.location as string | null | undefined) ?? null,
    website: (user.website as string | null | undefined) ?? null,
    coverImage: (user.coverImage as string | null | undefined) ?? null,
    socialLinks:
      (user.socialLinks as Array<{ type: string; url: string }> | undefined) ??
      [],
    createdAt: (user.createdAt as Date | null | undefined) ?? null,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; "user-slug": string }>
}): Promise<Metadata> {
  const { "user-slug": slug, lang } = await params
  const user = await loadPublicUser(slug)
  if (!user) return { title: "Profile not found" }
  const t = await getTranslations({ locale: lang, namespace: "publicProfile" })
  return {
    title: `${user.name} · ${t("title")}`,
    description: user.headline || user.bio || undefined,
    openGraph: {
      title: user.name,
      description: user.headline || user.bio || undefined,
      images: user.coverImage ? [user.coverImage] : undefined,
    },
  }
}

export default async function PublicUserProfilePage({
  params,
}: {
  params: Promise<{ lang: string; "user-slug": string }>
}) {
  const { lang, "user-slug": slug } = await params
  const user = await loadPublicUser(slug)
  if (!user) notFound()
  const session = await auth.api.getSession({ headers: await headers() })
  const viewer = session
    ? {
        id: session.user.id,
        name: session.user.name ?? null,
        image: (session.user as { image?: string | null }).image ?? null,
      }
    : null
  return <PublicUserProfile user={user} lang={lang} viewer={viewer} />
}

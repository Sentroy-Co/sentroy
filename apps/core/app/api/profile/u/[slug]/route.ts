export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

/**
 * GET /api/profile/u/[slug]
 *
 * Public — auth gerekmez. Sadece `isPublicProfile=true` olan ve
 * `profileSlug` matchleyen kullanıcıyı döner. Aksi halde 404 (kullanıcı
 * varlığını gizle, opt-out cevabı). Email/role/status gibi internal
 * alanlar response'a EKLENMEZ; yalnızca public-safe field set.
 *
 * Caller: /[lang]/profile/u/[user-slug] sayfası ve harici tüketiciler
 * (link önizleme, OG card vb.).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  if (!slug) return jsonError("Slug required", 400)

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

  if (!user) return jsonError("Profile not found", 404)

  return jsonSuccess({
    id: user._id.toString(),
    name: user.name,
    image: user.image ?? null,
    profileSlug: user.profileSlug,
    bio: user.bio ?? null,
    headline: user.headline ?? null,
    location: user.location ?? null,
    website: user.website ?? null,
    coverImage: user.coverImage ?? null,
    socialLinks: user.socialLinks ?? [],
    createdAt: user.createdAt ?? null,
  })
}

import { NextRequest } from "next/server"
import { getAuthSession, jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"

/** Tek bir social link kaydı — type whitelist + URL string. */
export type SocialLinkType =
  | "twitter"
  | "github"
  | "linkedin"
  | "instagram"
  | "youtube"
  | "facebook"
  | "mastodon"
  | "email"
  | "other"

export interface SocialLink {
  type: SocialLinkType
  url: string
}

const SOCIAL_TYPES: SocialLinkType[] = [
  "twitter",
  "github",
  "linkedin",
  "instagram",
  "youtube",
  "facebook",
  "mastodon",
  "email",
  "other",
]

function isSocialLinkType(value: unknown): value is SocialLinkType {
  return (
    typeof value === "string" &&
    SOCIAL_TYPES.includes(value as SocialLinkType)
  )
}

function normalizeSocialLinks(value: unknown): SocialLink[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: SocialLink[] = []
  for (const item of value as unknown[]) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    if (!isSocialLinkType(obj.type)) continue
    const url = typeof obj.url === "string" ? obj.url.trim().slice(0, 512) : ""
    if (!url) continue
    out.push({ type: obj.type, url })
    if (out.length >= 12) break
  }
  return out
}

/** Public + private profile alanlarını tek shape'te döner. */
function serializeUser(user: Record<string, unknown>) {
  return {
    id: (user._id as { toString(): string }).toString(),
    name: user.name as string | undefined,
    email: user.email as string | undefined,
    emailVerified: user.emailVerified as boolean | undefined,
    image: (user.image as string | null | undefined) ?? null,
    role: user.role as string | undefined,
    status: user.status as string | undefined,
    metadata: (user.metadata as Record<string, unknown>) || {},
    profileSlug: (user.profileSlug as string | null | undefined) ?? null,
    bio: (user.bio as string | null | undefined) ?? null,
    headline: (user.headline as string | null | undefined) ?? null,
    location: (user.location as string | null | undefined) ?? null,
    website: (user.website as string | null | undefined) ?? null,
    coverImage: (user.coverImage as string | null | undefined) ?? null,
    isPublicProfile: (user.isPublicProfile as boolean | undefined) ?? false,
    socialLinks: (user.socialLinks as SocialLink[] | undefined) ?? [],
    createdAt: user.createdAt as Date | undefined,
    updatedAt: user.updatedAt as Date | undefined,
  }
}

/** Slug validation: lowercase a-z 0-9 dash, 3-64 char, dash başta/sonda
 *  veya çift dash olamaz. Sentroy reserved slug'lar (admin, api, profile,
 *  system) yasak. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "profile",
  "system",
  "u",
  "c",
  "settings",
  "login",
  "signup",
  "logout",
  "d",
  "verify-email",
  "verify-email-pending",
  "two-factor",
  "reset-password",
  "setup",
])

function isValidSlug(slug: string): boolean {
  if (!SLUG_RE.test(slug)) return false
  if (RESERVED_SLUGS.has(slug)) return false
  if (slug.includes("--")) return false
  return true
}

export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  const db = await getDb()
  const user = await db
    .collection("user")
    .findOne({ _id: new ObjectId(session.user.id) })

  if (!user) {
    return jsonError("User not found", 404)
  }

  return jsonSuccess(serializeUser(user))
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) {
    return jsonError("Unauthorized", 401)
  }

  let body: {
    name?: string
    image?: string | null
    metadata?: { timezone?: string; locale?: string }
    profileSlug?: string | null
    bio?: string | null
    headline?: string | null
    location?: string | null
    website?: string | null
    coverImage?: string | null
    isPublicProfile?: boolean
    socialLinks?: SocialLink[]
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const updates: Record<string, unknown> = {}

  if (body.name && typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim()
  }

  // Avatar URL — null gönderilirse temizle, string gönderilirse set,
  // tanımsız ise dokunma. Public/private bucket ayrımı yapma — caller
  // (genelde MediaManager) public bucket'a upload eder, oradan URL alır.
  if (body.image !== undefined) {
    if (body.image === null || body.image === "") {
      updates.image = null
    } else if (typeof body.image === "string") {
      updates.image = body.image.trim()
    }
  }

  // Public profile alanları — hepsi null/string ile clear-or-set; URL
  // alanları temel format kontrolü yapılır ama protokol zorunlu değil
  // (kullanıcı `acme.io` yazarsa olduğu gibi saklarız, public render'da
  // protocol-relative link).

  const db = await getDb()

  if (body.profileSlug !== undefined) {
    if (body.profileSlug === null || body.profileSlug === "") {
      updates.profileSlug = null
    } else {
      const slug = body.profileSlug.trim().toLowerCase()
      if (!isValidSlug(slug)) {
        return jsonError(
          "profileSlug must be 3-64 chars: lowercase letters, digits, dashes; cannot start/end with dash or use reserved name",
          400,
        )
      }
      // Unique check — başkası kullanıyor mu?
      const existing = await db
        .collection("user")
        .findOne({
          profileSlug: slug,
          _id: { $ne: new ObjectId(session.user.id) },
        })
      if (existing) {
        return jsonError("This profile URL is already taken", 409)
      }
      updates.profileSlug = slug
    }
  }

  for (const key of [
    "bio",
    "headline",
    "location",
    "website",
    "coverImage",
  ] as const) {
    const value = body[key]
    if (value === undefined) continue
    if (value === null || value === "") {
      updates[key] = null
    } else if (typeof value === "string") {
      updates[key] = value.trim().slice(0, 1024)
    }
  }

  if (typeof body.isPublicProfile === "boolean") {
    updates.isPublicProfile = body.isPublicProfile
  }

  if (body.socialLinks !== undefined) {
    const normalized = normalizeSocialLinks(body.socialLinks)
    updates.socialLinks = normalized ?? []
  }

  if (body.metadata && typeof body.metadata === "object") {
    if (body.metadata.timezone) {
      updates["metadata.timezone"] = body.metadata.timezone
    }
    if (body.metadata.locale) {
      updates["metadata.locale"] = body.metadata.locale
    }
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("No valid fields to update")
  }

  updates.updatedAt = new Date()

  const result = await db
    .collection("user")
    .findOneAndUpdate(
      { _id: new ObjectId(session.user.id) },
      { $set: updates },
      { returnDocument: "after" },
    )

  if (!result) {
    return jsonError("Failed to update profile", 500)
  }

  return jsonSuccess(serializeUser(result))
}

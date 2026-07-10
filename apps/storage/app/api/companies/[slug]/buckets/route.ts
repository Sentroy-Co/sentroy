import { NextRequest } from "next/server"
import { jsonError, jsonSuccess, slugify } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import { bucketModel } from "@workspace/db/models"
import { isSystemManagedBucketSlug } from "@workspace/db/constants"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "storage.view")
  if ("error" in access) return access.error

  const buckets = await bucketModel.findUserVisibleByCompany(access.companyId)
  return jsonSuccess(buckets)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await resolveCompanyAccess(request, slug, "buckets.create")
  if ("error" in access) return access.error

  let body: {
    name?: string
    slug?: string
    description?: string
    isPublic?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("Bucket name is required")
  }

  const name = body.name.trim()
  const bucketSlug =
    typeof body.slug === "string" && body.slug.trim()
      ? body.slug.trim().toLowerCase()
      : slugify(name)

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bucketSlug)) {
    return jsonError(
      "Bucket slug must contain only lowercase letters, numbers, and hyphens",
    )
  }

  if (isSystemManagedBucketSlug(bucketSlug)) {
    return jsonError("This bucket slug is reserved for system-managed files")
  }

  const existing = await bucketModel.findBySlug(access.companyId, bucketSlug)
  if (existing) return jsonError("A bucket with this slug already exists", 409)

  const bucket = await bucketModel.create({
    companyId: access.companyId,
    name,
    slug: bucketSlug,
    description: body.description?.trim() || undefined,
    isPublic: Boolean(body.isPublic),
    storageUsed: 0,
    fileCount: 0,
  })

  return jsonSuccess(bucket, 201)
}

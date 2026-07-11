export const dynamic = "force-dynamic"

import { ObjectId } from "mongodb"
import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import {
  bucketFolderModel,
  bucketModel,
  mediaModel,
} from "@workspace/db/models"
import { normalizeFolderPath, toMediaFolder } from "@/lib/folders"

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "media.reorder")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  let body: { ids?: string[]; folder?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return jsonError("ids array required (non-empty)")
  }
  if (
    body.ids.some((id) => {
      if (typeof id !== "string" || !id) return true
      return !ObjectId.isValid(id)
    })
  ) {
    return jsonError("ids must be valid media ids")
  }

  const folderPath = normalizeFolderPath(body.folder ?? "")
  const mediaFolder = toMediaFolder(folderPath)
  if (folderPath) {
    await bucketFolderModel.create({
      companyId: access.companyId,
      bucketId: bucket.id,
      path: folderPath,
    })
  }

  const modified = await mediaModel.moveInBucket(bucket.id, body.ids, mediaFolder)
  return jsonSuccess({ modified, total: body.ids.length, folder: folderPath })
}

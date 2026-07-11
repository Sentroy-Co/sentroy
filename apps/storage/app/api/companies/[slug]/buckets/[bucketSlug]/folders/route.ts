export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { resolveCompanyAccess } from "@workspace/console/lib/access-token"
import {
  bucketFolderModel,
  bucketModel,
  mediaModel,
} from "@workspace/db/models"
import {
  DEFAULT_MEDIA_FOLDER,
  fromMediaFolder,
  normalizeFolderPath,
  toMediaFolder,
} from "@/lib/folders"
import { cdnDelete } from "@workspace/cdn-client"

interface FolderSummary {
  path: string
  fileCount: number
  storageUsed: number
  explicit: boolean
}

function addFolderSummary(
  summaries: Map<string, FolderSummary>,
  path: string,
  data: { fileCount?: number; storageUsed?: number; explicit?: boolean },
) {
  const normalized = normalizeFolderPath(path)
  if (!normalized || normalized === DEFAULT_MEDIA_FOLDER) return

  const parts = normalized.split("/")
  for (let i = 1; i <= parts.length; i++) {
    const current = parts.slice(0, i).join("/")
    const existing =
      summaries.get(current) ??
      ({
        path: current,
        fileCount: 0,
        storageUsed: 0,
        explicit: false,
      } satisfies FolderSummary)

    existing.fileCount += data.fileCount ?? 0
    existing.storageUsed += data.storageUsed ?? 0
    existing.explicit = existing.explicit || Boolean(data.explicit)
    summaries.set(current, existing)
  }
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "storage.view")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  const [explicitFolders, mediaFolders] = await Promise.all([
    bucketFolderModel.findByBucket(bucket.id),
    mediaModel.aggregateFolders(bucket.id),
  ])

  const summaries = new Map<string, FolderSummary>()
  for (const folder of explicitFolders) {
    addFolderSummary(summaries, folder.path, { explicit: true })
  }
  for (const folder of mediaFolders) {
    addFolderSummary(summaries, fromMediaFolder(folder.folder), {
      fileCount: folder.fileCount,
      storageUsed: folder.storageUsed,
    })
  }

  return jsonSuccess({
    folders: Array.from(summaries.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
  })
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "media.upload")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  let body: { path?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const path = normalizeFolderPath(body.path ?? "")
  if (!path || path === DEFAULT_MEDIA_FOLDER) {
    return jsonError("Valid folder path required")
  }

  const folder = await bucketFolderModel.create({
    companyId: access.companyId,
    bucketId: bucket.id,
    path,
  })

  return jsonSuccess(folder, 201)
}

/**
 * PATCH /folders — body { from, to }: bir folder'ı (ve descendant'larını)
 * yeniden adlandırır. Hem bucketFolders kaydında hem de tüm media
 * doc'larında folder field'ı güncellenir.
 *
 * Kurallar:
 *  - `from` mevcut bir explicit folder veya media içinde kullanılan path
 *  - `to` normalize edilir; default folder ("uploads") rezerv
 *  - Hedef path zaten varsa 409 conflict
 */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  // Folder rename "edit" benzeri bir mutasyon — media.upload yetkisi
  // upload akışından gelen bir hak, organize etme için aynı sınıf.
  const access = await resolveCompanyAccess(request, slug, "media.upload")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  let body: { from?: string; to?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const fromRaw = (body.from ?? "").trim()
  const toRaw = (body.to ?? "").trim()
  if (!fromRaw || !toRaw) return jsonError("from and to are required")

  const fromPath = normalizeFolderPath(fromRaw)
  const toPath = normalizeFolderPath(toRaw)
  if (!fromPath || fromPath === DEFAULT_MEDIA_FOLDER) {
    return jsonError("Cannot rename root folder")
  }
  if (!toPath || toPath === DEFAULT_MEDIA_FOLDER) {
    return jsonError("Target folder name is invalid or reserved")
  }
  if (fromPath === toPath) {
    return jsonSuccess({ renamed: 0, mediaUpdated: 0 })
  }

  // 1) Folder kayıt yeniden adlandırılır (descendant'lar dahil).
  //    Conflict varsa media'ya dokunmadan döner.
  const folderResult = await bucketFolderModel.rename(
    bucket.id,
    fromPath,
    toPath,
  )
  if (!folderResult.ok) {
    return NextResponse.json(
      {
        data: null,
        error: "Target folder already exists",
        conflict: folderResult.conflict,
      },
      { status: 409 },
    )
  }

  // 2) Media doc'larında folder field'ı bulk update (best-effort).
  //    Folder zaten yeni isme alındı; başarısızlık tehlikeli değil ama
  //    UI'da count tutarsız görünebilir.
  const mediaUpdated = await mediaModel.renameFolderPrefix(
    bucket.id,
    toMediaFolder(fromPath),
    toMediaFolder(toPath),
  )

  return jsonSuccess({
    from: fromPath,
    to: toPath,
    renamed: folderResult.renamed,
    mediaUpdated,
  })
}

/**
 * DELETE /folders?path=<encoded> — folder + descendant'larını ve içlerinde-
 * ki tüm media'ları siler. CDN tarafına paralel pool (8 worker) ile
 * S3 nesneleri silinir, ardından DB'de bucket-folder kayıtları + media
 * dokümanları temizlenir + bucket usage counter düşürülür.
 *
 * Default folder ("uploads" ~ root) silinemez — protect.
 *
 * Permission: media.delete (folder içindeki dosyaları siliyoruz, en geniş
 * destructive aksiyon).
 */
export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ slug: string; bucketSlug: string }>
  },
) {
  const { slug, bucketSlug } = await params
  const access = await resolveCompanyAccess(request, slug, "media.delete")
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug)
  if (!bucket) return jsonError("Bucket not found", 404)

  const url = new URL(request.url)
  const pathRaw = url.searchParams.get("path") ?? ""
  const folderPath = normalizeFolderPath(pathRaw)
  if (!folderPath || folderPath === DEFAULT_MEDIA_FOLDER) {
    return jsonError("Cannot delete root folder")
  }

  // Discriminated union narrowing closure'a taşınmadığı için snapshot.
  const companyId = access.companyId
  const callerUserId = access.callerUserId
  const bucketId = bucket.id

  // Folder ağacındaki tüm media'lar.
  const mediaFolder = toMediaFolder(folderPath)
  const targets = await mediaModel.findIdsInFolderTree(bucketId, mediaFolder)

  let succeededSize = 0
  const succeededIds: string[] = []
  const failed: string[] = []

  if (targets.length > 0) {
    const POOL = 8
    let cursor = 0
    async function worker() {
      while (cursor < targets.length) {
        const i = cursor++
        const m = targets[i]
        if (!m) continue
        try {
          await cdnDelete(
            {
              companyId,
              bucketId,
              userId: callerUserId,
            },
            m.id,
          )
          succeededIds.push(m.id)
          succeededSize += m.size
        } catch (err) {
          console.warn(
            `[folder delete] CDN delete failed for ${m.id}:`,
            err instanceof Error ? err.message : err,
          )
          failed.push(m.id)
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(POOL, targets.length) }, worker),
    )

    if (succeededIds.length > 0) {
      await mediaModel.deleteManyByIds(bucketId, succeededIds)
      await bucketModel.incrementUsage(bucketId, {
        storageUsed: -succeededSize,
        fileCount: -succeededIds.length,
      })
    }
  }

  // Folder kayıtları (descendant'lar dahil) — media silindikten sonra,
  // kullanıcı re-create ederse temiz başlasın.
  const removedFolders = await bucketFolderModel.removeFolderTree(
    bucketId,
    folderPath,
  )

  return jsonSuccess({
    path: folderPath,
    removedFolders,
    deletedMedia: succeededIds.length,
    failedMedia: failed,
    totalMedia: targets.length,
  })
}

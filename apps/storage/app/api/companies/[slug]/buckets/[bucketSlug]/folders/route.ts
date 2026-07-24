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
import type { StorageAccess } from "@workspace/db/types"
import {
  storageViewer,
  canViewItem,
  canManageItemAccess,
  callerHasPermission,
  parseStorageAccess,
} from "@/lib/storage-access"

interface FolderSummary {
  path: string
  fileCount: number
  storageUsed: number
  explicit: boolean
  /** Şirket-içi erişim tier'ı — UI markörü için. Derived klasörler everyone. */
  access: StorageAccess
  /** Klasörü oluşturan — "owner" tier + client-side "yönetebilir mi" için. */
  ownerUserId?: string
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
        access: "everyone",
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

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  // Erişim tier'ı: derived klasörler yalnız izleyicinin görebildiği
  // media'lardan sayılır; explicit klasörler tier'a göre süzülür.
  const viewer = storageViewer(access)
  const [explicitFolders, mediaFolders] = await Promise.all([
    bucketFolderModel.findByBucket(bucket.id),
    mediaModel.aggregateFolders(bucket.id, viewer),
  ])

  const summaries = new Map<string, FolderSummary>()
  // Tier/sahip markörü yalnız klasörün TAM path'ine iliştirilir (ata'lara değil).
  const accessByPath = new Map<string, StorageAccess>()
  const ownerByPath = new Map<string, string>()
  for (const folder of explicitFolders) {
    // Görünmüyorsa hiç ekleme — media zaten aggregateFolders'ta filtrelendi.
    if (!canViewItem(folder.access, folder.ownerUserId, access)) continue
    addFolderSummary(summaries, folder.path, { explicit: true })
    const np = normalizeFolderPath(folder.path)
    if (folder.access && folder.access !== "everyone") {
      accessByPath.set(np, folder.access)
    }
    if (folder.ownerUserId) ownerByPath.set(np, folder.ownerUserId)
  }
  for (const folder of mediaFolders) {
    addFolderSummary(summaries, fromMediaFolder(folder.folder), {
      fileCount: folder.fileCount,
      storageUsed: folder.storageUsed,
    })
  }

  return jsonSuccess({
    folders: Array.from(summaries.values())
      .map((s) => ({
        ...s,
        access: accessByPath.get(s.path) ?? s.access,
        ownerUserId: ownerByPath.get(s.path),
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
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

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  let body: { path?: string; access?: unknown }
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
    // "owner" (sadece ben) tier'ı için sahiplik referansı + varsayılan tier.
    ownerUserId: access.callerUserId,
    access:
      body.access !== undefined ? parseStorageAccess(body.access) : "everyone",
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
  // Üyelik yeter; yetkiyi branch'e göre değerlendir (access → sahip/yönetici,
  // rename → media.upload).
  const access = await resolveCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
  if (!bucket) return jsonError("Bucket not found", 404)

  let body: { from?: string; to?: string; path?: string; access?: unknown }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  // ── Erişim tier'ı ayarı: body { path, access } ──────────────────────────
  // Klasörü (+ descendant media'yı) private/public yapar. Yalnız klasör
  // sahibi veya şirket sahibi/yöneticisi. Rename ({from,to}) ile ayrı branch.
  if (body.access !== undefined) {
    const path = normalizeFolderPath(body.path ?? "")
    if (!path || path === DEFAULT_MEDIA_FOLDER) {
      return jsonError("Valid folder path required")
    }
    const nextAccess = parseStorageAccess(body.access)
    const folderDoc = await bucketFolderModel.findByPath(bucket.id, path)
    if (!canManageItemAccess(folderDoc?.ownerUserId, access)) {
      return jsonError("Cannot change this folder's visibility", 403)
    }
    // 1) Klasör doc'unu upsert (derived-only ise oluşturur) + tier'ı yaz.
    await bucketFolderModel.setAccess(
      bucket.id,
      access.companyId,
      path,
      nextAccess,
      access.callerUserId,
    )
    // 2) İçerikteki media'ya cascade → dosya görünürlüğü tek kaynaktan yürür.
    const mediaUpdated = await mediaModel.setFolderAccess(
      bucket.id,
      toMediaFolder(path),
      nextAccess,
    )
    return jsonSuccess({ path, access: nextAccess, mediaUpdated })
  }

  // Rename bir organize/edit mutasyonu → media.upload yetkisi gerekir.
  if (!(await callerHasPermission(access, slug, "media.upload"))) {
    return jsonError("Insufficient permissions", 403)
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
  // Üyelik yeter; silme yetkisi "media.delete VEYA klasör sahipliği" ile.
  const access = await resolveCompanyAccess(request, slug)
  if ("error" in access) return access.error

  const bucket = await bucketModel.findUserVisibleBySlug(access.companyId, bucketSlug, storageViewer(access))
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

  // Yetki yoksa: yalnız klasörün SAHİBİ ve ağaçta BAŞKASINA ait dosya yoksa
  // silebilir (başkalarının dosyaları sahiplik üzerinden silinemesin).
  if (!(await callerHasPermission(access, slug, "media.delete"))) {
    const folderDoc = await bucketFolderModel.findByPath(bucketId, folderPath)
    const isOwner =
      !!folderDoc?.ownerUserId && folderDoc.ownerUserId === callerUserId
    if (!isOwner) {
      return jsonError("Cannot delete this folder", 403)
    }
    if (
      await mediaModel.hasForeignInFolderTree(
        bucketId,
        toMediaFolder(folderPath),
        callerUserId,
      )
    ) {
      return jsonError(
        "Folder contains files owned by others — delete permission required",
        403,
      )
    }
  }

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

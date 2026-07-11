export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { ObjectId } from "mongodb"
import {
  getAuthSession,
  jsonError,
  jsonSuccess,
} from "@workspace/console/lib/api-helpers"
import { getDb } from "@workspace/db/client"

/**
 * Admin-only DB diagnostic endpoint — media listesi neden boş gözüktüğünü
 * teşhis için. CDN-server'ın yazdığı doc'ların gerçekten storage app'in
 * okuduğu DB'de mi olduğunu, hangi koleksiyon adıyla yazıldığını ve
 * bucketId/companyId field'larının tipini gösterir.
 *
 * GET /api/admin/db-debug?bucketId=...
 *
 * Response:
 *   - dbName               → şu an okuduğumuz DB
 *   - collections          → DB'deki tüm koleksiyon adları (media/medias/Media farkını yakalar)
 *   - mediaCollectionStats → "media" koleksiyonu var mı, kaç doc, sample doc shape
 *   - bucketIdMatches      → string + ObjectId variant'larıyla kaç doc match ediyor
 *
 * Üretimde bırakmaya değer değil — geçici teşhis için. Düzeldikten sonra
 * silinebilir veya feature flag arkasına alınabilir.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)
  if ((session.user as { role?: string }).role !== "admin") {
    return jsonError("Admin only", 403)
  }

  const bucketId = request.nextUrl.searchParams.get("bucketId")
  if (!bucketId) return jsonError("bucketId query param required")

  const db = await getDb()

  // 1) Hangi DB'deyiz? (storage app'in okuduğu)
  const dbName = db.databaseName

  // 2) Tüm koleksiyon adları — media / medias / Media farkını gör
  const collInfos = await db.listCollections().toArray()
  const collections = collInfos.map((c) => c.name).sort()

  // 3) "media" koleksiyonu durumu
  const mediaColl = db.collection("media")
  const mediaTotalCount = await mediaColl.estimatedDocumentCount()
  const sampleDoc = (await mediaColl.findOne({})) as Record<
    string,
    unknown
  > | null

  const sampleSummary = sampleDoc
    ? {
        _idType: typeof sampleDoc._id,
        _idCtor: (sampleDoc._id as { constructor?: { name?: string } })
          ?.constructor?.name,
        bucketIdValue: sampleDoc.bucketId,
        bucketIdType: typeof sampleDoc.bucketId,
        bucketIdCtor: (sampleDoc.bucketId as { constructor?: { name?: string } })
          ?.constructor?.name,
        companyIdValue: sampleDoc.companyId,
        companyIdType: typeof sampleDoc.companyId,
        companyIdCtor: (sampleDoc.companyId as { constructor?: { name?: string } })
          ?.constructor?.name,
        keys: Object.keys(sampleDoc),
      }
    : null

  // 4) Verilen bucketId için string + ObjectId match counts
  let oid: ObjectId | null = null
  try {
    oid = new ObjectId(bucketId)
  } catch {
    /* not a valid 24-char hex */
  }

  const stringMatchCount = await mediaColl.countDocuments({
    bucketId: bucketId,
  })
  const oidMatchCount = oid
    ? await mediaColl.countDocuments({ bucketId: oid })
    : 0
  const inMatchCount = oid
    ? await mediaColl.countDocuments({
        bucketId: { $in: [bucketId, oid] },
      })
    : stringMatchCount

  return jsonSuccess({
    dbName,
    collections,
    mediaCollectionStats: {
      name: "media",
      totalCount: mediaTotalCount,
      sample: sampleSummary,
    },
    bucketIdQueried: bucketId,
    bucketIdMatches: {
      stringFilter: stringMatchCount,
      objectIdFilter: oidMatchCount,
      inFilter: inMatchCount,
    },
  })
}

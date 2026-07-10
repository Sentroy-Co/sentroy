import { MongoClient, ObjectId } from "mongodb"

/**
 * Comments-as-posts migrasyonu — `social_comments` kayıtlarını `social_posts`'a
 * (yanıt = parentId/rootId'li post) taşır ve yorum reaksiyonlarını
 * (`social_reactions` targetType="comment") yeni post'lara remap eder.
 *
 * GÜVENLİK / ÜRETİM:
 *  - VARSAYILAN DRY-RUN: hiçbir şey yazmaz, yalnız ne yapacağını raporlar.
 *  - Yazmak için `--apply` gerekir.
 *  - Idempotent: taşınan yorum `migratedToPostId` ile işaretlenir → tekrar
 *    çalıştırma çift kayıt yaratmaz. Reaksiyon remap yalnız targetType="comment"
 *    olanları işler (post'a dönenler atlanır).
 *  - ROLLBACK: `--rollback` migrasyonla yaratılan post'ları (`migratedFromCommentId`
 *    dolu) ve remap edilen reaksiyonları geri alır; yorum kayıtları DOKUNULMAZ
 *    (silinmez) → kaynak veri korunur, geri alınabilir.
 *
 * Çalıştırma (sunucuda, mongo erişimli):
 *   bunx tsx apps/core/scripts/migrate-comments-to-posts.ts            # dry-run
 *   bunx tsx apps/core/scripts/migrate-comments-to-posts.ts --apply    # uygula
 *   bunx tsx apps/core/scripts/migrate-comments-to-posts.ts --rollback # geri al
 *
 * EXPLAIN/cost: koleksiyon başına tam tarama (social_comments + comment
 * reaksiyonları). Intranet hacmi küçük; yine de düşük-trafik penceresinde çalıştır.
 */

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error("MONGODB_URI is not set")
  process.exit(1)
}

const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")

async function main() {
  const client = new MongoClient(uri!)
  await client.connect()
  const db = client.db(process.env.MONGODB_DATABASE)
  const posts = db.collection("social_posts")
  const comments = db.collection("social_comments")
  const reactions = db.collection("social_reactions")

  console.log(
    `[migrate] mode=${ROLLBACK ? "ROLLBACK" : APPLY ? "APPLY" : "DRY-RUN"}`,
  )

  if (ROLLBACK) {
    const migrated = await posts.countDocuments({ migratedFromCommentId: { $exists: true } })
    const remapped = await reactions.countDocuments({ remappedFromComment: true })
    console.log(`[rollback] ${migrated} taşınan post + ${remapped} remap reaksiyon geri alınacak`)
    if (APPLY) {
      // reaksiyonları yoruma geri çevir
      const cursor = reactions.find({ remappedFromComment: true })
      for await (const r of cursor) {
        await reactions.updateOne(
          { _id: r._id },
          {
            $set: { targetType: "comment", targetId: r.originalCommentId },
            $unset: { remappedFromComment: "", originalCommentId: "" },
          },
        )
      }
      await posts.deleteMany({ migratedFromCommentId: { $exists: true } })
      await comments.updateMany(
        { migratedToPostId: { $exists: true } },
        { $unset: { migratedToPostId: "" } },
      )
      console.log("[rollback] tamamlandı")
    } else {
      console.log("[rollback] DRY-RUN — --apply ile uygula")
    }
    await client.close()
    return
  }

  // ── 1. Yorumları post'a taşı ────────────────────────────────────────────
  const pending = await comments.find({ migratedToPostId: { $exists: false } }).toArray()
  console.log(`[migrate] ${pending.length} taşınacak yorum`)

  const commentToPost = new Map<string, string>()
  let created = 0
  for (const c of pending) {
    const newId = new ObjectId()
    const doc = {
      _id: newId,
      companyId: c.companyId,
      authorUserId: c.authorUserId,
      text: c.text ?? "",
      bodyHtml: null,
      mentions: [] as string[],
      attachments: [] as unknown[],
      repostOf: null,
      parentId: String(c.postId),
      rootId: String(c.postId),
      visibility: "members",
      commentCount: 0,
      reactionCount: typeof c.reactionCount === "number" ? c.reactionCount : 0,
      repostCount: 0,
      deletedAt: c.deletedAt ?? null,
      createdAt: c.createdAt ?? new Date(),
      updatedAt: c.createdAt ?? new Date(),
      migratedFromCommentId: c._id.toString(),
    }
    commentToPost.set(c._id.toString(), newId.toString())
    if (APPLY) {
      await posts.insertOne(doc)
      await comments.updateOne(
        { _id: c._id },
        { $set: { migratedToPostId: newId.toString() } },
      )
    }
    created++
  }
  console.log(`[migrate] ${created} post yaratıldı${APPLY ? "" : " (dry-run)"}`)

  // ── 2. Yorum reaksiyonlarını yeni post'lara remap et ────────────────────
  // Önceki çalıştırmalardan taşınanlar dahil tüm comment→post haritası.
  const allMigrated = await comments
    .find({ migratedToPostId: { $exists: true } })
    .project({ _id: 1, migratedToPostId: 1 })
    .toArray()
  const fullMap = new Map<string, string>(commentToPost)
  for (const m of allMigrated) fullMap.set(m._id.toString(), String(m.migratedToPostId))

  const commentReactions = await reactions.find({ targetType: "comment" }).toArray()
  let remapped = 0
  let orphaned = 0
  for (const r of commentReactions) {
    const newTarget = fullMap.get(String(r.targetId))
    if (!newTarget) {
      orphaned++
      continue
    }
    if (APPLY) {
      await reactions.updateOne(
        { _id: r._id },
        {
          $set: {
            targetType: "post",
            targetId: newTarget,
            originalCommentId: String(r.targetId),
            remappedFromComment: true,
          },
        },
      )
    }
    remapped++
  }
  console.log(
    `[migrate] ${remapped} reaksiyon remap${APPLY ? "" : " (dry-run)"}${orphaned ? ` · ${orphaned} eşleşmeyen (atlandı)` : ""}`,
  )

  // ── 3. Ebeveyn post'ların yanıt sayacını yeniden hesapla ────────────────
  const parentIds = Array.from(new Set(pending.map((c) => String(c.postId))))
  let recounted = 0
  for (const pid of parentIds) {
    if (!ObjectId.isValid(pid)) continue
    const count = await posts.countDocuments({ parentId: pid, deletedAt: null })
    if (APPLY) {
      await posts.updateOne({ _id: new ObjectId(pid) }, { $set: { commentCount: count } })
    }
    recounted++
  }
  console.log(`[migrate] ${recounted} ebeveyn post yanıt sayacı güncellendi${APPLY ? "" : " (dry-run)"}`)

  if (!APPLY) console.log("[migrate] DRY-RUN — değişiklik yazılmadı. Uygulamak için --apply.")
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

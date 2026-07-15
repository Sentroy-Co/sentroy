// Kullanıcı verisi sweep'i — hesap silmenin son adımı. Şirket kaskadları
// (deleteCompanyCascade) bittikten SONRA çağrılır.
//
// KASITLI TUTULANLAR:
//  - audit_logs        → uyum kaydı (userId dangling kabul)
//  - system_purchases  → finansal kayıt (muhasebe saklama)
//  - contact_messages  → inbound iletişim arşivi
//  - social_comments   → başkalarının gönderilerindeki yorum bütünlüğü
//    (yazar hesabı silinir; yorum "silinmiş kullanıcı" olarak kalır)
import { getDb } from "@workspace/db/client"

const USER_KEYED = [
  "user_notifications",
  "user_passkeys",
  "user_tool_entitlements",
  "os_preferences",
  "push_subscriptions",
  "mail_push_events",
  "linear_push_subscriptions",
  "linear_inbox_seen",
  "notes",
  "note_folders",
  "note_widget_placements",
  "social_posts",
  "social_reactions",
  "studio_projects",
  "studio_fx_presets",
  "app_installs",
  "app_reviews",
  "oauth_consents",
  "oauth_access_tokens",
  "oauth_refresh_tokens",
  "oauth_authorization_codes",
  "company_members", // kalan üyelikler (owner OLMADIĞI şirketler)
  "account_deletion_requests",
] as const

export interface UserPurgeResult {
  deleted: Record<string, number>
  errors: string[]
}

/** Kullanıcıya ait tüm uygulama verisi + better-auth kayıtları + user dokümanı. */
export async function purgeUserData(userId: string, email: string): Promise<UserPurgeResult> {
  const db = await getDb()
  const deleted: Record<string, number> = {}
  const errors: string[] = []

  const del = async (coll: string, filter: Record<string, unknown>) => {
    try {
      const r = await db.collection(coll).deleteMany(filter)
      if (r.deletedCount > 0) deleted[coll] = (deleted[coll] ?? 0) + r.deletedCount
    } catch (err) {
      errors.push(`${coll}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Studio proje veri blobları (projectId ile bağlı) — projeleri silmeden önce topla.
  try {
    const studio = await db
      .collection("studio_projects")
      .find({ userId }, { projection: { _id: 1 } })
      .toArray()
    if (studio.length > 0) {
      await del("studio_project_data", { projectId: { $in: studio.map((d) => d._id.toString()) } })
    }
  } catch (err) {
    errors.push(`studio_project_data: ${err instanceof Error ? err.message : String(err)}`)
  }

  for (const coll of USER_KEYED) {
    await del(coll, { userId })
  }

  // better-auth koleksiyonları (mongodb adapter varsayılan adları) + custom 2FA.
  await del("session", { userId })
  await del("account", { userId })
  await del("twoFactor", { userId })
  // verification kayıtları identifier=email ile tutulur (OTP/magic-link).
  await del("verification", { identifier: email })
  await del("verification", { identifier: `sign-in-otp-${email}` })

  // En son user dokümanı.
  try {
    const { ObjectId } = await import("mongodb")
    const r = await db.collection("user").deleteOne(
      ObjectId.isValid(userId) ? { _id: new ObjectId(userId) } : ({ id: userId } as never),
    )
    if (r.deletedCount > 0) deleted["user"] = 1
    else errors.push("user: document not found by id")
  } catch (err) {
    errors.push(`user: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { deleted, errors }
}

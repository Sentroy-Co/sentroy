// Company data sweep — company DELETE kaskadının "geri kalan her şey" adımı.
// 2026-07-15 cascade denetimi ~40 companyId-anahtarlı koleksiyonun silinmediğini
// ve 6 sınıfın CANLI kaldığını buldu (auth projects auth vermeye, oauth token
// basmaya, env-vault secret servis etmeye, whatsapp köprüsü mesaj yazmaya,
// polar faturalamaya, status page bildirim atmaya devam ediyordu). Bu sweep
// veri satırlarını köklerinden siler; satır yoksa canlı yol da ölür (hepsi
// satır-varlığına bakar).
//
// KASITLI TUTULANLAR:
//  - audit_logs        → uyum/forensik kaydı (companyId dangling kabul edilir)
//  - system_purchases  → finansal kayıt (muhasebe saklama yükümlülüğü)
//  - contact_messages  → inbound iletişim kaydı (kişi companye ait değil)
import { getDb } from "@workspace/db/client"
import { getPolarClient } from "./polar/client"
import type { Company } from "@workspace/db/types"

/** Düz companyId-anahtarlı koleksiyonlar (tek deleteMany yeterli). */
const COMPANY_KEYED = [
  "access_tokens",
  "app_installs",
  "bucketFolders",
  "catch_all_rules",
  "company_invitations",
  "company_ownership_transfers",
  "contacts",
  "domain_assignments",
  "inbox_blocks",
  "linear_settings",
  "linear_image_assets",
  "linear_push_subscriptions",
  "linear_inbox_seen",
  "mail_categories",
  "mail_folders",
  "mail_rules",
  "mail_template_sources",
  "mail_template_thumbnails",
  "mongo_backup_jobs", // not: S3'teki dump artefaktları backup app'in kovasında kalır (ayrı temizlik)
  "mongo_connections", // şifreli müşteri Mongo URI'leri — kesin silinmeli
  "note_folders",
  "note_widget_placements",
  "notes",
  "os_preferences",
  "polar_events",
  "smtp_credentials",
  "social_comments",
  "social_posts",
  "social_reactions",
  "studio_fx_presets",
  "webhook_deliveries",
  "whatsapp_audiences",
  "whatsapp_auth_keys", // canlı Baileys kimlik anahtarları — gateway resume edemez olur
  "whatsapp_contacts",
  "whatsapp_messages",
  "whatsapp_send_logs",
  "whatsapp_sessions",
  "whatsapp_templates",
] as const

export interface CompanyPurgeResult {
  deleted: Record<string, number>
  polarCancelled: boolean | null // null = abonelik yoktu
  errors: string[]
}

/**
 * Şirkete bağlı TÜM uygulama verisini siler (buckets/media/mail-server hariç —
 * onlar kaskadın kendi adımları). İdempotent; kısmi hatada devam eder ve
 * hataları raporlar (veri temizliği best-effort'tan sıkıdır ama tek koleksiyon
 * hatası tüm silmeyi kilitlememeli — kalanlar tekrar denemede süpürülür).
 */
export async function purgeCompanyData(company: Company): Promise<CompanyPurgeResult> {
  const db = await getDb()
  const companyId = company.id
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

  const ids = async (coll: string, filter: Record<string, unknown>): Promise<string[]> => {
    try {
      const docs = await db.collection(coll).find(filter, { projection: { _id: 1 } }).toArray()
      return docs.map((d) => d._id.toString())
    } catch {
      return []
    }
  }

  // ── 0. Polar aboneliğini iptal et (best-effort ama loglanır) ──
  let polarCancelled: boolean | null = null
  const subId = company.subscription?.polarSubscriptionId
  if (subId) {
    polarCancelled = false
    try {
      const polarCtx = await getPolarClient()
      if (polarCtx) {
        // Anında iptal — şirket siliniyor, dönem sonunu bekletmenin anlamı yok.
        await polarCtx.client.subscriptions.revoke({ id: subId })
        polarCancelled = true
      } else {
        errors.push("polar: client not configured — subscription NOT cancelled")
      }
    } catch (err) {
      errors.push(`polar revoke: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── 1. Düz companyId koleksiyonları ──
  for (const coll of COMPANY_KEYED) {
    await del(coll, { companyId })
  }

  // user_notifications — companyId meta içinde taşınır.
  await del("user_notifications", { "meta.companyId": companyId })

  // contact_lists + üyeleri (listId ile bağlı)
  const listIds = await ids("contact_lists", { companyId })
  await del("contact_lists", { companyId })
  if (listIds.length > 0) await del("contact_list_members", { listId: { $in: listIds } })

  // ── 2. Auth Projects (Auth-as-a-Service) — proje + TÜM end-user havuzu ──
  const authProjectIds = await ids("auth_projects", { companyId })
  if (authProjectIds.length > 0) {
    const byProject = { authProjectId: { $in: authProjectIds } }
    for (const coll of [
      "auth_users",
      "auth_project_sessions",
      "auth_project_tokens",
      "auth_project_user_externals",
      "auth_project_user_mfa",
      "auth_project_user_passkeys",
      "auth_project_webhooks",
      "auth_project_webhook_deliveries",
      "auth_project_mail_templates",
    ]) {
      await del(coll, byProject)
    }
    await del("auth_projects", { companyId })
  }

  // ── 3. OAuth clients ("Sign in with Sentroy") + token zinciri ──
  const clientIds = await ids("oauth_clients", { companyId })
  if (clientIds.length > 0) {
    const byClient = { clientId: { $in: clientIds } }
    for (const coll of [
      "oauth_access_tokens",
      "oauth_refresh_tokens",
      "oauth_authorization_codes",
      "oauth_consents",
    ]) {
      await del(coll, byClient)
    }
    await del("oauth_clients", { companyId })
  }

  // ── 4. Env vault — proje + değişkenler + tokenlar ──
  const envProjectIds = await ids("env_projects", { companyId })
  if (envProjectIds.length > 0) {
    const byProject = { projectId: { $in: envProjectIds } }
    for (const coll of ["env_variables", "env_tokens", "env_webhooks", "env_audit_log"]) {
      await del(coll, byProject)
    }
    await del("env_projects", { companyId })
  }

  // ── 5. Status page + tüm çocukları (abonelikler, şifreli restart hedefleri) ──
  const pageIds = await ids("status_pages", { companyId })
  if (pageIds.length > 0) {
    const byPage = { pageId: { $in: pageIds } }
    for (const coll of [
      "status_checks",
      "status_components",
      "status_incidents",
      "status_maintenances",
      "status_notify_deliveries",
      "status_probe_events",
      "status_restart_targets", // şifreli SSH anahtarları / Coolify tokenları
      "status_subscribers",
      "status_uptime_rollups",
    ]) {
      await del(coll, byPage)
    }
    await del("status_pages", { companyId })
  }

  // ── 6. Studio projeleri + veri blobları ──
  const studioIds = await ids("studio_projects", { companyId })
  if (studioIds.length > 0) {
    await del("studio_project_data", { projectId: { $in: studioIds } })
    await del("studio_projects", { companyId })
  }

  return { deleted, polarCancelled, errors }
}

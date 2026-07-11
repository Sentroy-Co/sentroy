export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import { landingAppModel, auditLogModel } from "@workspace/db/models"
import { serverRootDomain, subAppOrigin } from "@workspace/auth/lib/domains"

// mail/storage `<sub>.<root>` — ROOT_DOMAIN'den (default sentroy.com → aynı).
// macmac ayrı bir Sentroy ürünü (sentroy.cloud); `<sub>.<root>` deseni değil,
// markalı bırakılır (plan kararı: hosted ürün URL'leri türetilmez).
const ROOT = serverRootDomain()

/**
 * POST /api/admin/landing/apps/ensure-defaults
 *
 * Sentroy ekosistemindeki "core" landing app'leri (mail, storage, macmac)
 * eksikse ekler. Mevcut kayıtları DEĞİŞTİRMEZ — admin custom edit yaptıysa
 * korunur. Sadece `key` collision YOKSA insert.
 *
 * Yeni bir resmi app çıktığında (örn macmac) burayı güncelle, admin tek
 * tıkla ekler. Idempotent — tekrar çağırmak güvenli.
 */
const DEFAULT_APPS = [
  {
    key: "mail",
    name: { en: "Mail", tr: "Mail" },
    tagline: {
      en: "Transactional email that just works.",
      tr: "Çalışan transactional e-posta.",
    },
    description: {
      en: "Send and receive email, manage domains and templates with built-in deliverability.",
      tr: "E-posta gönder/al, domain ve şablonları yönet — entegre teslim edilebilirlik.",
    },
    iconKey: "MailSend02Icon",
    ctaUrl: subAppOrigin(ROOT, "mail"),
    ctaLabel: { en: "Open Mail", tr: "Mail'i aç" },
    sdkExampleKey: "mail-send",
    order: 0,
    enabled: true,
  },
  {
    key: "storage",
    name: { en: "Storage", tr: "Storage" },
    tagline: {
      en: "Upload, organize, serve.",
      tr: "Yükle, organize et, serve et.",
    },
    description: {
      en: "Object storage with buckets, signed URLs, and direct CDN delivery.",
      tr: "Bucket'lar, signed URL'ler ve doğrudan CDN ile object storage.",
    },
    iconKey: "FolderLibraryIcon",
    ctaUrl: subAppOrigin(ROOT, "storage"),
    ctaLabel: { en: "Open Storage", tr: "Storage'ı aç" },
    sdkExampleKey: "storage-upload",
    order: 1,
    enabled: true,
  },
  {
    key: "macmac",
    name: { en: "MacMac", tr: "MacMac" },
    tagline: {
      en: "macOS automation in the Sentroy ecosystem.",
      tr: "Sentroy ekosisteminde macOS otomasyonu.",
    },
    description: {
      en: "Headless macOS workflows: build queues, signing, screenshots, store delivery — orchestrated from one dashboard.",
      tr: "Headless macOS akışları: build kuyruğu, signing, screenshot, store teslim — tek panelden.",
    },
    iconKey: "BotIcon",
    ctaUrl: "https://macmac.sentroy.cloud",
    ctaLabel: { en: "Open MacMac", tr: "MacMac'i aç" },
    sdkExampleKey: null,
    order: 2,
    enabled: true,
  },
]

export async function POST(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const inserted: string[] = []
  const skipped: string[] = []
  for (const app of DEFAULT_APPS) {
    const existing = await landingAppModel.findByKey(app.key)
    if (existing) {
      skipped.push(app.key)
      continue
    }
    await landingAppModel.create(app)
    inserted.push(app.key)
  }

  if (inserted.length > 0) {
    auditLogModel
      .insert({
        userId: access.session?.user?.id ?? "system",
        action: "admin.landing.ensure-default-apps",
        resource: "landing-app",
        details: { inserted, skipped },
      })
      .catch(() => {})
  }

  return jsonSuccess({ inserted, skipped })
}

/** Convenience: GET ile aynı listenin durumunu rapor et — admin
 *  hangi default'ların eksik olduğunu görebilsin. */
export async function GET(request: NextRequest) {
  const access = await assertAdmin(request)
  if ("error" in access) return access.error

  const status = await Promise.all(
    DEFAULT_APPS.map(async (app) => ({
      key: app.key,
      ctaUrl: app.ctaUrl,
      installed: !!(await landingAppModel.findByKey(app.key)),
    })),
  )
  return jsonSuccess({ defaults: status })
}

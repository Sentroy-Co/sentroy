import { SentroyClient } from "@sentroy-co/sdk"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"
import {
  companyModel,
  systemMailSettingsModel,
  bucketModel,
  domainAssignmentModel,
} from "@workspace/db/models"
import { SYSTEM_COMPANY_SLUG, SYSTEM_BUCKET_SLUG } from "@workspace/db/constants"
import type { Bucket, Company } from "@workspace/db/types"

/**
 * Sistem mail'leri (better-auth verification, password reset, OTP vb.) için
 * tek noktada yönetilen bir "shadow" company. Slug `__system` — kullanıcı
 * UI'da görmez (companies endpoint'lerinde filter edilir, bkz.
 * `apps/{mail,storage,core}/app/api/companies/route.ts`). Sentroy API key
 * lazy provision: ilk admin domain işleminde oluşturulur.
 */

const SENTROY_BASE = (
  process.env.NEXT_PUBLIC_SENTROY_API_URL || "http://localhost:3000/api/v1"
).replace(/\/api\/v\d+\/?$/, "")

export async function getOrCreateSystemCompany(
  adminUserId: string,
): Promise<Company> {
  const existing = await companyModel.findBySlug(SYSTEM_COMPANY_SLUG)
  if (existing && existing.sentroyApiKey) return existing

  let company = existing
  if (!company) {
    company = await companyModel.create({
      name: "System",
      slug: SYSTEM_COMPANY_SLUG,
      ownerId: adminUserId,
      planId: "",
      mailStorageLimit: 0,
      mailStorageUsed: 0,
      maxDomains: 100,
      maxMembers: 0,
      maxMailboxes: 100,
      maxContacts: 0,
      trashRetentionDays: 30,
      monthlyEmailLimit: 0,
      monthlyEmailsSent: 0,
    })
  }

  if (!company.sentroyApiKey) {
    const adminKey = await getEnvWithFallback("SENTROY_ADMIN_API_KEY")
    if (!adminKey) throw new Error("SENTROY_ADMIN_API_KEY not configured")

    const sentroy = new SentroyClient({ baseUrl: SENTROY_BASE, apiKey: adminKey })
    const keyResult = await sentroy.apiKeys.create({
      name: `System (${company.id})`,
      scopes: ["send", "read", "admin"],
      companyId: company.id,
    } as Parameters<typeof sentroy.apiKeys.create>[0])

    if (!keyResult.data?.key) {
      throw new Error("Mail server returned no key for system company")
    }

    const updated = await companyModel.updateById(company.id, {
      sentroyApiKey: keyResult.data.key,
    } as Partial<Company>)
    company = updated ?? { ...company, sentroyApiKey: keyResult.data.key }
  }

  return company
}

/** Sistem company'nin sentroy client'ı — domain CRUD için. */
export async function getSystemSentroyClient(adminUserId: string) {
  const company = await getOrCreateSystemCompany(adminUserId)
  if (!company.sentroyApiKey) throw new Error("System company has no API key")
  return new SentroyClient({ baseUrl: SENTROY_BASE, apiKey: company.sentroyApiKey })
}

/**
 * Send akışı için adminUserId-bağımsız client — sistem company zaten kurulu
 * olmalı (admin /admin/system-mail'den ilk domain'i ekledikten sonra).
 * Hiç kurulmamışsa null döner; caller silently skip eder, login flow'u
 * kırmaz.
 */
async function getSystemSentroyClientReadonly(): Promise<SentroyClient | null> {
  const company = await companyModel.findBySlug(SYSTEM_COMPANY_SLUG)
  if (!company?.sentroyApiKey) return null
  return new SentroyClient({ baseUrl: SENTROY_BASE, apiKey: company.sentroyApiKey })
}

/**
 * System mail domain'inin mevcut sahibinin Sentroy client'ını döner.
 *
 * Domain assignment akışında (Feature 1: domain transfer) admin system
 * domain'i bir user-tarafı company'e atayabilir. Transfer sonrası backend
 * o domain'i artık system company'nin API key'i ile listelemediği için
 * `getSystemSentroyClientReadonly` 404 alır → "domain-lookup-failed".
 *
 * Bu helper önce `domainAssignmentModel`'a bakıp atanmışsa target
 * company'nin key'iyle SDK client üretir; atanmamışsa system company'ye
 * fallback. `sendSystemEmail` her iki senaryoda da çalışır.
 */
async function getDomainOwnerSentroyClient(
  domainId: string,
): Promise<SentroyClient | null> {
  const assignment = await domainAssignmentModel.findByDomainId(domainId)
  if (assignment) {
    const owner = await companyModel.findById(assignment.ownerCompanyId)
    if (owner?.sentroyApiKey) {
      return new SentroyClient({
        baseUrl: SENTROY_BASE,
        apiKey: owner.sentroyApiKey,
      })
    }
    // Atama var ama target'ın key'i yok — fallback yine system'e
    console.warn(
      `[system-mail] domain ${domainId} assigned to ${assignment.ownerCompanyId} but target has no API key; falling back to system client`,
    )
  }
  return getSystemSentroyClientReadonly()
}

export interface SendSystemEmailInput {
  to: string
  subject: string
  html: string
  text?: string
  /** Opsiyonel reply-to override; default sender adresine düşer. */
  replyTo?: string
}

/**
 * Better-auth callback'leri (sendResetPassword, sendVerificationEmail) +
 * future OTP/notification akışları buradan geçer. system_mail_settings'te
 * domain seçili değilse silently skip — login flow patlamaz, sadece email
 * gitmez (admin sayfasında "no system domain" badge'i görünür).
 *
 * Throw etmez (auth callback'inin auth handler'ı kırmasın); sadece warn
 * loglar.
 */
export async function sendSystemEmail(
  input: SendSystemEmailInput,
): Promise<{ sent: boolean; reason?: string }> {
  // Önce Sentroy-platform yolu (tercih edilen). Gönderilemezse VE SMTP_HOST
  // set ise plain-SMTP fallback'e düş — mail yığını olmayan self-host'ta
  // password-reset vb. transactional mail herhangi bir SMTP kutusundan gitsin.
  const platform = await sendViaPlatform(input)
  if (platform.sent) return platform
  const smtp = await sendViaSmtp(input)
  if (smtp) return smtp // SMTP yapılandırılmış → kendi sonucu (sent | smtp-send-failed)
  return platform // SMTP yok → platform'un başarısızlık reason'ı
}

/**
 * Plain-SMTP fallback — YALNIZ SMTP_HOST set olunca ve platform yolu
 * gönderemediğinde. nodemailer DYNAMIC import (SMTP_HOST yoksa modül asla
 * yüklenmez → hosted runtime nodemailer'ı taşımaz). SMTP_HOST yoksa null döner.
 */
async function sendViaSmtp(
  input: SendSystemEmailInput,
): Promise<{ sent: boolean; reason?: string } | null> {
  const host = process.env.SMTP_HOST?.trim()
  if (!host) return null
  try {
    const { createTransport } = await import("nodemailer")
    const user = process.env.SMTP_USER?.trim()
    const transport = createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: /^(1|true|yes|on)$/i.test((process.env.SMTP_SECURE ?? "").trim()),
      auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
    })
    const from =
      process.env.SMTP_FROM?.trim() ||
      user ||
      `no-reply@${process.env.SENTROY_ROOT_DOMAIN || "localhost"}`
    await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    })
    return { sent: true }
  } catch (err) {
    console.error("[system-mail] SMTP fallback failed:", err)
    return { sent: false, reason: "smtp-send-failed" }
  }
}

async function sendViaPlatform(
  input: SendSystemEmailInput,
): Promise<{ sent: boolean; reason?: string }> {
  const settings = await systemMailSettingsModel.get()
  if (!settings.systemMailDomainId) {
    console.warn("[system-mail] no domain configured, skipping send to", input.to)
    return { sent: false, reason: "no-domain-configured" }
  }

  // Domain'in mevcut sahibinin client'ı (assignment varsa target company,
  // yoksa system company). Transfer sonrası system key bu domain'i
  // göremediğinden assignment-aware lookup yapıyoruz.
  const sentroy = await getDomainOwnerSentroyClient(
    settings.systemMailDomainId,
  )
  if (!sentroy) {
    console.warn("[system-mail] no client available for domain owner")
    return { sent: false, reason: "not-provisioned" }
  }

  let domainName: string
  try {
    const dRes = await sentroy.domains.get(settings.systemMailDomainId)
    if (!dRes.data?.domain) throw new Error("domain not found")
    domainName = dRes.data.domain
  } catch (err) {
    console.warn("[system-mail] domain lookup failed:", err)
    return { sent: false, reason: "domain-lookup-failed" }
  }

  const from = `${settings.fromAddress}@${domainName}`
  try {
    await sentroy.send.single({
      to: input.to,
      from,
      subject: input.subject,
      domainId: settings.systemMailDomainId,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      // Internal mail (invitation, password reset, OTP) — link integrity
      // kritik. Tracking proxy aktif iken `<a href>` linkleri
      // `${API_BASE_URL}/t/click/...?url=...` ile sarmalanır; eğer
      // mail-server `API_BASE_URL` env'i yanlış set'liyse (örn
      // mail.sentroy.com'a düşmüş — Next.js UI subdomain'i) link 404 atar.
      // Ayrıca bu mail'lerde open/click analytics gereksiz. Per-send
      // override domain default'unu ezer, kullanıcı tarafı (transactional)
      // maillerinde tracking açık kalır.
      trackOpens: false,
      trackClicks: false,
    })
    return { sent: true }
  } catch (err) {
    console.error("[system-mail] send failed:", err)
    return { sent: false, reason: "send-failed" }
  }
}

// ── System bucket — Phase 2 ───────────────────────────────────────────────

/**
 * Sistem dosyaları için ortak bucket — şu an template thumbnail'ları
 * yazılacak. Public + sistem company'ye bağlı: thumbnail'lar admin/user
 * gallery'lerinde signed URL gerektirmeden gösterilebilsin.
 *
 * Idempotent: yoksa yaratır, varsa mevcudu döndürür. Sistem company de
 * bu çağrıda lazy provision olur (ihtiyaç olmadan boot zamanı yan
 * etkisi yok).
 */
export async function getOrCreateSystemBucket(
  adminUserId: string,
): Promise<Bucket> {
  const company = await getOrCreateSystemCompany(adminUserId)
  const existing = await bucketModel.findBySlug(company.id, SYSTEM_BUCKET_SLUG)
  if (existing) return existing

  return bucketModel.create({
    companyId: company.id,
    name: "System files",
    slug: SYSTEM_BUCKET_SLUG,
    description:
      "Platform-managed files: template thumbnails, system assets. Auto-managed.",
    isPublic: true,
    storageUsed: 0,
    fileCount: 0,
  })
}

// Sabitler artık `@workspace/db/constants` üzerinden export ediliyor;
// burada re-export sadece geriye dönük import path'lerini bozmamak için.
export { SYSTEM_COMPANY_SLUG, SYSTEM_BUCKET_SLUG }

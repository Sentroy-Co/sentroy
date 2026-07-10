/**
 * Auth Project mail event registry — Auth-as-a-Service ürünündeki RP
 * kullanıcılarına gönderilen transactional mail'lerin tek doğruluk
 * kaynağı.
 *
 * `system-mail-events.ts` ile aynı pattern (registry + render +
 * `getSystemMailSender` üzerinden gönderim) ama farklı namespace ve
 * tek önemli ek: her template `projectName` / `primaryColor` /
 * `logoUrl` brand placeholder'larını destekler. Wrap helper'ı RP'nin
 * branding ayarlarını HTML'e enjekte eder (siyah CTA yerine project'in
 * `primaryColor`'ı, header'da logo render'ı, project adının copy'de
 * geçmesi).
 *
 * Multi-tenancy şuanda Sentroy'un kendi mail platform'unu paylaşıyor —
 * RP başına ayrı domain v2'de (`from` adresi şimdilik
 * `noreply@auth.sentroy.com`).
 *
 * Adding an event:
 *   1. AUTH_PROJECT_MAIL_EVENTS'a yeni entry ekle (key, vars, defaults).
 *   2. Trigger site'tan `sendAuthProjectMail(key, {...})` çağır.
 */

import {
  getSystemMailSender,
  type SystemMailSender,
} from "./system-mail-sender"

export type LocalizedString = Record<string, string>

export interface AuthProjectMailEventVariable {
  name: string
  description: string
  sample: string
  /** HTML-escape edilecek mi (default true). URL'ler için false. */
  escape?: boolean
}

export type AuthProjectMailEventCategory =
  | "verification"
  | "password"
  | "magic-link"
  | "security"

export interface AuthProjectMailEventDefinition {
  key: string
  category: AuthProjectMailEventCategory
  label: string
  description: string
  variables: AuthProjectMailEventVariable[]
  defaultSubject: LocalizedString
  defaultHtmlBody: LocalizedString
}

/* ─── Branded wrap helper ─────────────────────────────────────────────── */

interface BrandContext {
  projectName: string
  primaryColor: string | null
  logoUrl: string | null
}

/**
 * Generic branded email shell. Üst tarafta optional logo, ardından project
 * display-name yazısı, sonra heading + body + CTA. CTA project'in primary
 * color'unu kullanır (yoksa siyah default).
 *
 * Variable placeholder'lar (`{projectName}`, `{userEmail}`, vb.) substitute
 * pipeline'ı tarafından runtime'da doldurulur — burada sadece HTML iskeleti
 * ve sabit brand kısımları üretilir.
 */
function brandedWrap(
  brand: BrandContext,
  heading: string,
  body: string,
  cta: { url: string; label: string } | null,
  footerNote: string,
): string {
  const accent = brand.primaryColor || "#111"
  const logoBlock = brand.logoUrl
    ? `<div style="margin:0 0 24px;text-align:center"><img src="${brand.logoUrl}" alt="${escapeAttribute(brand.projectName)}" style="max-height:48px;max-width:200px;object-fit:contain"/></div>`
    : `<div style="margin:0 0 24px;text-align:center;font-weight:600;font-size:14px;letter-spacing:0.04em;color:#666;text-transform:uppercase">${escapeText(brand.projectName)}</div>`

  const ctaBlock = cta
    ? `\n  <a href="${cta.url}" style="display:inline-block;padding:12px 20px;background:${escapeAttribute(accent)};color:#fff;text-decoration:none;border-radius:8px;font-weight:600">${escapeText(cta.label)}</a>`
    : ""

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
  ${logoBlock}
  <h2 style="margin:0 0 16px;color:#111;font-size:20px">${heading}</h2>
  <p style="margin:0 0 24px;color:#444;line-height:1.5">${body}</p>${ctaBlock}
  <p style="margin:24px 0 0;color:#888;font-size:12px;line-height:1.5">${footerNote}</p>
  <p style="margin:16px 0 0;color:#bbb;font-size:11px;line-height:1.5">Powered by <a href="https://sentroy.com" style="color:#bbb;text-decoration:none">Sentroy</a> Auth.</p>
</div>
`.trim()
}

/** Markup-safe placeholder echo — yalnız compile-time için. */
const P = (k: string) => `{${k}}`

/* ─── Registry ──────────────────────────────────────────────────────── */

export const AUTH_PROJECT_MAIL_EVENTS: AuthProjectMailEventDefinition[] = [
  {
    key: "auth-project.verify-email",
    category: "verification",
    label: "Email verification",
    description:
      "Sent on signup when the project requires email verification. Single-tap link valid for one hour.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Address being verified.", sample: "jane@example.com" },
      { name: "verifyUrl", description: "Verify-email landing URL with token.", sample: "https://auth.sentroy.com/p/acme/verify-email?token=abc", escape: false },
    ],
    defaultSubject: {
      en: `Verify your ${P("projectName")} email`,
      tr: `${P("projectName")} e-posta adresinizi doğrulayın`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:verify-email]`,
      tr: `[BRANDED:tr:verify-email]`,
    },
  },
  {
    key: "auth-project.password-reset",
    category: "password",
    label: "Password reset",
    description:
      "Sent when a user requests password reset. Single-tap link valid for one hour.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Address requesting reset.", sample: "jane@example.com" },
      { name: "resetUrl", description: "Reset-password landing URL with token.", sample: "https://auth.sentroy.com/p/acme/reset-password?token=abc", escape: false },
    ],
    defaultSubject: {
      en: `Reset your ${P("projectName")} password`,
      tr: `${P("projectName")} şifrenizi sıfırlayın`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:password-reset]`,
      tr: `[BRANDED:tr:password-reset]`,
    },
  },
  {
    key: "auth-project.magic-link",
    category: "magic-link",
    label: "Magic link sign-in",
    description:
      "Sent when a user requests passwordless sign-in. Single-use, expires in 10 minutes.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Recipient address.", sample: "jane@example.com" },
      { name: "magicUrl", description: "Magic-link URL with token.", sample: "https://auth.sentroy.com/p/acme/magic-link?token=abc", escape: false },
    ],
    defaultSubject: {
      en: `Your ${P("projectName")} sign-in link`,
      tr: `${P("projectName")} giriş bağlantınız`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:magic-link]`,
      tr: `[BRANDED:tr:magic-link]`,
    },
  },
  {
    key: "auth-project.new-device-alert",
    category: "security",
    label: "New device sign-in",
    description:
      "Sent when an account signs in from an IP/user-agent we haven't seen before. Informational — links to security/sessions page.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Account address.", sample: "jane@example.com" },
      { name: "ipAddress", description: "Client IP from x-forwarded-for.", sample: "82.222.0.1" },
      { name: "userAgent", description: "Browser UA excerpt.", sample: "Chrome 130 / macOS" },
      { name: "loginTime", description: "ISO timestamp of the sign-in.", sample: "2026-05-13 09:14 UTC" },
      { name: "sessionsUrl", description: "Optional sessions page link.", sample: "https://app.example.com/account/sessions", escape: false },
    ],
    defaultSubject: {
      en: `New sign-in to your ${P("projectName")} account`,
      tr: `${P("projectName")} hesabınıza yeni giriş`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:new-device-alert]`,
      tr: `[BRANDED:tr:new-device-alert]`,
    },
  },
  {
    key: "auth-project.account-locked",
    category: "security",
    label: "Account locked after failed attempts",
    description:
      "Sent when an account exceeds the failed-login threshold and is temporarily locked. Includes IP + lock expiry + reset link.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Account address.", sample: "jane@example.com" },
      { name: "ipAddress", description: "Client IP of last failed attempt.", sample: "82.222.0.1" },
      { name: "lockedUntil", description: "ISO timestamp when the lock expires.", sample: "2026-05-13 10:00 UTC" },
      { name: "resetUrl", description: "Password reset URL.", sample: "https://auth.sentroy.com/p/acme/reset-password", escape: false },
    ],
    defaultSubject: {
      en: `${P("projectName")} — Account temporarily locked`,
      tr: `${P("projectName")} — Hesap geçici olarak kilitlendi`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:account-locked]`,
      tr: `[BRANDED:tr:account-locked]`,
    },
  },
  {
    key: "auth-project.signup-attempt-existing",
    category: "security",
    label: "Signup attempt on existing account",
    description:
      "Sent when someone tries to sign up with an email that already has an account. Lets the legitimate owner know + offers sign-in / reset.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Account address.", sample: "jane@example.com" },
      { name: "signinUrl", description: "Hosted sign-in page URL.", sample: "https://auth.sentroy.com/p/acme/login", escape: false },
      { name: "resetUrl", description: "Password reset URL.", sample: "https://auth.sentroy.com/p/acme/reset-password", escape: false },
    ],
    defaultSubject: {
      en: `${P("projectName")} — Someone tried to sign up with your email`,
      tr: `${P("projectName")} — E-postanızla birinin kayıt denemesi`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:signup-attempt-existing]`,
      tr: `[BRANDED:tr:signup-attempt-existing]`,
    },
  },
  {
    key: "auth-project.email-change",
    category: "verification",
    label: "Confirm new email address",
    description:
      "Sent to the new email address after the user requests an email change. Single-use token confirmation.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Current account address.", sample: "old@example.com" },
      { name: "newEmail", description: "New address to confirm.", sample: "new@example.com" },
      { name: "confirmUrl", description: "Email-change confirmation URL.", sample: "https://auth.sentroy.com/p/acme/email-change?token=abc", escape: false },
    ],
    defaultSubject: {
      en: `${P("projectName")} — Confirm your new email address`,
      tr: `${P("projectName")} — Yeni e-posta adresinizi onaylayın`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:email-change]`,
      tr: `[BRANDED:tr:email-change]`,
    },
  },
  {
    key: "auth-project.account-delete",
    category: "security",
    label: "Confirm account deletion",
    description:
      "Sent when a user requests permanent account deletion. Single-use token; once confirmed, the account is removed.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Account to delete.", sample: "jane@example.com" },
      { name: "confirmUrl", description: "Delete confirmation URL.", sample: "https://auth.sentroy.com/p/acme/account-delete?token=abc", escape: false },
    ],
    defaultSubject: {
      en: `${P("projectName")} — Confirm account deletion`,
      tr: `${P("projectName")} — Hesap silme talebini onaylayın`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:account-delete]`,
      tr: `[BRANDED:tr:account-delete]`,
    },
  },
  {
    key: "auth-project.invitation",
    category: "verification",
    label: "Admin invitation to join",
    description:
      "Sent when an RP admin invites a new user by email. Recipient sets a password to accept.",
    variables: [
      { name: "projectName", description: "RP project display name.", sample: "Acme App" },
      { name: "primaryColor", description: "Brand colour (CTA fill).", sample: "#1d4ed8" },
      { name: "logoUrl", description: "Optional brand logo URL.", sample: "https://cdn.example.com/logo.png", escape: false },
      { name: "userEmail", description: "Invited address.", sample: "jane@example.com" },
      { name: "acceptUrl", description: "Invitation accept URL with token.", sample: "https://auth.sentroy.com/p/acme/invitation/accept?token=abc", escape: false },
    ],
    defaultSubject: {
      en: `You're invited to ${P("projectName")}`,
      tr: `${P("projectName")} ekibine davet edildiniz`,
    },
    defaultHtmlBody: {
      en: `[BRANDED:en:invitation]`,
      tr: `[BRANDED:tr:invitation]`,
    },
  },
]

const REGISTRY_BY_KEY: Map<string, AuthProjectMailEventDefinition> = new Map(
  AUTH_PROJECT_MAIL_EVENTS.map((e) => [e.key, e]),
)

export function getAuthProjectMailEvent(
  key: string,
): AuthProjectMailEventDefinition | null {
  return REGISTRY_BY_KEY.get(key) ?? null
}

export function listAuthProjectMailEvents(): AuthProjectMailEventDefinition[] {
  return AUTH_PROJECT_MAIL_EVENTS
}

/* ─── Resolver — apps/auth2 (or core) can inject DB-backed overrides ── */

export interface AuthProjectMailEventOverride {
  subject: LocalizedString
  htmlBody: LocalizedString
  enabled: boolean
}

export type AuthProjectMailEventResolver = (
  eventKey: string,
  projectId: string,
) => Promise<AuthProjectMailEventOverride | null>

let resolver: AuthProjectMailEventResolver | null = null

export function setAuthProjectMailEventResolver(
  fn: AuthProjectMailEventResolver | null,
): void {
  resolver = fn
}

export function getAuthProjectMailEventResolver():
  | AuthProjectMailEventResolver
  | null {
  return resolver
}

/* ─── Render + send pipeline ────────────────────────────────────────── */

const SUPPORTED_LOCALES = ["en", "tr"] as const
const DEFAULT_LOCALE = "en"

function resolveLocale(loc: string | undefined | null): string {
  if (!loc) return DEFAULT_LOCALE
  const lower = loc.toLowerCase().slice(0, 2)
  return (SUPPORTED_LOCALES as readonly string[]).includes(lower)
    ? lower
    : DEFAULT_LOCALE
}

function pickLocalized(
  bag: LocalizedString | undefined,
  locale: string,
): string | null {
  if (!bag) return null
  return bag[locale] ?? bag[DEFAULT_LOCALE] ?? null
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeAttribute(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/**
 * Mustache-ish substitution. `{key}` ve `{{key}}` her ikisini de destekler;
 * `system-mail-events.ts` ile aynı davranış.
 */
function substitute(
  source: string,
  values: Record<string, string>,
): string {
  if (!source) return ""
  return source.replace(/\{\{?(\w+)\}?\}/g, (match, key: string) => {
    const v = values[key]
    return v === undefined ? match : v
  })
}

/**
 * `[BRANDED:lang:eventSlug]` sentinel'ini compile-time inline edemediğimiz
 * için runtime'da expand ediyoruz. Reason: `brandedWrap` parametre-bağımlı
 * (project brand) — bu sayede DB override yokken default template'ler
 * her project'e farklı render edilir.
 *
 * Override yazılırsa `[BRANDED:...]` sentinel'i template'in `htmlBody`
 * field'ında geçmez; admin tam HTML yazmıştır, doğrudan substitute edilir.
 */
function expandBrandedSentinel(
  sentinel: string,
  brand: BrandContext,
): string {
  const m = /^\[BRANDED:(en|tr):([\w-]+)\]$/.exec(sentinel.trim())
  if (!m) return sentinel
  const lang = m[1]
  const event = m[2]
  return renderBrandedDefault(event, lang, brand)
}

function renderBrandedDefault(
  eventSlug: string,
  lang: string,
  brand: BrandContext,
): string {
  switch (eventSlug) {
    case "verify-email":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} e-posta adresinizi doğrulayın`,
            `Merhaba, <strong>${P("userEmail")}</strong> adresinin size ait olduğunu onaylamak için aşağıdaki butonu kullanın. Bağlantı 1 saat içinde geçerliliğini kaybeder.`,
            { url: P("verifyUrl"), label: "E-postayı doğrula" },
            "Bu maili beklemiyorduysanız güvenle görmezden gelebilirsiniz — hiçbir hesap oluşturulmadı.",
          )
        : brandedWrap(
            brand,
            `Verify your ${P("projectName")} email`,
            `Confirm that <strong>${P("userEmail")}</strong> belongs to you. The link expires in 1 hour.`,
            { url: P("verifyUrl"), label: "Verify email" },
            "If you weren't expecting this, you can safely ignore it — no account was created.",
          )

    case "password-reset":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} şifrenizi sıfırlayın`,
            `<strong>${P("userEmail")}</strong> için şifre sıfırlama talebi aldık. Yeni bir şifre belirlemek için aşağıdaki butonu kullanın — bağlantı 1 saat sonra geçerliliğini kaybeder.`,
            { url: P("resetUrl"), label: "Şifreyi sıfırla" },
            "Bu talebi siz yapmadıysanız bu maili güvenle silebilirsiniz — şifreniz aynı kaldı.",
          )
        : brandedWrap(
            brand,
            `Reset your ${P("projectName")} password`,
            `We received a request to reset the password for <strong>${P("userEmail")}</strong>. Click below to choose a new one — the link expires in 1 hour.`,
            { url: P("resetUrl"), label: "Reset password" },
            "If you didn't request this, you can safely ignore the email — your password is unchanged.",
          )

    case "magic-link":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} giriş bağlantınız`,
            `<strong>${P("userEmail")}</strong> ile giriş yapmak için aşağıdaki butonu kullanın. Bağlantı tek kullanımlıktır ve 10 dakika içinde geçerliliğini kaybeder.`,
            { url: P("magicUrl"), label: "Giriş yap" },
            "Bu talebi siz yapmadıysanız bu maili güvenle görmezden gelebilirsiniz.",
          )
        : brandedWrap(
            brand,
            `Your ${P("projectName")} sign-in link`,
            `Click below to sign in to <strong>${P("userEmail")}</strong>. The link works once and expires in 10 minutes.`,
            { url: P("magicUrl"), label: "Sign in" },
            "If you didn't request this, you can safely ignore the email.",
          )

    case "new-device-alert":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} — Yeni cihaz girişi`,
            `<strong>${P("userEmail")}</strong> hesabınıza <strong>${P("ipAddress")}</strong> (${P("userAgent")}) konumundan ${P("loginTime")} tarihinde yeni bir oturum açıldı. Sizseniz bir şey yapmanız gerekmez.`,
            P("sessionsUrl")
              ? { url: P("sessionsUrl"), label: "Oturumları gözden geçir" }
              : null,
            "Sizi değilse bu cihazı oturumlardan çıkarın ve şifrenizi değiştirin.",
          )
        : brandedWrap(
            brand,
            `${P("projectName")} — New device sign-in`,
            `A new sign-in to <strong>${P("userEmail")}</strong> was detected from <strong>${P("ipAddress")}</strong> (${P("userAgent")}) at ${P("loginTime")}. If this was you, no action is needed.`,
            P("sessionsUrl")
              ? { url: P("sessionsUrl"), label: "Review active sessions" }
              : null,
            "If this wasn't you, sign out the device and change your password immediately.",
          )

    case "account-locked":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} — Hesap geçici olarak kilitlendi`,
            `<strong>${P("userEmail")}</strong> hesabınız çok sayıda başarısız giriş denemesinden sonra geçici olarak kilitlendi. Son deneme: <strong>${P("ipAddress")}</strong>. Kilit ${P("lockedUntil")} tarihinde otomatik olarak kalkar.`,
            { url: P("resetUrl"), label: "Şifreyi sıfırla" },
            "Bu denemeler size aitse şifrenizi sıfırlayın. Değilse, başkasının hesabınıza erişmeye çalıştığını gösterir — şifrenizi mutlaka değiştirin.",
          )
        : brandedWrap(
            brand,
            `${P("projectName")} — Account temporarily locked`,
            `Your <strong>${P("userEmail")}</strong> account has been temporarily locked after too many failed sign-in attempts. Last attempt from <strong>${P("ipAddress")}</strong>. The lock lifts automatically at ${P("lockedUntil")}.`,
            { url: P("resetUrl"), label: "Reset password" },
            "If these attempts were yours, reset your password. If not, someone may be trying to access your account — change your password immediately.",
          )

    case "signup-attempt-existing":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} — E-postanızla yeni bir kayıt denendi`,
            `Birisi <strong>${P("userEmail")}</strong> ile yeni bir hesap oluşturmaya çalıştı. Bu hesabı zaten kullanıyorsanız endişelenmenize gerek yok — giriş yapın veya şifrenizi sıfırlayın.`,
            { url: P("signinUrl"), label: "Giriş yap" },
            "Bu denemeyi siz yapmadıysanız bu maili güvenle silebilirsiniz; hiçbir yeni hesap oluşturulmadı.",
          )
        : brandedWrap(
            brand,
            `${P("projectName")} — Someone tried to sign up with your email`,
            `Someone attempted to create a new account with <strong>${P("userEmail")}</strong>. If this account is already yours, no action is needed — just sign in or reset your password.`,
            { url: P("signinUrl"), label: "Sign in" },
            "If this wasn't you, it's safe to ignore — no new account was created.",
          )

    case "email-change":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} — Yeni e-posta adresinizi onaylayın`,
            `<strong>${P("userEmail")}</strong> hesabınız için yeni adres olarak <strong>${P("newEmail")}</strong> belirtildi. Bu değişikliği onaylamak için aşağıdaki butonu kullanın. Bağlantı 1 saat içinde geçerliliğini kaybeder.`,
            { url: P("confirmUrl"), label: "Yeni e-postayı onayla" },
            "Bu talebi siz yapmadıysanız bu maili güvenle silebilirsiniz — hesabınızın e-posta adresi değişmez.",
          )
        : brandedWrap(
            brand,
            `${P("projectName")} — Confirm your new email`,
            `You requested to change your <strong>${P("userEmail")}</strong> account email to <strong>${P("newEmail")}</strong>. Confirm with the button below. The link expires in 1 hour.`,
            { url: P("confirmUrl"), label: "Confirm new email" },
            "If you didn't request this, you can safely ignore — your account email will not change.",
          )

    case "account-delete":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} — Hesap silme talebini onaylayın`,
            `<strong>${P("userEmail")}</strong> hesabını kalıcı olarak silmek istediğinizi belirttiniz. Bu işlem GERİ ALINAMAZ ve tüm hesap verisi silinir. Devam etmek için aşağıdaki butonu kullanın. Bağlantı 1 saat içinde geçerliliğini kaybeder.`,
            { url: P("confirmUrl"), label: "Hesabımı sil" },
            "Bu talebi siz yapmadıysanız bu maili görmezden gelin — şifrenizi mutlaka değiştirin ve hesabınızı güvende tutun.",
          )
        : brandedWrap(
            brand,
            `${P("projectName")} — Confirm account deletion`,
            `You've requested to permanently delete the <strong>${P("userEmail")}</strong> account. This action CANNOT be undone and all account data will be erased. Click below to proceed. The link expires in 1 hour.`,
            { url: P("confirmUrl"), label: "Delete my account" },
            "If you didn't request this, ignore the email — change your password and keep your account secure.",
          )

    case "invitation":
      return lang === "tr"
        ? brandedWrap(
            brand,
            `${P("projectName")} ekibine davet edildiniz`,
            `<strong>${P("userEmail")}</strong> adresine ${P("projectName")} için davet aldınız. Hesap oluşturmak için aşağıdaki butona tıklayın ve şifrenizi belirleyin. Bağlantı 7 gün boyunca geçerlidir.`,
            { url: P("acceptUrl"), label: "Daveti kabul et" },
            "Bu maili beklemiyorduysanız güvenle görmezden gelebilirsiniz — hiçbir hesap oluşturulmaz.",
          )
        : brandedWrap(
            brand,
            `You're invited to ${P("projectName")}`,
            `<strong>${P("userEmail")}</strong> received an invitation to ${P("projectName")}. Click below to create your account and set a password. The link is valid for 7 days.`,
            { url: P("acceptUrl"), label: "Accept invitation" },
            "If you weren't expecting this, you can safely ignore — no account will be created.",
          )

    default:
      return ""
  }
}

export interface RenderedAuthProjectMail {
  subject: string
  html: string
  text: string
}

export interface AuthProjectBrandInput {
  /** Project'in id'si — resolver lookup için. */
  projectId: string
  /** Display name (DB'deki branding.displayName ?? project.name). */
  projectName: string
  /** Brand color (`#rrggbb` veya null). */
  primaryColor: string | null
  /** Brand logo URL (null = uppercase project adı text fallback). */
  logoUrl: string | null
}

export interface RenderAuthProjectMailOptions {
  /** Pre-resolved override; verilmediyse resolver'a sorulur. */
  override?: AuthProjectMailEventOverride | null
  /** Per-call draft (admin preview için). */
  draft?: { subject?: LocalizedString; htmlBody?: LocalizedString }
}

export async function renderAuthProjectMailEvent(
  eventKey: string,
  brand: AuthProjectBrandInput,
  locale: string,
  variables: Record<string, string | number | boolean>,
  options: RenderAuthProjectMailOptions = {},
): Promise<RenderedAuthProjectMail | null> {
  const def = getAuthProjectMailEvent(eventKey)
  if (!def) {
    console.warn(`[auth-project-mail-events] unknown event key: ${eventKey}`)
    return null
  }

  const lang = resolveLocale(locale)

  let override = options.override
  if (override === undefined) {
    const r = getAuthProjectMailEventResolver()
    override = r ? await r(eventKey, brand.projectId) : null
  }

  if (override && override.enabled === false) {
    return null
  }

  const brandContext: BrandContext = {
    projectName: brand.projectName,
    primaryColor: brand.primaryColor,
    logoUrl: brand.logoUrl,
  }

  const subjectSrc =
    pickLocalized(options.draft?.subject, lang) ??
    pickLocalized(override?.subject, lang) ??
    pickLocalized(def.defaultSubject, lang) ??
    pickLocalized(def.defaultSubject, DEFAULT_LOCALE) ??
    eventKey

  let htmlSrc =
    pickLocalized(options.draft?.htmlBody, lang) ??
    pickLocalized(override?.htmlBody, lang) ??
    pickLocalized(def.defaultHtmlBody, lang) ??
    pickLocalized(def.defaultHtmlBody, DEFAULT_LOCALE) ??
    ""

  // Default registry templates use a sentinel that expands to fully-
  // branded HTML at render time. Admin overrides ship plain HTML and
  // skip this branch automatically.
  if (htmlSrc.startsWith("[BRANDED:")) {
    htmlSrc = expandBrandedSentinel(htmlSrc, brandContext)
  }

  // Substitute caller-supplied vars + brand vars. Brand vars get auto-
  // injected so users don't need to pass them at every call site.
  const escapeMap = new Map<string, boolean>()
  for (const v of def.variables) {
    escapeMap.set(v.name, v.escape !== false)
  }
  // Brand vars defaults — caller's `variables` wins on conflict.
  const merged: Record<string, string | number | boolean> = {
    projectName: brand.projectName,
    primaryColor: brand.primaryColor ?? "#111",
    logoUrl: brand.logoUrl ?? "",
    ...variables,
  }
  const safeVars: Record<string, string> = {}
  for (const [k, v] of Object.entries(merged)) {
    const stringified = String(v ?? "")
    safeVars[k] = escapeMap.get(k) === false ? stringified : escapeText(stringified)
  }

  const subject = substitute(subjectSrc, safeVars)
  const html = substitute(htmlSrc, safeVars)

  // Plain-text fallback — strip tags. Adequate for transactional single-
  // paragraph copy; the canonical body is HTML.
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return { subject, html, text }
}

export interface SendAuthProjectMailOptions {
  to: string
  brand: AuthProjectBrandInput
  locale?: string | null
  variables: Record<string, string | number | boolean>
  /** Test override — varsa onu kullanır, yoksa global sender. */
  sender?: SystemMailSender
}

/**
 * End-to-end auth project mail send: registry'den render → injected
 * `SystemMailSender`'a teslim. Throw etmez — Sentroy mail platform'u
 * lazy-provision'a girilmediyse `no-sender` reason ile no-op döner
 * (auth flow'u kırmaz; admin sayfasında "system mail not configured"
 * badge'i ayrıca görülür).
 */
export async function sendAuthProjectMail(
  eventKey: string,
  options: SendAuthProjectMailOptions,
): Promise<{ sent: boolean; reason?: string }> {
  const send = options.sender ?? getSystemMailSender()
  if (!send) {
    return { sent: false, reason: "no-sender" }
  }

  const rendered = await renderAuthProjectMailEvent(
    eventKey,
    options.brand,
    options.locale ?? DEFAULT_LOCALE,
    options.variables,
  )
  if (!rendered) {
    return { sent: false, reason: "event-disabled-or-unknown" }
  }

  return send({
    to: options.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })
}

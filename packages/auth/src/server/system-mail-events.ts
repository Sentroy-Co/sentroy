/**
 * System mail event registry — the single source of truth for which
 * transactional channels exist and what their default content looks
 * like. Both the better-auth callbacks (`packages/auth/src/server/auth.ts`)
 * and the company invitation handler
 * (`packages/console/src/handlers/company-invitations.ts`) emit through
 * this module so admins can override copy from
 * /admin/system-mail/events without touching code.
 *
 * Resolver pattern:
 *   apps/core registers a resolver at boot
 *   (`setSystemMailEventResolver`) that pulls the override from
 *   `system_mail_event_templates`. If no override exists for the
 *   requested locale, we fall back to the default defined here. If no
 *   sender is configured (`getSystemMailSender()` is null) we silently
 *   noop — the auth flow never breaks because copy is missing.
 *
 * Adding an event:
 *   1. Add a new entry to `SYSTEM_MAIL_EVENTS` below with stable key,
 *      i18n labels, the variable contract and en/tr defaults.
 *   2. Call `sendSystemMailEvent(key, {...})` from the trigger site.
 *   That's it — admins immediately see the new event in the registry
 *   list with its defaults; overrides land in the same table.
 */

import {
  getSystemMailSender,
  type SystemMailSender,
} from "./system-mail-sender"
import { serverRootDomain, rootOrigin, docsHost } from "../lib/domains"

export type LocalizedString = Record<string, string>

/**
 * Variable contract for a single event. Names match the keys passed in
 * `vars` at the call site; the renderer interpolates them via the
 * Mustache-ish syntax in `@workspace/ui/lib/email-template`. `sample`
 * is what the admin preview pane uses when no input is supplied.
 */
export interface SystemMailEventVariable {
  name: string
  /** Human-readable description shown in the editor's variable chips. */
  description: string
  /** Placeholder rendered in the live preview. */
  sample: string
  /** If true, value is HTML-escaped before substitution. Default true.
   *  Set false only for fields that are themselves trusted markup
   *  (e.g. a server-built `<a>` link block — there is none today). */
  escape?: boolean
}

export type SystemMailEventCategory =
  | "auth"
  | "verification"
  | "otp"
  | "invitation"
  | "notification"

export interface SystemMailEventDefinition {
  key: string
  category: SystemMailEventCategory
  /** Short label rendered in the registry list. */
  label: string
  /** One-liner for the editor header + tooltip. */
  description: string
  variables: SystemMailEventVariable[]
  /** Locale → default subject. `en` and `tr` are always populated. */
  defaultSubject: LocalizedString
  /** Locale → default HTML body. `en` and `tr` are always populated. */
  defaultHtmlBody: LocalizedString
}

/* ─── Default copy templates ────────────────────────────────────────── */

/* Sosyal bağlantılar — landing v2 footer'ıyla aynı (mail footer'ında gösterilir). */
const EMAIL_SOCIALS: [string, string][] = [
  ["Instagram", "https://instagram.com/sentroycom"],
  ["X", "https://x.com/sentroy"],
  ["GitHub", "https://github.com/Sentroy-Co"],
  ["LinkedIn", "https://linkedin.com/company/sentroy"],
  ["Discord", "https://discord.com/channels/1522731613841129634"],
]

/**
 * Uber-tarzı kurumsal mail kabuğu — logo header + beyaz kart + footer
 * (Privacy · Contact · Docs + sosyaller + copyright). URL'ler ROOT_DOMAIN'den
 * türetilir (self-host portable); footer link'leri locale'e göre /en|/tr.
 * Tüm Sentroy auth/bildirim mailleri buradan geçer (wrap/wrapTr). RP status-
 * abonesi mailleri ayrı kitledir → wrapSubscriber (Sentroy footer'ı almaz).
 */
function emailShell(opts: {
  lang: "en" | "tr"
  heading: string
  body: string
  cta?: { url: string; label: string }
  footerNote?: string
}): string {
  const { lang, heading, body, cta, footerNote } = opts
  const root = rootOrigin(serverRootDomain())
  const docsUrl = `https://${docsHost(serverRootDomain())}`
  const logo = `${root}/business/sentroy-icon-colored.png`
  const year = new Date().getFullYear()
  const L =
    lang === "tr"
      ? { privacy: "Gizlilik", contact: "İletişim", docs: "Dokümanlar", rights: "Tüm hakları saklıdır." }
      : { privacy: "Privacy", contact: "Contact", docs: "Docs", rights: "All rights reserved." }
  const socials = EMAIL_SOCIALS.map(
    ([n, u]) => `<a href="${u}" style="color:#a1a1aa;text-decoration:none">${n}</a>`,
  ).join(" &nbsp;·&nbsp; ")
  return `
<div style="margin:0;padding:32px 12px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="520" style="width:520px;max-width:100%;border-collapse:collapse">
        <tr><td align="center" style="padding:2px 0 22px">
          <a href="${root}" style="text-decoration:none">
            <img src="${logo}" width="26" height="26" alt="" style="vertical-align:middle;border-radius:6px">
            <span style="vertical-align:middle;margin-left:8px;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#0a0a0a">Sentroy</span>
          </a>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #ececef;border-radius:16px;padding:40px 36px">
          <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;line-height:1.3;color:#0a0a0a">${heading}</h1>
          <div style="margin:0 0 ${cta ? "28px" : "0"};font-size:15px;line-height:1.65;color:#52525b">${body}</div>${
            cta
              ? `\n          <a href="${cta.url}" style="display:inline-block;padding:13px 24px;background:#0a0a0a;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600">${cta.label}</a>`
              : ""
          }${
            footerNote
              ? `\n          <p style="margin:28px 0 0;font-size:12px;line-height:1.55;color:#a1a1aa">${footerNote}</p>`
              : ""
          }
        </td></tr>
        <tr><td align="center" style="padding:24px 8px 4px">
          <p style="margin:0 0 10px;font-size:13px;color:#71717a">
            <a href="${root}/${lang}/p/privacy-policy" style="color:#71717a;text-decoration:none">${L.privacy}</a>
            &nbsp;·&nbsp;
            <a href="${root}/${lang}/contact" style="color:#71717a;text-decoration:none">${L.contact}</a>
            &nbsp;·&nbsp;
            <a href="${docsUrl}" style="color:#71717a;text-decoration:none">${L.docs}</a>
          </p>
          <p style="margin:0 0 12px;font-size:12px;color:#a1a1aa">${socials}</p>
          <p style="margin:0;font-size:12px;color:#c4c4cc">© ${year} Sentroy · ${L.rights}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`.trim()
}

const wrap = (heading: string, body: string, cta?: { url: string; label: string }) =>
  emailShell({
    lang: "en",
    heading,
    body,
    cta,
    footerNote: "If you weren't expecting this, you can safely ignore this email.",
  })

const wrapTr = (heading: string, body: string, cta?: { url: string; label: string }) =>
  emailShell({
    lang: "tr",
    heading,
    body,
    cta,
    footerNote: "Bu maili beklemiyorduysanız güvenle görmezden gelebilirsiniz.",
  })

const otpBlock = (otp: string) => `
<div style="font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:0.25em;padding:16px 20px;background:#f5f5f5;border-radius:12px;text-align:center;color:#111">${otp}</div>
`.trim()

/**
 * Subscriber notification mail wrapper — kullanıcı her bildirim mailinde
 * "Manage preferences" + "Unsubscribe" link'lerini görür. CAN-SPAM /
 * GDPR best practice.
 */
const wrapSubscriber = (
  heading: string,
  body: string,
  cta: { url: string; label: string },
  footerLabels: { preferences: string; unsubscribe: string },
) => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin:0 0 16px;color:#111">${heading}</h2>
  <p style="margin:0 0 24px;color:#444;line-height:1.5">${body}</p>
  <a href="${cta.url}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">${cta.label}</a>
  <hr style="margin:32px 0 16px;border:none;border-top:1px solid #eee">
  <p style="margin:0;color:#888;font-size:12px;line-height:1.6">
    <a href="{preferencesUrl}" style="color:#888;text-decoration:none">${footerLabels.preferences}</a>
    &nbsp;·&nbsp;
    <a href="{unsubscribeUrl}" style="color:#888;text-decoration:none">${footerLabels.unsubscribe}</a>
  </p>
</div>
`.trim()

/* ─── Registry ──────────────────────────────────────────────────────── */

export const SYSTEM_MAIL_EVENTS: SystemMailEventDefinition[] = [
  {
    key: "auth.verify-email",
    category: "verification",
    label: "Email verification",
    description:
      "Sent when a user signs up or signs in with an unverified address. Contains a one-tap link valid for one hour.",
    variables: [
      { name: "userName", description: "Display name (falls back to email).", sample: "Jane Doe" },
      { name: "userEmail", description: "Address being verified.", sample: "jane@example.com" },
      { name: "verifyUrl", description: "Friendly verify-email landing URL.", sample: "https://sentroy.com/verify-email?token=abc", escape: false },
    ],
    defaultSubject: {
      en: "Verify your Sentroy email",
      tr: "Sentroy e-posta adresinizi doğrulayın",
    },
    defaultHtmlBody: {
      en: wrap(
        "Verify your Sentroy email",
        "Hi {userName} — confirm <strong>{userEmail}</strong> belongs to you. The link expires in 1 hour.",
        { url: "{verifyUrl}", label: "Verify email" },
      ),
      tr: wrapTr(
        "Sentroy e-posta adresinizi doğrulayın",
        "Merhaba {userName}, <strong>{userEmail}</strong> adresinin size ait olduğunu onaylayın. Bağlantı 1 saat sonra geçerliliğini kaybeder.",
        { url: "{verifyUrl}", label: "E-postayı doğrula" },
      ),
    },
  },
  {
    key: "auth.reset-password",
    category: "auth",
    label: "Password reset",
    description:
      "Sent when a user clicks 'Forgot password'. Contains a one-tap link valid for one hour.",
    variables: [
      { name: "userEmail", description: "Address requesting the reset.", sample: "jane@example.com" },
      { name: "resetUrl", description: "Better-auth reset-password URL.", sample: "https://sentroy.com/reset-password?token=abc", escape: false },
    ],
    defaultSubject: {
      en: "Reset your Sentroy password",
      tr: "Sentroy şifrenizi sıfırlayın",
    },
    defaultHtmlBody: {
      en: wrap(
        "Reset your Sentroy password",
        "We received a request to reset the password for <strong>{userEmail}</strong>. Click below to choose a new one — the link expires in 1 hour.",
        { url: "{resetUrl}", label: "Reset password" },
      ),
      tr: wrapTr(
        "Sentroy şifrenizi sıfırlayın",
        "<strong>{userEmail}</strong> için şifre sıfırlama talebi aldık. Yeni bir şifre belirlemek için aşağıdaki butonu kullanın — bağlantı 1 saat sonra geçerliliğini kaybeder.",
        { url: "{resetUrl}", label: "Şifreyi sıfırla" },
      ),
    },
  },
  {
    key: "auth.magic-link",
    category: "auth",
    label: "Magic link sign-in",
    description:
      "Sent when a user requests a passwordless sign-in. Single-use, expires in 5 minutes.",
    variables: [
      { name: "userEmail", description: "Recipient address.", sample: "jane@example.com" },
      { name: "magicUrl", description: "Better-auth magic-link URL.", sample: "https://sentroy.com/magic-link?token=abc", escape: false },
    ],
    defaultSubject: {
      en: "Your Sentroy magic link",
      tr: "Sentroy giriş bağlantınız",
    },
    defaultHtmlBody: {
      en: wrap(
        "Your Sentroy magic link",
        "Click below to sign in to <strong>{userEmail}</strong>. The link works once and expires in 5 minutes.",
        { url: "{magicUrl}", label: "Sign in to Sentroy" },
      ),
      tr: wrapTr(
        "Sentroy giriş bağlantınız",
        "<strong>{userEmail}</strong> ile giriş yapmak için aşağıya tıklayın. Bağlantı tek kullanımlıktır ve 5 dakika sonra geçerliliğini kaybeder.",
        { url: "{magicUrl}", label: "Sentroy'a giriş yap" },
      ),
    },
  },
  {
    key: "auth.otp.sign-in",
    category: "otp",
    label: "Sign-in OTP",
    description: "Six-digit code for passwordless email sign-in. Expires in 5 minutes.",
    variables: [
      { name: "userEmail", description: "Recipient address.", sample: "jane@example.com" },
      { name: "otp", description: "Numeric code.", sample: "123 456" },
    ],
    defaultSubject: {
      en: "Your Sentroy sign-in code",
      tr: "Sentroy giriş kodunuz",
    },
    defaultHtmlBody: {
      en: wrap(
        "Your Sentroy sign-in code",
        "Use this code to continue. It expires in 5 minutes and can only be used once.",
      ).replace(
        '<p style="margin:24px 0 0;color:#888',
        `${otpBlock("{otp}")}\n  <p style="margin:24px 0 0;color:#888`,
      ),
      tr: wrapTr(
        "Sentroy giriş kodunuz",
        "Devam etmek için bu kodu kullanın. 5 dakika içinde geçerliliğini kaybeder ve yalnızca bir kez kullanılabilir.",
      ).replace(
        '<p style="margin:24px 0 0;color:#888',
        `${otpBlock("{otp}")}\n  <p style="margin:24px 0 0;color:#888`,
      ),
    },
  },
  {
    key: "auth.otp.email-verification",
    category: "otp",
    label: "Email-verification OTP",
    description: "Six-digit code used to verify a new email address.",
    variables: [
      { name: "userEmail", description: "Address being verified.", sample: "jane@example.com" },
      { name: "otp", description: "Numeric code.", sample: "123 456" },
    ],
    defaultSubject: {
      en: "Verify your Sentroy email",
      tr: "Sentroy e-posta adresinizi doğrulayın",
    },
    defaultHtmlBody: {
      en: wrap(
        "Verify your Sentroy email",
        "Use this code to verify <strong>{userEmail}</strong>. It expires in 5 minutes.",
      ).replace(
        '<p style="margin:24px 0 0;color:#888',
        `${otpBlock("{otp}")}\n  <p style="margin:24px 0 0;color:#888`,
      ),
      tr: wrapTr(
        "Sentroy e-posta adresinizi doğrulayın",
        "<strong>{userEmail}</strong> adresini doğrulamak için bu kodu kullanın. 5 dakika içinde geçerliliğini kaybeder.",
      ).replace(
        '<p style="margin:24px 0 0;color:#888',
        `${otpBlock("{otp}")}\n  <p style="margin:24px 0 0;color:#888`,
      ),
    },
  },
  {
    key: "auth.otp.forget-password",
    category: "otp",
    label: "Password-reset OTP",
    description: "Six-digit code used in the password recovery flow.",
    variables: [
      { name: "userEmail", description: "Address requesting the reset.", sample: "jane@example.com" },
      { name: "otp", description: "Numeric code.", sample: "123 456" },
    ],
    defaultSubject: {
      en: "Sentroy password reset code",
      tr: "Sentroy şifre sıfırlama kodu",
    },
    defaultHtmlBody: {
      en: wrap(
        "Sentroy password reset code",
        "Use this code to reset the password for <strong>{userEmail}</strong>. It expires in 5 minutes.",
      ).replace(
        '<p style="margin:24px 0 0;color:#888',
        `${otpBlock("{otp}")}\n  <p style="margin:24px 0 0;color:#888`,
      ),
      tr: wrapTr(
        "Sentroy şifre sıfırlama kodu",
        "<strong>{userEmail}</strong> için şifre sıfırlamak amacıyla bu kodu kullanın. 5 dakika içinde geçerliliğini kaybeder.",
      ).replace(
        '<p style="margin:24px 0 0;color:#888',
        `${otpBlock("{otp}")}\n  <p style="margin:24px 0 0;color:#888`,
      ),
    },
  },
  {
    key: "auth.otp.generic",
    category: "otp",
    label: "Generic verification OTP",
    description:
      "Fallback code used when better-auth emits an OTP type we don't have a dedicated event for.",
    variables: [
      { name: "userEmail", description: "Recipient address.", sample: "jane@example.com" },
      { name: "otp", description: "Numeric code.", sample: "123 456" },
    ],
    defaultSubject: {
      en: "Sentroy verification code",
      tr: "Sentroy doğrulama kodu",
    },
    defaultHtmlBody: {
      en: wrap(
        "Sentroy verification code",
        "Use this code to continue. It expires in 5 minutes and can only be used once.",
      ).replace(
        '<p style="margin:24px 0 0;color:#888',
        `${otpBlock("{otp}")}\n  <p style="margin:24px 0 0;color:#888`,
      ),
      tr: wrapTr(
        "Sentroy doğrulama kodu",
        "Devam etmek için bu kodu kullanın. 5 dakika içinde geçerliliğini kaybeder ve yalnızca bir kez kullanılabilir.",
      ).replace(
        '<p style="margin:24px 0 0;color:#888',
        `${otpBlock("{otp}")}\n  <p style="margin:24px 0 0;color:#888`,
      ),
    },
  },
  {
    key: "auth.new-device-login",
    category: "auth",
    label: "New device sign-in",
    description:
      "Sent when a successful sign-in comes from an IP/user-agent we haven't seen on this account in the last 90 days. Heads-up only — link directs to active sessions for revoke.",
    variables: [
      { name: "userName", description: "Display name.", sample: "Jane Doe" },
      { name: "userEmail", description: "Account address.", sample: "jane@example.com" },
      { name: "ipAddress", description: "Client IP from x-forwarded-for / cf-connecting-ip.", sample: "82.222.0.1" },
      { name: "userAgent", description: "Browser user-agent excerpt.", sample: "Chrome 130 / macOS" },
      { name: "loginTime", description: "Timestamp the session was created.", sample: "2026-05-06 14:22 UTC" },
      { name: "sessionsUrl", description: "Link to active sessions page for review/revoke.", sample: "https://sentroy.com/en/profile?tab=sessions", escape: false },
    ],
    defaultSubject: {
      en: "New sign-in to your Sentroy account",
      tr: "Sentroy hesabınıza yeni bir oturum açıldı",
    },
    defaultHtmlBody: {
      en: wrap(
        "New sign-in to your account",
        "Hi {userName}, we noticed a new sign-in to <strong>{userEmail}</strong> from <strong>{ipAddress}</strong> ({userAgent}) at {loginTime}. If this was you, no action needed. If not, revoke the session immediately.",
        { url: "{sessionsUrl}", label: "Review active sessions" },
      ),
      tr: wrapTr(
        "Hesabınıza yeni bir oturum açıldı",
        "Merhaba {userName}, <strong>{userEmail}</strong> hesabınıza <strong>{ipAddress}</strong> ({userAgent}) konumundan {loginTime} tarihinde yeni bir oturum açıldı. Sizseniz bir şey yapmanız gerekmez. Sizi değilse oturumu derhal iptal edin.",
        { url: "{sessionsUrl}", label: "Oturumları gözden geçir" },
      ),
    },
  },
  {
    key: "status.subscriber.incident-update",
    category: "notification",
    label: "Status page — incident update",
    description:
      "Sent to verified subscribers when an incident timeline gets a new update (open / identified / monitoring / resolved).",
    variables: [
      { name: "pageName", description: "Status page display name.", sample: "Acme Status" },
      { name: "incidentTitle", description: "Incident title.", sample: "Mail delivery delays" },
      { name: "updateStatus", description: "Status of this update.", sample: "monitoring" },
      { name: "updateBody", description: "Update message.", sample: "Fix deployed; watching." },
      { name: "incidentUrl", description: "Public page link.", sample: "https://status.sentroy.com/p/acme", escape: false },
      { name: "preferencesUrl", description: "Manage preferences link.", sample: "https://status.sentroy.com/p/acme/preferences?token=xyz", escape: false },
      { name: "unsubscribeUrl", description: "One-click unsubscribe.", sample: "https://status.sentroy.com/api/v1/status/subscribe/unsubscribe?token=xyz", escape: false },
    ],
    defaultSubject: {
      en: "[{updateStatus}] {incidentTitle} — {pageName}",
      tr: "[{updateStatus}] {incidentTitle} — {pageName}",
    },
    defaultHtmlBody: {
      en: wrapSubscriber(
        "{incidentTitle}",
        "<strong>Status: {updateStatus}</strong><br><br>{updateBody}",
        { url: "{incidentUrl}", label: "View status page" },
        { preferences: "Manage preferences", unsubscribe: "Unsubscribe" },
      ),
      tr: wrapSubscriber(
        "{incidentTitle}",
        "<strong>Durum: {updateStatus}</strong><br><br>{updateBody}",
        { url: "{incidentUrl}", label: "Status sayfasını gör" },
        { preferences: "Tercihleri yönet", unsubscribe: "Aboneliği iptal et" },
      ),
    },
  },
  {
    key: "status.subscriber.maintenance-scheduled",
    category: "notification",
    label: "Status page — maintenance scheduled",
    description:
      "Sent when a new maintenance window is scheduled.",
    variables: [
      { name: "pageName", description: "Status page display name.", sample: "Acme Status" },
      { name: "maintenanceTitle", description: "Maintenance title.", sample: "Database upgrade" },
      { name: "maintenanceDescription", description: "Maintenance description.", sample: "Migrating to MongoDB 7." },
      { name: "scheduledStart", description: "Start UTC.", sample: "2026-06-01 02:00 UTC" },
      { name: "scheduledEnd", description: "End UTC.", sample: "2026-06-01 02:30 UTC" },
      { name: "pageUrl", description: "Public page link.", sample: "https://status.sentroy.com/p/acme", escape: false },
      { name: "preferencesUrl", description: "Manage preferences link.", sample: "https://status.sentroy.com/p/acme/preferences?token=xyz", escape: false },
      { name: "unsubscribeUrl", description: "One-click unsubscribe.", sample: "https://status.sentroy.com/api/v1/status/subscribe/unsubscribe?token=xyz", escape: false },
    ],
    defaultSubject: {
      en: "[Scheduled] {maintenanceTitle} — {pageName}",
      tr: "[Planlandı] {maintenanceTitle} — {pageName}",
    },
    defaultHtmlBody: {
      en: wrapSubscriber(
        "Scheduled maintenance: {maintenanceTitle}",
        "<strong>{scheduledStart} → {scheduledEnd}</strong><br><br>{maintenanceDescription}",
        { url: "{pageUrl}", label: "View status page" },
        { preferences: "Manage preferences", unsubscribe: "Unsubscribe" },
      ),
      tr: wrapSubscriber(
        "Planlı bakım: {maintenanceTitle}",
        "<strong>{scheduledStart} → {scheduledEnd}</strong><br><br>{maintenanceDescription}",
        { url: "{pageUrl}", label: "Status sayfasını gör" },
        { preferences: "Tercihleri yönet", unsubscribe: "Aboneliği iptal et" },
      ),
    },
  },
  {
    key: "status.subscriber.maintenance-reminder",
    category: "notification",
    label: "Status page — maintenance reminder (1h before)",
    description:
      "Sent 1 hour before a scheduled maintenance window begins.",
    variables: [
      { name: "pageName", description: "Status page display name.", sample: "Acme Status" },
      { name: "maintenanceTitle", description: "Maintenance title.", sample: "Database upgrade" },
      { name: "scheduledStart", description: "Start UTC.", sample: "2026-06-01 02:00 UTC" },
      { name: "pageUrl", description: "Public page link.", sample: "https://status.sentroy.com/p/acme", escape: false },
      { name: "preferencesUrl", description: "Manage preferences link.", sample: "https://status.sentroy.com/p/acme/preferences?token=xyz", escape: false },
      { name: "unsubscribeUrl", description: "One-click unsubscribe.", sample: "https://status.sentroy.com/api/v1/status/subscribe/unsubscribe?token=xyz", escape: false },
    ],
    defaultSubject: {
      en: "[Reminder] {maintenanceTitle} starts in 1 hour — {pageName}",
      tr: "[Hatırlatma] {maintenanceTitle} 1 saat sonra başlıyor — {pageName}",
    },
    defaultHtmlBody: {
      en: wrapSubscriber(
        "Maintenance starts soon",
        "<strong>{maintenanceTitle}</strong> is scheduled to begin at <strong>{scheduledStart}</strong> (in 1 hour).",
        { url: "{pageUrl}", label: "View status page" },
        { preferences: "Manage preferences", unsubscribe: "Unsubscribe" },
      ),
      tr: wrapSubscriber(
        "Bakım yakında başlıyor",
        "<strong>{maintenanceTitle}</strong> bakımı <strong>{scheduledStart}</strong>'da başlayacak (1 saat sonra).",
        { url: "{pageUrl}", label: "Status sayfasını gör" },
        { preferences: "Tercihleri yönet", unsubscribe: "Aboneliği iptal et" },
      ),
    },
  },
  {
    key: "status.subscriber.maintenance-started",
    category: "notification",
    label: "Status page — maintenance started",
    description: "Sent when a scheduled maintenance window transitions to 'in_progress'.",
    variables: [
      { name: "pageName", description: "Status page display name.", sample: "Acme Status" },
      { name: "maintenanceTitle", description: "Maintenance title.", sample: "Database upgrade" },
      { name: "scheduledEnd", description: "Expected end UTC.", sample: "2026-06-01 02:30 UTC" },
      { name: "pageUrl", description: "Public page link.", sample: "https://status.sentroy.com/p/acme", escape: false },
      { name: "preferencesUrl", description: "Manage preferences link.", sample: "https://status.sentroy.com/p/acme/preferences?token=xyz", escape: false },
      { name: "unsubscribeUrl", description: "One-click unsubscribe.", sample: "https://status.sentroy.com/api/v1/status/subscribe/unsubscribe?token=xyz", escape: false },
    ],
    defaultSubject: {
      en: "[Started] {maintenanceTitle} — {pageName}",
      tr: "[Başladı] {maintenanceTitle} — {pageName}",
    },
    defaultHtmlBody: {
      en: wrapSubscriber(
        "Maintenance in progress",
        "<strong>{maintenanceTitle}</strong> has started. Expected to complete by <strong>{scheduledEnd}</strong>.",
        { url: "{pageUrl}", label: "View status page" },
        { preferences: "Manage preferences", unsubscribe: "Unsubscribe" },
      ),
      tr: wrapSubscriber(
        "Bakım sürüyor",
        "<strong>{maintenanceTitle}</strong> başladı. Tamamlanması beklenen zaman: <strong>{scheduledEnd}</strong>.",
        { url: "{pageUrl}", label: "Status sayfasını gör" },
        { preferences: "Tercihleri yönet", unsubscribe: "Aboneliği iptal et" },
      ),
    },
  },
  {
    key: "status.subscriber.maintenance-completed",
    category: "notification",
    label: "Status page — maintenance completed",
    description: "Sent when a maintenance window finishes.",
    variables: [
      { name: "pageName", description: "Status page display name.", sample: "Acme Status" },
      { name: "maintenanceTitle", description: "Maintenance title.", sample: "Database upgrade" },
      { name: "pageUrl", description: "Public page link.", sample: "https://status.sentroy.com/p/acme", escape: false },
      { name: "preferencesUrl", description: "Manage preferences link.", sample: "https://status.sentroy.com/p/acme/preferences?token=xyz", escape: false },
      { name: "unsubscribeUrl", description: "One-click unsubscribe.", sample: "https://status.sentroy.com/api/v1/status/subscribe/unsubscribe?token=xyz", escape: false },
    ],
    defaultSubject: {
      en: "[Completed] {maintenanceTitle} — {pageName}",
      tr: "[Tamamlandı] {maintenanceTitle} — {pageName}",
    },
    defaultHtmlBody: {
      en: wrapSubscriber(
        "Maintenance completed",
        "<strong>{maintenanceTitle}</strong> has been completed. All systems are back to normal.",
        { url: "{pageUrl}", label: "View status page" },
        { preferences: "Manage preferences", unsubscribe: "Unsubscribe" },
      ),
      tr: wrapSubscriber(
        "Bakım tamamlandı",
        "<strong>{maintenanceTitle}</strong> tamamlandı. Tüm sistemler normale döndü.",
        { url: "{pageUrl}", label: "Status sayfasını gör" },
        { preferences: "Tercihleri yönet", unsubscribe: "Aboneliği iptal et" },
      ),
    },
  },
  {
    key: "status.subscriber.verify-email",
    category: "verification",
    label: "Status page subscriber — verify email",
    description:
      "Double opt-in confirmation sent when someone subscribes to a status page's email notifications.",
    variables: [
      { name: "pageName", description: "Public status page display name.", sample: "Acme Status" },
      { name: "subscriberEmail", description: "Email being verified.", sample: "alice@example.com" },
      { name: "verifyUrl", description: "Verify link with token.", sample: "https://status.sentroy.com/api/v1/status/subscribe/verify?token=xyz", escape: false },
      { name: "unsubscribeUrl", description: "One-click unsubscribe link.", sample: "https://status.sentroy.com/api/v1/status/subscribe/unsubscribe?token=xyz", escape: false },
    ],
    defaultSubject: {
      en: "Confirm your subscription to {pageName} status updates",
      tr: "{pageName} durum bildirimleri aboneliğinizi onaylayın",
    },
    defaultHtmlBody: {
      en: wrap(
        "Confirm your subscription",
        "Hi — confirm that <strong>{subscriberEmail}</strong> wants to receive incident and maintenance updates from <strong>{pageName}</strong>. If this wasn't you, just ignore this email.",
        { url: "{verifyUrl}", label: "Confirm subscription" },
      ),
      tr: wrapTr(
        "Aboneliği onaylayın",
        "<strong>{subscriberEmail}</strong> adresinin <strong>{pageName}</strong>'in olay ve bakım bildirimlerini almak istediğini onaylayın. Bu siz değilseniz görmezden gelin.",
        { url: "{verifyUrl}", label: "Aboneliği onayla" },
      ),
    },
  },
  {
    key: "invitation.created",
    category: "invitation",
    label: "Company invitation",
    description:
      "Sent when an admin invites a user to a company. The link expires in 7 days.",
    variables: [
      { name: "companyName", description: "Display name of the inviting company.", sample: "Acme Inc." },
      { name: "role", description: "Role assigned in the invitation.", sample: "admin" },
      { name: "acceptUrl", description: "Invite acceptance URL.", sample: "https://sentroy.com/invites/xyz", escape: false },
      { name: "actionVerb", description: "Either 'join' (existing user) or 'create your account and join'.", sample: "join" },
    ],
    defaultSubject: {
      en: "You're invited to {companyName} on Sentroy",
      tr: "Sentroy'da {companyName} ekibine davetlisiniz",
    },
    defaultHtmlBody: {
      en: wrap(
        "You're invited to {companyName} on Sentroy",
        "Click below to {actionVerb} <strong>{companyName}</strong> as a <strong>{role}</strong>. The invitation expires in 7 days.",
        { url: "{acceptUrl}", label: "Accept invitation" },
      ),
      tr: wrapTr(
        "Sentroy'da {companyName} ekibine davetlisiniz",
        "<strong>{companyName}</strong> ekibine <strong>{role}</strong> olarak {actionVerb} için aşağıya tıklayın. Davet 7 gün sonra geçerliliğini kaybeder.",
        { url: "{acceptUrl}", label: "Daveti kabul et" },
      ),
    },
  },
  {
    key: "company.ownership-transfer-code",
    category: "otp",
    label: "Ownership transfer code",
    description:
      "Sent to the current owner when they start a company ownership transfer. Contains a 6-digit confirmation code, valid 15 minutes.",
    variables: [
      { name: "ownerName", description: "Display name of the current owner (recipient).", sample: "Alice" },
      { name: "companyName", description: "Company being transferred.", sample: "Acme Inc." },
      { name: "targetName", description: "Display name of the member receiving ownership.", sample: "Bob" },
      { name: "code", description: "6-digit confirmation code.", sample: "123456" },
    ],
    defaultSubject: {
      en: "Confirm ownership transfer for {companyName}",
      tr: "{companyName} sahiplik devrini onaylayın",
    },
    defaultHtmlBody: {
      en: wrap(
        "Confirm ownership transfer",
        "Hi {ownerName} — you're transferring ownership of <strong>{companyName}</strong> to <strong>{targetName}</strong>. Enter this code to confirm:<br><br><strong style=\"font-size:24px;letter-spacing:4px\">{code}</strong><br><br>This code expires in 15 minutes. If you didn't request this, ignore this email and consider changing your password.",
      ),
      tr: wrapTr(
        "Sahiplik devrini onaylayın",
        "Merhaba {ownerName} — <strong>{companyName}</strong> sahipliğini <strong>{targetName}</strong> kullanıcısına devrediyorsunuz. Onaylamak için bu kodu girin:<br><br><strong style=\"font-size:24px;letter-spacing:4px\">{code}</strong><br><br>Kod 15 dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayın ve parolanızı değiştirmeyi düşünün.",
      ),
    },
  },
  {
    key: "app.submission.received",
    category: "notification",
    label: "App submission received",
    description:
      "Sent to the developer when an App Store submission is received and enters the review queue.",
    variables: [
      { name: "appName", description: "Submitted app name.", sample: "Resend" },
      { name: "dashboardUrl", description: "Link to the submission status in the dashboard.", sample: "https://sentroy.com/en/d/acme/apps", escape: false },
    ],
    defaultSubject: {
      en: "{appName} submitted — review in progress",
      tr: "{appName} gönderildi — inceleme başladı",
    },
    defaultHtmlBody: {
      en: wrap(
        "We're reviewing {appName}",
        "Thanks for submitting <strong>{appName}</strong> to the Sentroy App Store. Our team is reviewing it — you'll hear back shortly. You can track the status from your dashboard.",
        { url: "{dashboardUrl}", label: "View submission" },
      ),
      tr: wrapTr(
        "{appName} inceleniyor",
        "<strong>{appName}</strong> uygulamasını Sentroy App Store'a gönderdiğiniz için teşekkürler. Ekibimiz inceliyor — kısa süre içinde dönüş yapacağız. Durumu panonuzdan takip edebilirsiniz.",
        { url: "{dashboardUrl}", label: "Gönderimi gör" },
      ),
    },
  },
  {
    key: "app.approved",
    category: "notification",
    label: "App approved",
    description:
      "Sent to the developer when their App Store submission is approved and published.",
    variables: [
      { name: "appName", description: "Approved app name.", sample: "Resend" },
      { name: "storeUrl", description: "Public store listing URL.", sample: "https://sentroy.com/en/store/resend", escape: false },
    ],
    defaultSubject: {
      en: "{appName} is live on the Sentroy App Store 🎉",
      tr: "{appName} Sentroy App Store'da yayında 🎉",
    },
    defaultHtmlBody: {
      en: wrap(
        "{appName} is approved",
        "Great news — <strong>{appName}</strong> passed review and is now live on the Sentroy App Store. Users can install it from the store.",
        { url: "{storeUrl}", label: "Open store listing" },
      ),
      tr: wrapTr(
        "{appName} onaylandı",
        "Harika haber — <strong>{appName}</strong> incelemeyi geçti ve Sentroy App Store'da yayında. Kullanıcılar mağazadan kurabilir.",
        { url: "{storeUrl}", label: "Mağaza sayfasını aç" },
      ),
    },
  },
  {
    key: "app.rejected",
    category: "notification",
    label: "App changes requested",
    description:
      "Sent to the developer when an App Store submission is rejected with a reason / changes requested.",
    variables: [
      { name: "appName", description: "App name.", sample: "Resend" },
      { name: "reason", description: "Reviewer's note explaining what to change.", sample: "Privacy policy URL returns 404." },
      { name: "dashboardUrl", description: "Link to resubmit from the dashboard.", sample: "https://sentroy.com/en/d/acme/apps", escape: false },
    ],
    defaultSubject: {
      en: "Changes requested for {appName}",
      tr: "{appName} için değişiklik isteniyor",
    },
    defaultHtmlBody: {
      en: wrap(
        "Changes requested for {appName}",
        "We reviewed <strong>{appName}</strong> and need a few changes before it can go live:<br><br><em>{reason}</em><br><br>Update your manifest and resubmit from your dashboard.",
        { url: "{dashboardUrl}", label: "Review & resubmit" },
      ),
      tr: wrapTr(
        "{appName} için değişiklik isteniyor",
        "<strong>{appName}</strong> uygulamasını inceledik; yayına girmeden önce birkaç değişiklik gerekiyor:<br><br><em>{reason}</em><br><br>Manifest'inizi güncelleyip panonuzdan tekrar gönderin.",
        { url: "{dashboardUrl}", label: "İncele ve tekrar gönder" },
      ),
    },
  },
  {
    key: "contact.received",
    category: "notification",
    label: "Contact form — acknowledgement",
    description:
      "Sent to the submitter confirming Sentroy received their contact-form message, echoing it back.",
    variables: [
      { name: "name", description: "Submitter display name.", sample: "Jane Doe" },
      { name: "message", description: "The message they submitted (pre-formatted HTML).", sample: "I have a question about pricing.", escape: false },
    ],
    defaultSubject: {
      en: "We got your message — Sentroy",
      tr: "Mesajınızı aldık — Sentroy",
    },
    defaultHtmlBody: {
      en: wrap(
        "Thanks, {name}",
        "We received your message and our team will get back to you soon. Here's a copy for your records:<br><br><em>{message}</em>",
      ),
      tr: wrapTr(
        "Teşekkürler, {name}",
        "Mesajınızı aldık, ekibimiz en kısa sürede dönüş yapacak. Kayıtlarınız için bir kopyası:<br><br><em>{message}</em>",
      ),
    },
  },
  {
    key: "contact.reply",
    category: "notification",
    label: "Contact form — reply",
    description:
      "Sent to the submitter with Sentroy's reply and their original message quoted below.",
    variables: [
      { name: "name", description: "Submitter display name.", sample: "Jane Doe" },
      { name: "replyBody", description: "The team's reply (pre-formatted HTML).", sample: "Happy to help — here are our plans...", escape: false },
      { name: "originalMessage", description: "The submitter's original message (pre-formatted HTML).", sample: "I have a question about pricing.", escape: false },
    ],
    defaultSubject: {
      en: "Re: your message to Sentroy",
      tr: "Yanıt: Sentroy'a mesajınız",
    },
    defaultHtmlBody: {
      en: wrap(
        "Hi {name}",
        "{replyBody}<br><br><hr style=\"border:none;border-top:1px solid #e5e5e5;margin:16px 0\"><small style=\"color:#888\">Your original message:<br><em>{originalMessage}</em></small>",
      ),
      tr: wrapTr(
        "Merhaba {name}",
        "{replyBody}<br><br><hr style=\"border:none;border-top:1px solid #e5e5e5;margin:16px 0\"><small style=\"color:#888\">Gönderdiğiniz mesaj:<br><em>{originalMessage}</em></small>",
      ),
    },
  },
]

const REGISTRY_BY_KEY: Map<string, SystemMailEventDefinition> = new Map(
  SYSTEM_MAIL_EVENTS.map((e) => [e.key, e]),
)

export function getSystemMailEvent(
  key: string,
): SystemMailEventDefinition | null {
  return REGISTRY_BY_KEY.get(key) ?? null
}

export function listSystemMailEvents(): SystemMailEventDefinition[] {
  return SYSTEM_MAIL_EVENTS
}

/* ─── Resolver — apps/core injects a DB-backed override lookup ───────── */

/**
 * Resolved subject + body for a given event/locale. `null` from the
 * resolver means "no override on file", we use the registry default.
 */
export interface SystemMailEventOverride {
  subject: LocalizedString
  htmlBody: LocalizedString
  /** When false, we skip the send entirely (admin-disabled event). */
  enabled: boolean
}

export type SystemMailEventResolver = (
  eventKey: string,
) => Promise<SystemMailEventOverride | null>

let resolver: SystemMailEventResolver | null = null

export function setSystemMailEventResolver(
  fn: SystemMailEventResolver | null,
): void {
  resolver = fn
}

export function getSystemMailEventResolver():
  | SystemMailEventResolver
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Mustache-ish substitution. Implemented inline (not imported from
 * `@workspace/ui/lib/email-template`) so that this module stays
 * server-only and free of UI package fan-in. Behaviour is identical
 * for the scalar case used here — we don't use sections in default
 * templates.
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
 * Render an event into a concrete subject+html+text payload using the
 * given variables. `subject`/`htmlBody` overrides win over registry
 * defaults; missing locales fall back to `en`. Each variable value is
 * HTML-escaped unless its definition has `escape: false`.
 */
export interface RenderedSystemMail {
  subject: string
  html: string
  text: string
}

export interface RenderSystemMailEventOptions {
  /** Pre-resolved override subject/body. When omitted, the global
   *  resolver is consulted; if that's also missing we use defaults. */
  override?: SystemMailEventOverride | null
  /** Per-call subject/body — the admin preview endpoint passes draft
   *  copy here so it can render before saving. Wins over override. */
  draft?: { subject?: LocalizedString; htmlBody?: LocalizedString }
}

export async function renderSystemMailEvent(
  eventKey: string,
  locale: string,
  variables: Record<string, string | number | boolean>,
  options: RenderSystemMailEventOptions = {},
): Promise<RenderedSystemMail | null> {
  const def = getSystemMailEvent(eventKey)
  if (!def) {
    console.warn(`[system-mail-events] unknown event key: ${eventKey}`)
    return null
  }

  const lang = resolveLocale(locale)

  let override = options.override
  if (override === undefined) {
    const r = getSystemMailEventResolver()
    override = r ? await r(eventKey) : null
  }

  if (override && override.enabled === false) {
    return null
  }

  const subjectSrc =
    pickLocalized(options.draft?.subject, lang) ??
    pickLocalized(override?.subject, lang) ??
    pickLocalized(def.defaultSubject, lang) ??
    pickLocalized(def.defaultSubject, DEFAULT_LOCALE) ??
    eventKey
  const htmlSrc =
    pickLocalized(options.draft?.htmlBody, lang) ??
    pickLocalized(override?.htmlBody, lang) ??
    pickLocalized(def.defaultHtmlBody, lang) ??
    pickLocalized(def.defaultHtmlBody, DEFAULT_LOCALE) ??
    ""

  // HTML-escape variables (URLs and other trusted strings opt out via
  // `escape: false` in the registry definition).
  const escapeMap = new Map<string, boolean>()
  for (const v of def.variables) {
    escapeMap.set(v.name, v.escape !== false)
  }
  const safeVars: Record<string, string> = {}
  for (const [k, v] of Object.entries(variables)) {
    const stringified = String(v ?? "")
    safeVars[k] = escapeMap.get(k) === false ? stringified : escapeHtml(stringified)
  }

  const subject = substitute(subjectSrc, safeVars)
  const html = substitute(htmlSrc, safeVars)

  // Plain-text fallback — strip tags for a deliverable text/plain body.
  // Not perfect, but adequate for transactional one-paragraph copy.
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

/**
 * Resolve event copy → render → hand to the registered system mail
 * sender. Returns the sender result (or `{ sent: false, reason }` on
 * any earlier short-circuit). Throw-free; caller decides whether to
 * surface failure to the end user.
 */
export interface SendSystemMailEventOptions {
  to: string
  locale?: string | null
  variables: Record<string, string | number | boolean>
  /** Override the registered sender — useful in tests. */
  sender?: SystemMailSender
}

export async function sendSystemMailEvent(
  eventKey: string,
  options: SendSystemMailEventOptions,
): Promise<{ sent: boolean; reason?: string }> {
  const send = options.sender ?? getSystemMailSender()
  if (!send) {
    return { sent: false, reason: "no-sender" }
  }

  const rendered = await renderSystemMailEvent(
    eventKey,
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

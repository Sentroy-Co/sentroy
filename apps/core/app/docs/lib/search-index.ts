/**
 * Static, hand-curated search index. We accept the maintenance cost of
 * keeping this in sync with the page sections in exchange for zero
 * client bundle hit from a full-text indexer and instant cmdk filtering.
 *
 * Each entry is one searchable target: page heading, anchor section, or
 * resource. `keywords` widen the match surface beyond the visible label.
 */

import { NAV_SECTIONS } from "./nav"

export type SearchEntry = {
  /** Grup başlığı — palette dinamik gruplar; hand-curated + nav-türevi
   *  (NavSection.title) serbest string. */
  group: string
  label: string
  href: string
  /** Cross-subdomain ya da harici link — palette plain `<a>` kullansın
   *  ki next/link client-side nav denemesin. */
  external?: boolean
  description?: string
  keywords?: string
}

const HAND_CURATED: SearchEntry[] = [
  // ── Pages ─────────────────────────────────────────────────────────
  { group: "Pages", label: "Overview", href: "/docs", description: "Quickstart, install, authenticate", keywords: "intro getting started install sdk" },
  { group: "Pages", label: "Start a project", href: "/docs/create-app", description: "Scaffold a Next.js app with create-sentroy-app", keywords: "create-sentroy-app scaffold cli starter boilerplate template next.js shadcn mui npm create" },
  { group: "Pages", label: "Mail reference", href: "/docs/mail", description: "Domains, mailboxes, templates, inbox, send" },
  { group: "Pages", label: "Storage reference", href: "/docs/storage", description: "Buckets, media, thumbnails" },
  { group: "Pages", label: "React components", href: "/docs/react", description: "MediaManager, Trigger, Lightbox" },

  // ── Overview anchors ──────────────────────────────────────────────
  { group: "Pages", label: "Installation", href: "/docs#installation", keywords: "npm install package sdk add" },
  { group: "Pages", label: "Quick start", href: "/docs#quickstart", keywords: "first send sample code" },
  { group: "Pages", label: "Authentication", href: "/docs#authentication", keywords: "token bearer access stk auth" },
  { group: "Pages", label: "Error handling", href: "/docs#errors", keywords: "401 403 500 SentroyError catch" },
  { group: "Pages", label: "For AI agents", href: "/docs#ai-agents", keywords: "llm raw markdown" },

  // ── Mail anchors ──────────────────────────────────────────────────
  { group: "Mail", label: "Domains", href: "/docs/mail#domains", description: "List + retrieve verified domains" },
  { group: "Mail", label: "Mailboxes", href: "/docs/mail#mailboxes", description: "IMAP mailbox accounts" },
  { group: "Mail", label: "Templates", href: "/docs/mail#templates", description: "MJML email templates" },
  { group: "Mail", label: "Inbox", href: "/docs/mail#inbox", description: "Read, list, move, delete messages" },
  { group: "Mail", label: "Send email", href: "/docs/mail#send", description: "Transactional + bulk send" },
  { group: "Mail", label: "Send with template", href: "/docs/mail#send-template", keywords: "templateId variables placeholder" },
  { group: "Mail", label: "Send with raw HTML", href: "/docs/mail#send-html", keywords: "html body rich text" },
  { group: "Mail", label: "Send with attachments", href: "/docs/mail#send-attachments", keywords: "file attachment base64 pdf" },
  { group: "Mail", label: "Audience — contacts", href: "/docs/mail#audience-contacts-list", keywords: "contact list segmentation tag" },
  { group: "Mail", label: "Audience — search contacts", href: "/docs/mail#audience-contacts-search", keywords: "autocomplete typeahead email" },
  { group: "Mail", label: "Audience lists", href: "/docs/mail#audience-lists", keywords: "list group segment newsletter" },
  { group: "Mail", label: "Audience list members", href: "/docs/mail#audience-list-members", keywords: "add remove member contact" },
  { group: "Mail", label: "Suppressions", href: "/docs/mail#suppressions", description: "Manage opt-outs and bounces" },
  { group: "Mail", label: "Webhooks", href: "/docs/mail#webhooks", description: "Subscribe to delivery events" },
  { group: "Mail", label: "Webhook events", href: "/docs/mail#webhooks-events", keywords: "sent bounced opened clicked unsubscribed" },
  { group: "Mail", label: "Webhook test fire", href: "/docs/mail#webhooks-test", keywords: "manual debug test payload dispatch" },
  { group: "Mail", label: "Webhook deliveries", href: "/docs/mail#webhooks-deliveries", keywords: "history log inspector replay" },
  { group: "Mail", label: "Logs", href: "/docs/mail#logs", description: "Mail-log query for debugging" },

  // ── Storage anchors ───────────────────────────────────────────────
  { group: "Storage", label: "Buckets", href: "/docs/storage#buckets", description: "List, create, update, delete" },
  { group: "Storage", label: "List buckets", href: "/docs/storage#buckets-list" },
  { group: "Storage", label: "Create bucket", href: "/docs/storage#buckets-create" },
  { group: "Storage", label: "Update bucket", href: "/docs/storage#buckets-update" },
  { group: "Storage", label: "Delete bucket", href: "/docs/storage#buckets-delete", keywords: "force purge cascade" },
  { group: "Storage", label: "Media", href: "/docs/storage#media", description: "Upload, list, download, delete" },
  { group: "Storage", label: "Upload media", href: "/docs/storage#media-upload", keywords: "file blob browser node" },
  { group: "Storage", label: "Download media", href: "/docs/storage#media-download", keywords: "stream proxy quality" },
  { group: "Storage", label: "Thumbnails", href: "/docs/storage#thumbnails", keywords: "image resize variant cdn pickThumbnailUrl" },

  // ── WhatsApp anchors ──────────────────────────────────────────────
  { group: "WhatsApp", label: "WhatsApp overview", href: "/docs/whatsapp", description: "Templates, audiences, template-based send", keywords: "whatsapp santral messaging number send" },
  { group: "WhatsApp", label: "Numbers", href: "/docs/whatsapp#numbers", description: "List connected WhatsApp numbers", keywords: "number session from connected phone" },
  { group: "WhatsApp", label: "Templates", href: "/docs/whatsapp#templates", description: "Reusable messages with {{variables}}", keywords: "template variable placeholder message create" },
  { group: "WhatsApp", label: "Audiences", href: "/docs/whatsapp#audiences", description: "Phone-based target lists", keywords: "audience list bulk recipients segment phone" },
  { group: "WhatsApp", label: "Send", href: "/docs/whatsapp#send", description: "Send a template to one recipient or an audience", keywords: "send message template bulk audience variables" },
  { group: "WhatsApp", label: "Send logs", href: "/docs/whatsapp#logs", description: "API/template send logs", keywords: "log delivery status sent failed history" },

  // ── React anchors ─────────────────────────────────────────────────
  { group: "React", label: "MediaManager", href: "/docs/react#media-manager", description: "Drop-in storage browser" },
  { group: "React", label: "MediaManagerTrigger", href: "/docs/react#media-manager-trigger", description: "Modal media picker wrapper" },
  { group: "React", label: "Lightbox", href: "/docs/react#lightbox", description: "Standalone fullscreen viewer" },
  { group: "React", label: "Helpers", href: "/docs/react#helpers", keywords: "cn formatBytes detectKind matchAccept" },

  // ── Tools ─────────────────────────────────────────────────────────
  { group: "Tools", label: "cURL generator", href: "/docs/tools/curl", description: "Build a ready-to-paste cURL with your token", keywords: "curl http request playground generator" },
  { group: "Tools", label: "Env Vault", href: "/docs/env-vault", description: "Runtime env management for your apps", keywords: "env vault secret config doppler infisical" },
  { group: "Tools", label: "Sentroy Auth", href: "/docs/auth", description: "OAuth 2.0 / OIDC provider — Sign in with Sentroy", keywords: "auth oauth oidc openid login signin sso" },
  { group: "Tools", label: "Status page", href: process.env.NEXT_PUBLIC_STATUS_URL || "https://status.sentroy.com", external: true, description: "Real-time service status", keywords: "uptime incidents monitoring" },
  { group: "Tools", label: "CLI overview", href: "/docs/cli", keywords: "sentroy command line bash terminal" },
  { group: "Tools", label: "CLI mail commands", href: "/docs/cli#mail", keywords: "mail templates domains mailboxes" },
  { group: "Tools", label: "CLI storage commands", href: "/docs/cli#storage", keywords: "buckets media usage" },
  { group: "Tools", label: "CLI whatsapp commands", href: "/docs/cli#whatsapp", keywords: "sentroy whatsapp numbers templates send logs" },
  { group: "Tools", label: "CLI env vault", href: "/docs/cli#env-vault", keywords: "sentroy env push pull" },
  { group: "Tools", label: "AI Skills install", href: "/docs/ai-skills", keywords: "claude cursor windsurf agent llm hands off" },

  // ── Auth Projects (grouped under Pages since SearchIndex has no Auth group) ─
  { group: "Pages", label: "Auth Projects overview", href: "/docs/auth-projects", description: "Auth-as-a-Service: signup, login, JWT, password reset", keywords: "auth project firebase alternative end-user pool" },
  { group: "Pages", label: "Auth Projects Quickstart", href: "/docs/auth-projects#quickstart", keywords: "TypeScript React Node curl SentroyAuth signin signup" },
  { group: "Pages", label: "Auth — React SDK", href: "/docs/auth-projects#sdk-react", keywords: "useAuth useUser useSessions hooks provider" },
  { group: "Pages", label: "Auth — React Native / Expo", href: "/docs/auth-projects#react-native", keywords: "expo react-native AsyncStorage SecureStore mobile" },
  { group: "Pages", label: "Auth — Framework setup", href: "/docs/auth-projects#framework-setup", keywords: "next.js vite remix svelte vanilla recipe" },
  { group: "Pages", label: "Auth — User data management", href: "/docs/auth-projects#user-data", keywords: "schema metadata sync webhook gdpr retention" },
  { group: "Pages", label: "Auth — Social federation", href: "/docs/auth-projects#social", keywords: "google github oauth provider" },
  { group: "Pages", label: "Auth — MFA / TOTP", href: "/docs/auth-projects#mfa", keywords: "two-factor totp authenticator" },
  { group: "Pages", label: "Auth — Passkey / WebAuthn", href: "/docs/auth-projects#passkey", keywords: "passkey webauthn biometric" },
  { group: "Pages", label: "Auth — Webhooks", href: "/docs/auth-projects#webhooks", keywords: "event signup login signature" },
  { group: "Pages", label: "Auth — REST endpoints", href: "/docs/auth-projects#endpoints", keywords: "rest api signup login refresh userinfo jwks examples" },
  { group: "Pages", label: "Auth — Migration / import", href: "/docs/auth-projects#migration", keywords: "csv import migrate auth0 firebase cognito" },

  // ── Compare ────────────────────────────────────────────────────────
  { group: "Compare", label: "Sentroy vs Resend", href: "/docs/compare/resend", description: "Transactional email API comparison", keywords: "resend alternative email api compare" },
  { group: "Compare", label: "Sentroy vs Mailgun", href: "/docs/compare/mailgun", description: "Transactional email API comparison", keywords: "mailgun alternative email api compare" },
  { group: "Compare", label: "Sentroy vs Firebase Auth", href: "/docs/compare/firebase-auth", description: "Auth-as-a-service comparison", keywords: "firebase auth alternative compare baas" },
  { group: "Compare", label: "Sentroy vs AWS S3", href: "/docs/compare/s3", description: "Object storage + CDN comparison", keywords: "s3 alternative storage compare r2 backblaze" },
  { group: "Compare", label: "Sentroy vs Doppler", href: "/docs/compare/doppler", description: "Env vault + secrets manager comparison", keywords: "doppler infisical alternative env vault compare" },
]

// ── Nav-derived coverage ──────────────────────────────────────────────
// Sidebar'daki (NAV_SECTIONS) HER dökümanı otomatik aranabilir yap — böylece
// yeni bir docs sayfası/anchor eklendiğinde search'e ayrıca eklemeyi unutmak
// imkânsız. Hand-curated girdiler (zengin keywords/description) href bazında
// önceliklidir; nav yalnız eksikleri doldurur.
const _seen = new Set(HAND_CURATED.map((e) => e.href))
const NAV_DERIVED: SearchEntry[] = []
for (const section of NAV_SECTIONS) {
  for (const it of section.items) {
    if (it.external || _seen.has(it.href)) continue
    _seen.add(it.href)
    NAV_DERIVED.push({ group: section.title, label: it.label, href: it.href })
  }
}

export const SEARCH_INDEX: SearchEntry[] = [...HAND_CURATED, ...NAV_DERIVED]

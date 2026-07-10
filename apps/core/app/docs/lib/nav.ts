export type NavItem = {
  href: string
  label: string
  hash?: string
  /** Cross-subdomain ya da harici link — `next/link` yerine plain `<a>`
   *  ile render edilir, target="_blank" gerekirse caller karar verir. */
  external?: boolean
}

export type NavSection = {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/create-app", label: "Start a project" },
      { href: "/docs#installation", label: "Installation" },
      { href: "/docs#quickstart", label: "Quick start" },
      { href: "/docs#authentication", label: "Authentication" },
      { href: "/docs#errors", label: "Error handling" },
      { href: "/docs#ai-agents", label: "For AI agents" },
    ],
  },
  {
    title: "Mail",
    items: [
      { href: "/docs/mail", label: "Mail overview" },
      { href: "/docs/mail#domains", label: "Domains" },
      { href: "/docs/mail#mailboxes", label: "Mailboxes" },
      { href: "/docs/mail#templates", label: "Templates" },
      { href: "/docs/mail#templates-create", label: "Creating templates" },
      { href: "/docs/mail#template-variables", label: "Template variables" },
      { href: "/docs/mail#inbox", label: "Inbox" },
      { href: "/docs/mail#send", label: "Send" },
      { href: "/docs/mail#audience", label: "Audience" },
      { href: "/docs/mail#suppressions", label: "Suppressions" },
      { href: "/docs/mail#webhooks", label: "Webhooks" },
      { href: "/docs/mail#webhooks-test", label: "Webhook test fire" },
      { href: "/docs/mail#webhooks-deliveries", label: "Webhook deliveries" },
      { href: "/docs/mail#logs", label: "Logs" },
    ],
  },
  {
    title: "Storage",
    items: [
      { href: "/docs/storage", label: "Storage overview" },
      { href: "/docs/storage#buckets", label: "Buckets" },
      { href: "/docs/storage#media", label: "Media" },
      { href: "/docs/storage#thumbnails", label: "Thumbnails" },
    ],
  },
  {
    title: "WhatsApp",
    items: [
      { href: "/docs/whatsapp", label: "WhatsApp overview" },
      { href: "/docs/whatsapp#numbers", label: "Numbers" },
      { href: "/docs/whatsapp#templates", label: "Templates" },
      { href: "/docs/whatsapp#audiences", label: "Audiences" },
      { href: "/docs/whatsapp#send", label: "Send" },
      { href: "/docs/whatsapp#logs", label: "Send logs" },
    ],
  },
  {
    title: "React",
    items: [
      { href: "/docs/react", label: "React overview" },
      { href: "/docs/react#media-manager", label: "MediaManager" },
      { href: "/docs/react#media-manager-trigger", label: "MediaManagerTrigger" },
      { href: "/docs/react#lightbox", label: "Lightbox" },
      { href: "/docs/react#helpers", label: "Helpers" },
    ],
  },
  {
    title: "Auth Projects",
    items: [
      { href: "/docs/auth-projects", label: "Overview" },
      { href: "/docs/auth-projects#vs-oauth", label: "vs Sign in with Sentroy" },
      { href: "/docs/auth-projects#setup", label: "Setup" },
      { href: "/docs/auth-projects#quickstart", label: "Quickstart" },
      { href: "/docs/auth-projects#sdk-react", label: "React SDK" },
      { href: "/docs/auth-projects#react-native", label: "React Native / Expo" },
      { href: "/docs/auth-projects#framework-setup", label: "Framework setup" },
      { href: "/docs/auth-projects#social", label: "Social federation" },
      { href: "/docs/auth-projects#magic-link", label: "Magic link" },
      { href: "/docs/auth-projects#mfa", label: "MFA (TOTP)" },
      { href: "/docs/auth-projects#passkey", label: "Passkey / WebAuthn" },
      { href: "/docs/auth-projects#invitation", label: "Invitation flow" },
      { href: "/docs/auth-projects#self-service", label: "Self-service /me" },
      { href: "/docs/auth-projects#user-data", label: "User data management" },
      { href: "/docs/auth-projects#hosted-ui", label: "Hosted UI" },
      { href: "/docs/auth-projects#webhooks", label: "Webhooks" },
      { href: "/docs/auth-projects#endpoints", label: "REST endpoints" },
      { href: "/docs/auth-projects#jwt", label: "ID token claims" },
      { href: "/docs/auth-projects#custom-claims", label: "Custom claims" },
      { href: "/docs/auth-projects#mail", label: "Email templates" },
      { href: "/docs/auth-projects#migration", label: "Migration" },
      { href: "/docs/auth-projects#user-management", label: "User pool" },
      { href: "/docs/auth-projects#security", label: "Security" },
    ],
  },
  {
    title: "Status Pages",
    items: [
      { href: "/docs/status-pages", label: "Overview" },
      { href: "/docs/status-pages#setup", label: "Setup" },
      { href: "/docs/status-pages#components-checks", label: "Components & checks" },
      { href: "/docs/status-pages#incidents", label: "Incidents" },
      { href: "/docs/status-pages#maintenance", label: "Maintenance" },
      { href: "/docs/status-pages#restart-targets", label: "Restart targets" },
      { href: "/docs/status-pages#subscribers", label: "Subscribers" },
      { href: "/docs/status-pages#snapshot-api", label: "Public snapshot API" },
      { href: "/docs/status-pages#embed", label: "Embed widget" },
      { href: "/docs/status-pages#webhook-signature", label: "Webhook signature" },
    ],
  },
  {
    title: "App Store",
    items: [
      { href: "/docs/app-store", label: "Overview" },
      { href: "/docs/app-store#manifest", label: "The manifest" },
      { href: "/docs/app-store#submit", label: "Submitting" },
      { href: "/docs/app-store#verify-origin", label: "Verifying your origin" },
      { href: "/docs/app-store#embed-token", label: "Embed token" },
      { href: "/docs/app-store#security", label: "Security" },
      { href: "/docs/app-store#review", label: "Review & versioning" },
    ],
  },
  {
    title: "Compare",
    items: [
      { href: "/docs/compare/resend", label: "vs Resend" },
      { href: "/docs/compare/mailgun", label: "vs Mailgun" },
      { href: "/docs/compare/firebase-auth", label: "vs Firebase Auth" },
      { href: "/docs/compare/s3", label: "vs AWS S3" },
      { href: "/docs/compare/doppler", label: "vs Doppler" },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/docs/env-vault", label: "Env Vault" },
      { href: "/docs/cli", label: "CLI" },
      { href: "/docs/ai-skills", label: "AI Skills" },
      { href: "/docs/auth", label: "Sentroy Auth (OAuth)" },
      { href: "/docs/tools/curl", label: "cURL generator" },
      // Cross-subdomain — proxy /status'i status.sentroy.com'a redirect
      // ediyor, ama o redirect'i bedavaya almamak için doğrudan absolute
      // URL veriyoruz. Env override'ı dev'de localhost:3000/status'a
      // düşmeyi sağlar.
      {
        href:
          process.env.NEXT_PUBLIC_STATUS_URL || "https://status.sentroy.com",
        label: "Status page",
        external: true,
      },
    ],
  },
  {
    // Plain-text, LLM-optimised mirrors of these docs — served at the site
    // root (apps/core/public/*, bkz. proxy PUBLIC_PASSTHROUGH). Feed the raw
    // URL straight into an agent's context window. `external` → plain <a>
    // (statik dosya, app route değil).
    title: "For LLMs",
    items: [
      { href: "/llms.txt", label: "llms.txt — index", external: true },
      { href: "/llms-full.txt", label: "llms-full.txt — everything", external: true },
      { href: "/llms-mail.txt", label: "llms-mail.txt", external: true },
      { href: "/llms-storage.txt", label: "llms-storage.txt", external: true },
      { href: "/llms-auth.txt", label: "llms-auth.txt", external: true },
      { href: "/llms-vault.txt", label: "llms-vault.txt", external: true },
      { href: "/skill.md", label: "skill.md (Anthropic Skill)", external: true },
      { href: "/agents.md", label: "agents.md (universal)", external: true },
    ],
  },
]

export const PAGE_ORDER = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/create-app", label: "Start a project" },
  { href: "/docs/mail", label: "Mail" },
  { href: "/docs/storage", label: "Storage" },
  { href: "/docs/whatsapp", label: "WhatsApp" },
  { href: "/docs/react", label: "React" },
  { href: "/docs/env-vault", label: "Env Vault" },
  { href: "/docs/cli", label: "CLI" },
  { href: "/docs/ai-skills", label: "AI Skills" },
  { href: "/docs/auth", label: "Sentroy Auth (OAuth)" },
  { href: "/docs/auth-projects", label: "Auth Projects" },
  { href: "/docs/status-pages", label: "Status Pages" },
  { href: "/docs/app-store", label: "App Store" },
  { href: "/docs/compare/resend", label: "vs Resend" },
  { href: "/docs/compare/mailgun", label: "vs Mailgun" },
  { href: "/docs/compare/firebase-auth", label: "vs Firebase Auth" },
  { href: "/docs/compare/s3", label: "vs AWS S3" },
  { href: "/docs/compare/doppler", label: "vs Doppler" },
]

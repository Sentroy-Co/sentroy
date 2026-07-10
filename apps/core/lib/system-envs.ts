/**
 * Sentroy'un kendi vault projelerinin ve migrate edilmiş env'lerinin
 * tek-doğruluk-kaynak (single source of truth) registry'si.
 *
 * Yeni bir env vault'a migrate edildiğinde buraya bir entry eklenir.
 * Diagnostic page (`/admin/env-vault/system`) bu listeyi render eder
 * ve her bir env için vault state + process.env state karşılaştırır.
 *
 * `seedSystemProjects()` idempotent — her `/admin/env-vault` ilk
 * load'unda projeler garantili oluşturulur (mevcut admin edits dokunulmaz).
 */

import { envProjectModel } from "@workspace/db/models"

export interface SystemProject {
  slug: "sentroy-core" | "sentroy-mail" | "sentroy-storage"
  name: string
  description: string
  defaultEnvironment: string
}

export const SYSTEM_PROJECTS: readonly SystemProject[] = [
  {
    slug: "sentroy-core",
    name: "Sentroy Core",
    description: "Auth, admin, public API gateway envs",
    defaultEnvironment: "prod",
  },
  {
    slug: "sentroy-mail",
    name: "Sentroy Mail",
    description: "Mail dashboard, domain provisioning, mailbox envs",
    defaultEnvironment: "prod",
  },
  {
    slug: "sentroy-storage",
    name: "Sentroy Storage",
    description: "Storage dashboard envs (no migrated entries yet)",
    defaultEnvironment: "prod",
  },
] as const

export interface SystemEnvDefinition {
  key: string
  projectSlug: SystemProject["slug"]
  description: string
  /** Where it's read in code — admin can jump to source. */
  usedIn: string
  /**
   * Whether this env is checked from `process.env` of the **core** app
   * (this admin diagnostic runs in core). If true, diagnostic can verify
   * process.env presence; if false (mail-only env), diagnostic only shows
   * vault state.
   */
  visibleFromCore: boolean
}

export const SYSTEM_ENV_REGISTRY: readonly SystemEnvDefinition[] = [
  // sentroy-core
  {
    key: "BETTER_AUTH_TURNSTILE_SECRET",
    projectSlug: "sentroy-core",
    description: "Cloudflare Turnstile siteverify secret (auth captcha)",
    usedIn: "packages/auth/src/server/security-protections.ts",
    visibleFromCore: true,
  },
  {
    key: "IPINFO_TOKEN",
    projectSlug: "sentroy-core",
    description: "ipinfo.io Lite API token (login geo lookup)",
    usedIn: "packages/auth/src/lib/ipinfo.ts",
    visibleFromCore: true,
  },
  {
    key: "AI_GATEWAY_API_KEY",
    projectSlug: "sentroy-core",
    description: "Vercel AI Gateway key (template compose, AI assistant)",
    usedIn: "packages/ai-assistant/src/assistant.ts",
    visibleFromCore: true,
  },
  {
    key: "COOLIFY_API_URL",
    projectSlug: "sentroy-core",
    description: "Coolify API base URL (admin restart, system-status)",
    usedIn: "apps/core/app/api/admin/system-status/{route,restart}.ts",
    visibleFromCore: true,
  },
  {
    key: "COOLIFY_API_TOKEN",
    projectSlug: "sentroy-core",
    description: "Coolify API token (admin restart, system-status)",
    usedIn: "apps/core/app/api/admin/system-status/{route,restart}.ts",
    visibleFromCore: true,
  },
  {
    key: "SENTROY_ADMIN_API_KEY",
    projectSlug: "sentroy-core",
    description: "Mail server admin API key (system mail provision)",
    usedIn: "apps/core/lib/system-mail.ts",
    visibleFromCore: true,
  },

  // sentroy-mail
  {
    key: "ATTACHMENT_TOKEN_SECRET",
    projectSlug: "sentroy-mail",
    description: "HMAC secret for signed inbox attachment URLs",
    usedIn: "apps/mail/lib/attachment-token.ts",
    visibleFromCore: false,
  },
  {
    key: "DOMAIN_CONNECT_KEY_ID",
    projectSlug: "sentroy-mail",
    description: "Domain Connect signing key ID (TXT label, default _dcpubkeyv1)",
    usedIn: "apps/mail/lib/domain-connect/apply-url.ts",
    visibleFromCore: false,
  },
  {
    key: "DOMAIN_CONNECT_PRIVATE_KEY",
    projectSlug: "sentroy-mail",
    description: "Domain Connect signing PEM (RSA private key)",
    usedIn: "apps/mail/lib/domain-connect/apply-url.ts",
    visibleFromCore: false,
  },
  {
    key: "DOMAIN_CONNECT_PRIVATE_KEY_B64",
    projectSlug: "sentroy-mail",
    description: "Domain Connect signing key as base64 (alternative to PEM)",
    usedIn: "apps/mail/lib/domain-connect/apply-url.ts",
    visibleFromCore: false,
  },
  {
    // mail app'in ayrı kullanımı — core'unkiyle aynı key, farklı project'ten
    // okunur ki team'ler birbirinin scope'unu görmesin.
    key: "SENTROY_ADMIN_API_KEY",
    projectSlug: "sentroy-mail",
    description: "Mail server admin API key (lazy company provision, api-keys CRUD)",
    usedIn: "apps/mail/lib/provision.ts, apps/mail/app/api/companies/[slug]/api-keys/*.ts",
    visibleFromCore: false,
  },
] as const

/**
 * Idempotent — her sistem projesi için yoksa create eder. Mevcut admin
 * edit'lerine (rename, description, defaultEnvironment değişikliği)
 * dokunmaz. `companyId: null` ile sistem-scope'lu olarak yaratılır;
 * `assertAdmin` korumalı endpoint'lerden görünür.
 */
export async function seedSystemProjects(actorId: string): Promise<void> {
  for (const def of SYSTEM_PROJECTS) {
    const existing = await envProjectModel.findBySlug(def.slug, null)
    if (existing) continue
    await envProjectModel.create({
      slug: def.slug,
      name: def.name,
      description: def.description,
      defaultEnvironment: def.defaultEnvironment,
      companyId: null,
      createdBy: actorId,
    })
  }
}

import type { CompanyMember, Permission } from "@workspace/db/types"

export type RouteAccess =
  | Permission
  | Permission[]
  | null
  | "*"
  | "any-domain"
  | "any-inbox"
  | "any-storage"
  | "any-whatsapp"
  | "any-linear"

export const ROUTE_PERMISSIONS: Record<string, RouteAccess> = {
  "": "*",

  domains: "any-domain",

  // Mailboxes yonetimi veya gelen kutusu erisimi olan herkes mailboxes
  // sayfasina da gidebilir (kendi yetkili oldugu kutulari goruntulemek icin).
  mailboxes: ["mailboxes.manage", "inbox.view"],

  templates: "templates.manage",
  inbox: "any-inbox",
  audience: "audience.manage",
  send: "send.execute",
  logs: "logs.view",
  webhooks: "webhooks.manage",
  suppressions: "suppressions.manage",
  "api-keys": null,
  "access-tokens": null,
  smtp: "smtp.manage",
  team: null,

  settings: null,
  validate: "*",
  buckets: "any-storage",
  usage: "any-storage",

  // WhatsApp Santral — sohbet listesi + mesajlaşma. whatsapp.* yetkisi olan
  // herkes (veya owner/admin) girer.
  chats: "any-whatsapp",

  // Auth (auth.sentroy.com) dashboard. OAuth client'lar şirket-seviye hassas
  // → owner/admin; Auth Project'ler granular auth-projects.manage.
  "oauth-clients": null,
  "auth-projects": "auth-projects.manage",

  // App Store — company'nin yayınladığı uygulamaları gönder/yönet.
  apps: "app-store.manage",

  // Linear Lite — panel/istekler/görevler/metrikler linear.* yetkisi olan
  // herkese (veya owner/admin); bağlantı ayarları yalnız linear.manage.
  tasks: "any-linear",
  requests: "any-linear",
  // Linear metrics — yönetim sayfası (owner/admin veya linear.manage; eskiden any-linear).
  metrics: "linear.manage",
  "linear-settings": "linear.manage",
}

// ── Parsing helpers (server permissions.ts mirror) ─────────────────────────

function parseDomainScope(
  p: string,
): { id: string; action?: "view" | "create" | "edit" | "delete" } | null {
  if (!p.startsWith("domains.domain:")) return null
  const rest = p.slice("domains.domain:".length)
  const parts = rest.split(":")
  const id = parts[0]
  if (!id) return null
  const action = parts[1] as "view" | "create" | "edit" | "delete" | undefined
  if (action && !["view", "create", "edit", "delete"].includes(action)) {
    return null
  }
  return { id, action }
}

function memberDomainActionAllowed(
  perms: Permission[],
  domainId: string,
  action: "view" | "create" | "edit" | "delete",
): boolean {
  if (perms.includes("domains.manage")) return true
  if (perms.includes(`domains.${action}` as Permission)) return true
  if (action === "view" && perms.includes("domains.edit")) return true
  if (perms.includes(`domains.domain:${domainId}` as Permission)) return true
  if (perms.includes(`domains.domain:${domainId}:${action}` as Permission))
    return true
  if (
    action === "view" &&
    perms.includes(`domains.domain:${domainId}:edit` as Permission)
  ) {
    return true
  }
  return false
}

// ── Client-side hasPermission mirror ───────────────────────────────────────

export function hasClientPermission(
  membership: CompanyMember | null,
  permission: Permission,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!membership || membership.status !== "active") return false

  if (membership.role === "owner") return true
  if (membership.role === "admin") return true

  const perms: Permission[] = Array.isArray(membership.permissions)
    ? membership.permissions
    : []

  if (permission.startsWith("domains.domain:")) {
    const parsed = parseDomainScope(permission)
    if (!parsed) return false
    const { id, action } = parsed
    if (action) return memberDomainActionAllowed(perms, id, action)

    if (perms.includes("domains.manage")) return true
    if (perms.includes("domains.view")) return true
    if (perms.includes("domains.edit")) return true
    if (perms.includes(permission)) return true
    return perms.some((p) => p.startsWith(`domains.domain:${id}:`))
  }

  if (permission.startsWith("inbox.mailbox:")) {
    return perms.includes("inbox.view") || perms.includes(permission)
  }

  if (permission.startsWith("domains.") && perms.includes("domains.manage")) {
    return true
  }

  if (permission === "domains.view") {
    return (
      perms.includes("domains.view") ||
      perms.includes("domains.edit") ||
      perms.includes("domains.manage")
    )
  }

  if (permission === "storage.view") {
    return (
      perms.includes("storage.view") ||
      perms.some((p) => p.startsWith("buckets.")) ||
      perms.some((p) => p.startsWith("media."))
    )
  }

  return perms.includes(permission)
}

export function hasAnyDomainAccessClient(
  membership: CompanyMember | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!membership || membership.status !== "active") return false
  if (membership.role === "owner" || membership.role === "admin") return true
  const perms = Array.isArray(membership.permissions)
    ? membership.permissions
    : []
  return perms.some((p) => p.startsWith("domains."))
}

export function hasAnyInboxAccessClient(
  membership: CompanyMember | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!membership || membership.status !== "active") return false
  if (membership.role === "owner" || membership.role === "admin") return true
  const perms = Array.isArray(membership.permissions)
    ? membership.permissions
    : []
  return (
    perms.includes("inbox.view") ||
    perms.includes("mailboxes.manage") ||
    perms.some((p) => p.startsWith("inbox.mailbox:"))
  )
}

export function hasAnyStorageAccessClient(
  membership: CompanyMember | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!membership || membership.status !== "active") return false
  if (membership.role === "owner" || membership.role === "admin") return true
  const perms = Array.isArray(membership.permissions)
    ? membership.permissions
    : []
  return (
    perms.includes("storage.view") ||
    perms.some((p) => p.startsWith("buckets.")) ||
    perms.some((p) => p.startsWith("media."))
  )
}

export function hasAnyWhatsappAccessClient(
  membership: CompanyMember | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!membership || membership.status !== "active") return false
  if (membership.role === "owner" || membership.role === "admin") return true
  const perms = Array.isArray(membership.permissions)
    ? membership.permissions
    : []
  return perms.some((p) => p.startsWith("whatsapp."))
}

export function hasAnyLinearAccessClient(
  membership: CompanyMember | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!membership || membership.status !== "active") return false
  if (membership.role === "owner" || membership.role === "admin") return true
  const perms = Array.isArray(membership.permissions)
    ? membership.permissions
    : []
  return perms.some((p) => p.startsWith("linear."))
}

/**
 * Mail uygulamasına gitmek için "herhangi bir" mail-domain permission'ı.
 * Core dashboard'unun sidebar'ındaki Mail kısayolu için kullanılır —
 * inbox erişimi yokken bile templates/send/audience/etc. permission'ı
 * olan kullanıcı mail app'ine inebilir.
 */
export function hasAnyMailAccessClient(
  membership: CompanyMember | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!membership || membership.status !== "active") return false
  if (membership.role === "owner" || membership.role === "admin") return true
  const perms = Array.isArray(membership.permissions)
    ? membership.permissions
    : []
  // Inbox/mailbox/templates/send/audience/logs/webhooks/suppressions/smtp +
  // domain-spesifik scope'lar.
  const mailRoots = [
    "inbox.",
    "mailboxes.",
    "templates.",
    "audience.",
    "send.",
    "logs.",
    "webhooks.",
    "suppressions.",
    "smtp.",
    "domains.",
  ]
  return perms.some((p) => mailRoots.some((root) => p.startsWith(root)))
}

export function canAccessRoute(
  membership: CompanyMember | null,
  segment: string,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!membership || membership.status !== "active") return false

  const access = ROUTE_PERMISSIONS[segment]

  if (access === undefined) return true
  if (access === "*") return true

  if (access === null) {
    return membership.role === "owner" || membership.role === "admin"
  }

  if (access === "any-domain") {
    return hasAnyDomainAccessClient(membership, systemRole)
  }

  if (access === "any-inbox") {
    return hasAnyInboxAccessClient(membership, systemRole)
  }

  if (access === "any-storage") {
    return hasAnyStorageAccessClient(membership, systemRole)
  }

  if (access === "any-whatsapp") {
    return hasAnyWhatsappAccessClient(membership, systemRole)
  }

  if (access === "any-linear") {
    return hasAnyLinearAccessClient(membership, systemRole)
  }

  if (Array.isArray(access)) {
    return access.some((p) => hasClientPermission(membership, p, systemRole))
  }

  return hasClientPermission(membership, access, systemRole)
}

export function extractRouteSegment(
  pathname: string,
  lang: string,
  slug: string,
): string | null {
  const prefix = `/${lang}/d/${slug}`
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length).replace(/^\/+/, "")
  if (!rest) return ""
  return rest.split("/")[0]
}

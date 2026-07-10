import type { Permission, CompanyMember } from "@workspace/db/types"
import { getDb } from "@workspace/db/client"

export const PERMISSIONS = {
  DOMAINS_VIEW: "domains.view",
  DOMAINS_CREATE: "domains.create",
  DOMAINS_EDIT: "domains.edit",
  DOMAINS_DELETE: "domains.delete",
  DOMAINS_MANAGE: "domains.manage",
  MAILBOXES_MANAGE: "mailboxes.manage",
  TEMPLATES_MANAGE: "templates.manage",
  INBOX_VIEW: "inbox.view",
  AUDIENCE_MANAGE: "audience.manage",
  SEND_EXECUTE: "send.execute",
  LOGS_VIEW: "logs.view",
  WEBHOOKS_MANAGE: "webhooks.manage",
  SUPPRESSIONS_MANAGE: "suppressions.manage",
  API_KEYS_MANAGE: "api-keys.manage",
  SMTP_MANAGE: "smtp.manage",
  MEMBERS_MANAGE: "members.manage",
  STORAGE_VIEW: "storage.view",
  BUCKETS_CREATE: "buckets.create",
  BUCKETS_EDIT: "buckets.edit",
  BUCKETS_DELETE: "buckets.delete",
  MEDIA_UPLOAD: "media.upload",
  MEDIA_DELETE: "media.delete",
  MEDIA_REORDER: "media.reorder",
  AUTH_PROJECTS_MANAGE: "auth-projects.manage",
  STATUS_PAGE_MANAGE: "status-page.manage",
  STUDIO_MANAGE: "studio.manage",
  WHATSAPP_VIEW: "whatsapp.view",
  WHATSAPP_SEND: "whatsapp.send",
  WHATSAPP_MANAGE: "whatsapp.manage",
  LINEAR_VIEW: "linear.view",
  LINEAR_EDIT: "linear.edit",
  LINEAR_MANAGE: "linear.manage",
  APP_STORE_MANAGE: "app-store.manage",
  MONGO_MANAGE: "mongo.manage",
} as const satisfies Record<string, Permission>

interface SessionLike {
  user: { id: string; role?: string }
}

// ── Permission parsing helpers ──────────────────────────────────────────────

/**
 * `domains.domain:<id>` veya `domains.domain:<id>:<action>` desenlerini parse eder.
 * Legacy format (action yok) = o domain icin tam erisim.
 */
export function parseDomainScope(
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

/** Member'in bir domain uzerinde belirtilen action'a yetkili olup olmadigi. */
function memberDomainActionAllowed(
  perms: Permission[],
  domainId: string,
  action: "view" | "create" | "edit" | "delete",
): boolean {
  if (perms.includes("domains.manage")) return true
  if (perms.includes(`domains.${action}` as Permission)) return true

  // `domains.edit` view'i de kapsar
  if (action === "view" && perms.includes("domains.edit")) return true

  // Legacy `domains.domain:<id>` (actionsiz) — tam erisim
  if (perms.includes(`domains.domain:${domainId}` as Permission)) return true

  // Granuler kapsam
  if (perms.includes(`domains.domain:${domainId}:${action}` as Permission))
    return true

  // Scoped edit, scoped view'i kapsar
  if (
    action === "view" &&
    perms.includes(`domains.domain:${domainId}:edit` as Permission)
  ) {
    return true
  }

  return false
}

function memberHasPermission(
  member: Pick<CompanyMember, "role" | "status" | "permissions">,
  permission: Permission,
): boolean {
  if (member.status !== "active") return false
  if (member.role === "owner") return true
  if (member.role === "admin") return true

  const perms: Permission[] = Array.isArray(member.permissions)
    ? member.permissions
    : []

  // ── Per-domain action kontrol ─────────────────────────────────────────
  if (permission.startsWith("domains.domain:")) {
    const parsed = parseDomainScope(permission)
    if (!parsed) return false
    const { id, action } = parsed

    if (action) {
      return memberDomainActionAllowed(perms, id, action)
    }

    // Actionsuz sorgu = "bu domain'e herhangi bir erisim var mi"
    if (perms.includes("domains.manage")) return true
    if (perms.includes("domains.view")) return true
    if (perms.includes("domains.edit")) return true
    if (perms.includes(permission)) return true
    return perms.some((p) => p.startsWith(`domains.domain:${id}:`))
  }

  // ── Inbox mailbox kapsam pattern'i ────────────────────────────────────
  if (permission.startsWith("inbox.mailbox:")) {
    return perms.includes("inbox.view") || perms.includes(permission)
  }

  // ── Global domains.* ─────────────────────────────────────────────────
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

  // Storage write scopes imply read access in the storage console.
  if (permission === "storage.view") {
    return (
      perms.includes("storage.view") ||
      perms.some((p) => p.startsWith("buckets.")) ||
      perms.some((p) => p.startsWith("media."))
    )
  }

  // WhatsApp: send/manage yetkisi okuma (view) yetkisini kapsar.
  if (permission === "whatsapp.view") {
    return (
      perms.includes("whatsapp.view") ||
      perms.includes("whatsapp.send") ||
      perms.includes("whatsapp.manage")
    )
  }
  // manage, send'i kapsar (numara yöneticisi mesaj da gönderebilir).
  if (permission === "whatsapp.send") {
    return perms.includes("whatsapp.send") || perms.includes("whatsapp.manage")
  }

  // Linear Lite: edit/manage yetkisi okuma (view) yetkisini kapsar.
  if (permission === "linear.view") {
    return (
      perms.includes("linear.view") ||
      perms.includes("linear.edit") ||
      perms.includes("linear.manage")
    )
  }
  // manage, edit'i kapsar (bağlantı yöneticisi issue da düzenleyebilir).
  if (permission === "linear.edit") {
    return perms.includes("linear.edit") || perms.includes("linear.manage")
  }

  return perms.includes(permission)
}

export async function hasPermission(
  session: SessionLike,
  companySlug: string,
  permission: Permission,
): Promise<boolean> {
  if (session.user.role === "admin") return true

  const db = await getDb()
  const company = await db
    .collection("companies")
    .findOne({ slug: companySlug })
  if (!company) return false

  const member = await db.collection<CompanyMember>("company_members").findOne({
    companyId: company._id.toString(),
    userId: session.user.id,
    status: "active",
  })
  if (!member) return false

  return memberHasPermission(member, permission)
}

export async function assertPermission(
  session: SessionLike,
  companySlug: string,
  permission: Permission,
): Promise<void> {
  const allowed = await hasPermission(session, companySlug, permission)
  if (!allowed) {
    throw new Error("Insufficient permissions")
  }
}

// ── Domain listesi filtresi ────────────────────────────────────────────────

export function filterAccessibleDomains<
  T extends { id?: string; domain?: string; name?: string },
>(
  domains: T[],
  member: Pick<CompanyMember, "role" | "status" | "permissions"> | null,
  systemRole?: string,
): T[] {
  if (systemRole === "admin") return domains
  if (!member || member.status !== "active") return []
  if (member.role === "owner" || member.role === "admin") return domains

  const perms: Permission[] = Array.isArray(member.permissions)
    ? member.permissions
    : []

  if (
    perms.includes("domains.manage") ||
    perms.includes("domains.view") ||
    perms.includes("domains.edit")
  ) {
    return domains
  }

  const scopedIds = new Set<string>()
  for (const p of perms) {
    if (!p.startsWith("domains.domain:")) continue
    const parsed = parseDomainScope(p)
    if (parsed) scopedIds.add(parsed.id)
  }

  if (scopedIds.size === 0) return []
  return domains.filter((d) => d.id && scopedIds.has(d.id))
}

export function hasAnyDomainAccess(
  member: Pick<CompanyMember, "role" | "status" | "permissions"> | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!member || member.status !== "active") return false
  if (member.role === "owner" || member.role === "admin") return true
  const perms = Array.isArray(member.permissions) ? member.permissions : []
  return perms.some((p) => p.startsWith("domains."))
}

// ── Mailbox listesi filtresi ───────────────────────────────────────────────

export function filterAccessibleMailboxes<T extends { email?: string }>(
  mailboxes: T[],
  member: Pick<CompanyMember, "role" | "status" | "permissions"> | null,
  systemRole?: string,
): T[] {
  if (systemRole === "admin") return mailboxes
  if (!member || member.status !== "active") return []
  if (member.role === "owner" || member.role === "admin") return mailboxes

  const perms: Permission[] = Array.isArray(member.permissions)
    ? member.permissions
    : []

  // mailboxes.manage (yonetim yetkisi) veya inbox.view (tum kutulari oku) → hepsi
  if (perms.includes("mailboxes.manage") || perms.includes("inbox.view")) {
    return mailboxes
  }

  // Kapsamli mailbox'lar — sadece o e-postalar
  const scopedEmails = new Set(
    perms
      .filter((p): p is `inbox.mailbox:${string}` =>
        p.startsWith("inbox.mailbox:"),
      )
      .map((p) => p.slice("inbox.mailbox:".length).toLowerCase()),
  )

  if (scopedEmails.size === 0) return []
  return mailboxes.filter(
    (m) => m.email && scopedEmails.has(m.email.toLowerCase()),
  )
}

export function hasAnyInboxAccess(
  member: Pick<CompanyMember, "role" | "status" | "permissions"> | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!member || member.status !== "active") return false
  if (member.role === "owner" || member.role === "admin") return true
  const perms = Array.isArray(member.permissions) ? member.permissions : []
  return (
    perms.includes("inbox.view") ||
    perms.includes("mailboxes.manage") ||
    perms.some((p) => p.startsWith("inbox.mailbox:"))
  )
}

export function hasAnyStorageAccess(
  member: Pick<CompanyMember, "role" | "status" | "permissions"> | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!member || member.status !== "active") return false
  if (member.role === "owner" || member.role === "admin") return true
  const perms = Array.isArray(member.permissions) ? member.permissions : []
  return (
    perms.includes("storage.view") ||
    perms.some((p) => p.startsWith("buckets.")) ||
    perms.some((p) => p.startsWith("media."))
  )
}

// ── WhatsApp erişim kontrolü ──────────────────────────────────────────────

export function hasAnyWhatsappAccess(
  member: Pick<CompanyMember, "role" | "status" | "permissions"> | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!member || member.status !== "active") return false
  if (member.role === "owner" || member.role === "admin") return true
  const perms = Array.isArray(member.permissions) ? member.permissions : []
  return perms.some((p) => p.startsWith("whatsapp."))
}

// ── Linear Lite erişim kontrolü ───────────────────────────────────────────

export function hasAnyLinearAccess(
  member: Pick<CompanyMember, "role" | "status" | "permissions"> | null,
  systemRole?: string,
): boolean {
  if (systemRole === "admin") return true
  if (!member || member.status !== "active") return false
  if (member.role === "owner" || member.role === "admin") return true
  const perms = Array.isArray(member.permissions) ? member.permissions : []
  return perms.some((p) => p.startsWith("linear."))
}

export { memberHasPermission }

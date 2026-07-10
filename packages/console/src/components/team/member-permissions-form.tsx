"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  UserMultipleIcon,
  InternetIcon,
  InboxIcon,
  FolderLibraryIcon,
  ArrowDown01Icon,
  Alert02Icon,
  Message01Icon,
  KanbanIcon,
} from "@hugeicons/core-free-icons"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"
import type { Permission } from "@workspace/db/types"

// ── Data shapes ─────────────────────────────────────────────────────────────

interface DomainItem {
  id: string
  domain?: string
  name?: string
}

interface MailboxItem {
  email: string
}

// ── Permission catalog ──────────────────────────────────────────────────────

interface PermItem {
  key: Permission
  labelKey: string
}

const GENERAL_PERMISSIONS: PermItem[] = [
  { key: "mailboxes.manage", labelKey: "permMailboxes" },
  { key: "templates.manage", labelKey: "permTemplates" },
  { key: "audience.manage", labelKey: "permAudience" },
  { key: "send.execute", labelKey: "permSend" },
  { key: "logs.view", labelKey: "permLogs" },
  { key: "webhooks.manage", labelKey: "permWebhooks" },
  { key: "suppressions.manage", labelKey: "permSuppressions" },
  { key: "api-keys.manage", labelKey: "permApiKeys" },
  { key: "smtp.manage", labelKey: "permSmtp" },
  { key: "members.manage", labelKey: "permMembers" },
]

const STORAGE_PERMISSIONS: PermItem[] = [
  { key: "storage.view", labelKey: "permStorageView" },
  { key: "buckets.create", labelKey: "permBucketsCreate" },
  { key: "buckets.edit", labelKey: "permBucketsEdit" },
  { key: "buckets.delete", labelKey: "permBucketsDelete" },
  { key: "media.upload", labelKey: "permMediaUpload" },
  { key: "media.delete", labelKey: "permMediaDelete" },
  { key: "media.reorder", labelKey: "permMediaReorder" },
]

const WHATSAPP_PERMISSIONS: PermItem[] = [
  { key: "whatsapp.view", labelKey: "permWhatsappView" },
  { key: "whatsapp.send", labelKey: "permWhatsappSend" },
  { key: "whatsapp.manage", labelKey: "permWhatsappManage" },
]

const LINEAR_PERMISSIONS: PermItem[] = [
  { key: "linear.view", labelKey: "permLinearView" },
  { key: "linear.edit", labelKey: "permLinearEdit" },
  { key: "linear.manage", labelKey: "permLinearManage" },
]

type DomainAction = "view" | "create" | "edit" | "delete"
const DOMAIN_ACTIONS: { key: DomainAction; labelKey: string }[] = [
  { key: "view", labelKey: "permDomainsView" },
  { key: "create", labelKey: "permDomainsCreate" },
  { key: "edit", labelKey: "permDomainsEdit" },
  { key: "delete", labelKey: "permDomainsDelete" },
]

// Admin rolu icin — tum top-level yetkiler (scoped olmayanlar)
export const ALL_TOP_LEVEL_PERMISSIONS: Permission[] = [
  ...GENERAL_PERMISSIONS.map((p) => p.key),
  ...STORAGE_PERMISSIONS.map((p) => p.key),
  ...WHATSAPP_PERMISSIONS.map((p) => p.key),
  ...LINEAR_PERMISSIONS.map((p) => p.key),
  "inbox.view",
  "domains.view",
  "domains.create",
  "domains.edit",
  "domains.delete",
]

// ── Props ───────────────────────────────────────────────────────────────────

interface MemberPermissionsFormProps {
  companySlug: string
  permissions: Permission[]
  onChange: (permissions: Permission[]) => void
  disabled?: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function permKey(
  scope: "general" | string,
  action: DomainAction,
): Permission {
  if (scope === "general") {
    return `domains.${action}` as Permission
  }
  return `domains.domain:${scope}:${action}` as Permission
}

// ── Component ───────────────────────────────────────────────────────────────

export function MemberPermissionsForm({
  companySlug,
  permissions,
  onChange,
  disabled = false,
}: MemberPermissionsFormProps) {
  const t = useTranslations("team")

  // ── Data fetching ──────────────────────────────────────────────────────
  const [domains, setDomains] = useState<DomainItem[]>([])
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [mailboxes, setMailboxes] = useState<MailboxItem[]>([])
  const [mailboxesLoading, setMailboxesLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/companies/${companySlug}/domains`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .catch(() => ({ data: [] })),
      fetch(`/api/companies/${companySlug}/mailboxes`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .catch(() => ({ data: [] })),
    ]).then(([dd, mm]) => {
      if (cancelled) return
      setDomains((dd.data as DomainItem[]) ?? [])
      setDomainsLoading(false)
      setMailboxes((mm.data as MailboxItem[]) ?? [])
      setMailboxesLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [companySlug])

  // ── Permission helpers ─────────────────────────────────────────────────
  const isOn = useCallback(
    (perm: Permission) => permissions.includes(perm),
    [permissions],
  )

  function togglePermission(perm: Permission) {
    if (disabled) return
    onChange(
      permissions.includes(perm)
        ? permissions.filter((p) => p !== perm)
        : [...permissions, perm],
    )
  }

  // ── Inbox scope helpers ────────────────────────────────────────────────
  function toggleMailboxScope(email: string) {
    if (disabled) return
    const key = `inbox.mailbox:${email.toLowerCase()}` as Permission
    onChange(
      permissions.includes(key)
        ? permissions.filter((p) => p !== key)
        : [...permissions, key],
    )
  }

  const isMailboxScoped = useCallback(
    (email: string) =>
      permissions.includes(
        `inbox.mailbox:${email.toLowerCase()}` as Permission,
      ),
    [permissions],
  )

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Tabs defaultValue="general" className="flex flex-col gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="general" className="flex-1">
          <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} />
          {t("tabGeneral")}
        </TabsTrigger>
        <TabsTrigger value="domains" className="flex-1">
          <HugeiconsIcon icon={InternetIcon} strokeWidth={2} />
          {t("tabDomains")}
        </TabsTrigger>
        <TabsTrigger value="storage" className="flex-1">
          <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} />
          {t("tabStorage")}
        </TabsTrigger>
        <TabsTrigger value="whatsapp" className="flex-1">
          <HugeiconsIcon icon={Message01Icon} strokeWidth={2} />
          {t("tabWhatsapp")}
        </TabsTrigger>
        <TabsTrigger value="linear" className="flex-1">
          <HugeiconsIcon icon={KanbanIcon} strokeWidth={2} />
          {t("tabLinear")}
        </TabsTrigger>
        <TabsTrigger value="inbox" className="flex-1">
          <HugeiconsIcon icon={InboxIcon} strokeWidth={2} />
          {t("tabInbox")}
        </TabsTrigger>
      </TabsList>

      {/* ── GENERAL ───────────────────────────────────────────────────── */}
      <TabsContent value="general">
        <div className="grid grid-cols-2 gap-2">
          {GENERAL_PERMISSIONS.map((perm) => (
            <label
              key={perm.key}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={isOn(perm.key)}
                onCheckedChange={() => togglePermission(perm.key)}
                disabled={disabled}
              />
              {t(perm.labelKey)}
            </label>
          ))}
        </div>
      </TabsContent>

      {/* ── STORAGE ───────────────────────────────────────────────────── */}
      <TabsContent value="storage">
        <div className="grid grid-cols-2 gap-2">
          {STORAGE_PERMISSIONS.map((perm) => (
            <label
              key={perm.key}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={isOn(perm.key)}
                onCheckedChange={() => togglePermission(perm.key)}
                disabled={disabled}
              />
              {t(perm.labelKey)}
            </label>
          ))}
        </div>
      </TabsContent>

      {/* ── WHATSAPP ──────────────────────────────────────────────────── */}
      <TabsContent value="whatsapp">
        <div className="grid grid-cols-2 gap-2">
          {WHATSAPP_PERMISSIONS.map((perm) => (
            <label
              key={perm.key}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={isOn(perm.key)}
                onCheckedChange={() => togglePermission(perm.key)}
                disabled={disabled}
              />
              {t(perm.labelKey)}
            </label>
          ))}
        </div>
      </TabsContent>

      {/* ── LINEAR ────────────────────────────────────────────────────── */}
      <TabsContent value="linear">
        <div className="grid grid-cols-2 gap-2">
          {LINEAR_PERMISSIONS.map((perm) => (
            <label
              key={perm.key}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={isOn(perm.key)}
                onCheckedChange={() => togglePermission(perm.key)}
                disabled={disabled}
              />
              {t(perm.labelKey)}
            </label>
          ))}
        </div>
      </TabsContent>

      {/* ── DOMAINS ───────────────────────────────────────────────────── */}
      <TabsContent value="domains" className="flex flex-col gap-2">
        <DomainScopeSection
          scope="general"
          title={t("domainGlobalPerms")}
          permissions={permissions}
          onChange={onChange}
          disabled={disabled}
        />

        {domainsLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!domainsLoading && domains.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            {t("noDomains")}
          </div>
        )}

        {!domainsLoading &&
          domains.map((d) => (
            <DomainScopeSection
              key={d.id}
              scope={d.id}
              title={d.domain || d.name || d.id}
              permissions={permissions}
              onChange={onChange}
              disabled={disabled}
            />
          ))}
      </TabsContent>

      {/* ── INBOX ─────────────────────────────────────────────────────── */}
      <TabsContent value="inbox" className="flex flex-col gap-2">
        <MailboxToggleRow
          title={t("inboxAllMailboxes")}
          subtitle={t("inboxAllMailboxesHint")}
          active={isOn("inbox.view")}
          onToggle={() => togglePermission("inbox.view")}
          disabled={disabled}
        />

        {mailboxesLoading && <Skeleton className="h-12 w-full" />}

        {!mailboxesLoading && mailboxes.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            {t("noMailboxes")}
          </div>
        )}

        {!mailboxesLoading &&
          mailboxes.map((m) => (
            <MailboxToggleRow
              key={m.email}
              title={m.email}
              active={isMailboxScoped(m.email) || isOn("inbox.view")}
              onToggle={() => toggleMailboxScope(m.email)}
              disabled={disabled || isOn("inbox.view")}
              mutedWhenAll={isOn("inbox.view")}
            />
          ))}

        {isOn("inbox.view") && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={Alert02Icon}
              strokeWidth={2}
              className="size-3"
            />
            {t("inboxAllAccessNote")}
          </p>
        )}
      </TabsContent>
    </Tabs>
  )
}

// ── Sub: Domain scope section (collapsible with 4 actions) ─────────────────

interface DomainScopeSectionProps {
  scope: "general" | string
  title: string
  permissions: Permission[]
  onChange: (permissions: Permission[]) => void
  disabled?: boolean
}

function DomainScopeSection({
  scope,
  title,
  permissions,
  onChange,
  disabled,
}: DomainScopeSectionProps) {
  const t = useTranslations("team")

  const activeActions = useMemo(
    () =>
      new Set(
        DOMAIN_ACTIONS.filter((a) =>
          permissions.includes(permKey(scope, a.key)),
        ).map((a) => a.key),
      ),
    [permissions, scope],
  )

  const isActive = activeActions.size > 0
  const [open, setOpen] = useState(isActive)

  // activeActions degisince open state'i senkronize et (edit mode'da init icin)
  useEffect(() => {
    if (isActive) setOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleAction(action: DomainAction) {
    if (disabled) return
    const key = permKey(scope, action)
    onChange(
      permissions.includes(key)
        ? permissions.filter((p) => p !== key)
        : [...permissions, key],
    )
  }

  function toggleSection(next: boolean) {
    if (disabled) return
    if (next) {
      // Aktive et — varsayilan olarak :view yetkisi ver
      const viewKey = permKey(scope, "view")
      if (!permissions.includes(viewKey)) {
        onChange([...permissions, viewKey])
      }
      setOpen(true)
    } else {
      // Deaktive et — scope'un tum action'larini temizle
      const toRemove = new Set<Permission>(
        DOMAIN_ACTIONS.map((a) => permKey(scope, a.key)),
      )
      onChange(permissions.filter((p) => !toRemove.has(p as Permission)))
      setOpen(false)
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "rounded-xl border transition-colors",
        isActive
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-transparent",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <Switch
          checked={isActive}
          onCheckedChange={toggleSection}
          disabled={disabled}
        />
        <CollapsibleTrigger
          disabled={disabled}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "truncate text-sm font-medium",
              scope === "general" ? "" : "font-mono text-xs",
            )}
          >
            {title}
          </span>
          {isActive && (
            <span className="text-xs text-muted-foreground">
              {activeActions.size}/{DOMAIN_ACTIONS.length}
            </span>
          )}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className={cn(
              "ms-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="grid grid-cols-2 gap-2 border-t px-3 py-3">
          {DOMAIN_ACTIONS.map((action) => (
            <label
              key={action.key}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={activeActions.has(action.key)}
                onCheckedChange={() => toggleAction(action.key)}
                disabled={disabled}
              />
              {t(action.labelKey)}
            </label>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── Sub: Mailbox toggle row ────────────────────────────────────────────────

interface MailboxToggleRowProps {
  title: string
  subtitle?: string
  active: boolean
  onToggle: () => void
  disabled?: boolean
  mutedWhenAll?: boolean
}

function MailboxToggleRow({
  title,
  subtitle,
  active,
  onToggle,
  disabled,
  mutedWhenAll,
}: MailboxToggleRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
        active && !mutedWhenAll
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-transparent",
        mutedWhenAll && "opacity-60",
      )}
    >
      <Switch
        checked={active}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <div className="flex flex-1 min-w-0 flex-col">
        <span
          className={cn(
            "truncate text-sm",
            subtitle ? "font-medium" : "font-mono text-xs",
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </div>
  )
}

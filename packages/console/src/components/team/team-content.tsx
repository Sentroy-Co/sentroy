"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  UserMultipleIcon,
  PlusSignIcon,
  Mail01Icon,
  Delete02Icon,
  Loading03Icon,
  MailSend01Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { InviteMemberDialog } from "@workspace/console/components/team/invite-member-dialog"
import { EditMemberDialog } from "@workspace/console/components/team/edit-member-dialog"
import { TransferOwnershipDialog } from "@workspace/console/components/team/transfer-ownership-dialog"
import type { Permission, CompanyMemberRole } from "@workspace/db/types"

interface PendingInvitation {
  id: string
  email: string
  role: CompanyMemberRole
  permissions: Permission[]
  createdAt: string
  expiresAt: string
}

interface TeamMember {
  id: string
  companyId: string
  userId: string
  role: CompanyMemberRole
  status: "active" | "suspended"
  permissions: Permission[]
  joinedAt: string
  updatedAt: string
  user: {
    name: string
    email: string
    image?: string | null
  }
  /** En son session'ın konumu + zamanı (server hydrate; ipInfo'dan). */
  lastActive?: { location: string | null; at: string | null }
  /** Bu satır çağıran kullanıcının kendisi mi (viewer rolünü türetmek için). */
  isSelf?: boolean
}

/** Ad → baş harfler (avatar fallback). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

/** Göreli zaman (Intl.RelativeTimeFormat, locale-aware). */
function formatRelative(iso: string, locale: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diff = then - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const min = 60_000, hr = 3_600_000, day = 86_400_000
  if (abs < hr) return rtf.format(Math.round(diff / min), "minute")
  if (abs < day) return rtf.format(Math.round(diff / hr), "hour")
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day")
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
}

const ROLE_LABEL_KEYS: Record<CompanyMemberRole, string> = {
  owner: "owner",
  admin: "admin",
  member: "member",
}

const ROLE_VARIANTS: Record<CompanyMemberRole, string> = {
  owner:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  admin:
    "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  member:
    "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  active: "active",
  suspended: "suspended",
}

export function TeamContent() {
  const t = useTranslations("team")
  const locale = useLocale()
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [members, setMembers] = useState<TeamMember[]>([])
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [saving, setSaving] = useState(false)
  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null)
  const [showTransfer, setShowTransfer] = useState(false)

  // Çağıran kullanıcının bu şirketteki rolü (isSelf'ten) — owner ise devir açık.
  const viewerRole = members.find((m) => m.isSelf)?.role

  const apiBase = `/api/companies/${slug}/team`
  const invitesBase = `/api/companies/${slug}/invitations`

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch(apiBase),
        fetch(invitesBase),
      ])
      const membersJson = await membersRes.json()
      const invitesJson = await invitesRes.json()
      if (!membersRes.ok) {
        throw new Error(membersJson.error || "Failed to load team")
      }
      setMembers((membersJson.data as TeamMember[]) ?? [])
      // Invitations endpoint members.manage gerektirir; insufficient
      // perms response'unu sessiz geç (UI yine üyeleri gösterir).
      if (invitesRes.ok) {
        setInvitations((invitesJson.data as PendingInvitation[]) ?? [])
      } else {
        setInvitations([])
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load team"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase, invitesBase])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleInvite(data: {
    email: string
    role: CompanyMemberRole
    permissions: Permission[]
  }) {
    setInviting(true)
    try {
      const res = await fetch(invitesBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to send invitation")
      }
      const created = json.data as PendingInvitation & {
        emailSent?: boolean
        emailReason?: string
      }
      setInvitations((prev) => [created, ...prev])
      setShowInviteDialog(false)
      // Backend zenginleştirilmiş response veriyor: emailSent yoksa veya
      // false ise admin'i uyar — davet oluştu ama mail gitmedi (sistem
      // mail domain'i veya provision eksik).
      if (created.emailSent === false) {
        toast.warning(
          t("invitationCreatedNoEmail", {
            email: data.email,
            reason: created.emailReason ?? "unknown",
          }),
        )
      } else {
        toast.success(t("invitationSent", { email: data.email }))
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send invitation"
      toast.error(message)
    } finally {
      setInviting(false)
    }
  }

  async function handleRevokeInvite(invite: PendingInvitation) {
    setRevokingId(invite.id)
    try {
      const res = await fetch(`${invitesBase}/${invite.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to revoke")
      setInvitations((prev) => prev.filter((i) => i.id !== invite.id))
      toast.success(t("invitationRevoked"))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke")
    } finally {
      setRevokingId(null)
    }
  }

  /**
   * Davet email'ini tekrar gönder. Initial create'te sender register
   * değildiyse (no-sender) kullanıcı admin → system mail'i konfigüre eder,
   * sonra bu butonla mail tekrar deneyebilir.
   */
  async function handleResendInvite(invite: PendingInvitation) {
    setResendingId(invite.id)
    try {
      const res = await fetch(`${invitesBase}/${invite.id}/resend`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to resend")
      toast.success(t("invitationResent", { email: invite.email }))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to resend")
    } finally {
      setResendingId(null)
    }
  }

  function handleClickMember(member: TeamMember) {
    setEditingMember(member)
    setShowEditDialog(true)
  }

  async function handleSaveMember(data: {
    role: CompanyMemberRole
    permissions: Permission[]
    status: "active" | "suspended"
  }) {
    if (!editingMember) return
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to update member")
      }
      setMembers((prev) =>
        prev.map((m) =>
          m.id === editingMember.id ? (json.data as TeamMember) : m,
        ),
      )
      setShowEditDialog(false)
      setEditingMember(null)
      toast.success(t("memberUpdated"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update member"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveMember() {
    if (!editingMember) return
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/${editingMember.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to remove member")
      }
      setMembers((prev) => prev.filter((m) => m.id !== editingMember.id))
      setShowEditDialog(false)
      setEditingMember(null)
      toast.success(t("memberRemoved"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to remove member"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="rounded-xl border">
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button onClick={() => setShowInviteDialog(true)}>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("addMember")}
        </Button>
      </div>

      {members.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={() => setShowInviteDialog(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("addMember")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {members.map((member, idx) => (
            <button
              key={member.id}
              type="button"
              onClick={() => handleClickMember(member)}
              className={
                "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/5" +
                (idx > 0 ? " border-t border-border/60" : "")
              }
            >
              <Avatar className="size-10 shrink-0">
                <AvatarImage src={member.user.image ?? undefined} alt="" />
                <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                  {initialsOf(member.user.name)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-medium">{member.user.name}</span>
                  <Badge variant="outline" className={ROLE_VARIANTS[member.role]}>
                    {t(ROLE_LABEL_KEYS[member.role])}
                  </Badge>
                  {member.status !== "active" ? (
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                      {t(STATUS_LABEL_KEYS[member.status] ?? "active")}
                    </Badge>
                  ) : null}
                </div>
                <span className="truncate text-xs text-muted-foreground">{member.user.email}</span>
              </div>

              {/* Son aktif konum + zaman */}
              <div className="hidden shrink-0 flex-col items-end gap-0.5 text-right sm:flex">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-3.5 shrink-0" />
                  <span className="max-w-[180px] truncate">
                    {member.lastActive?.location ?? t("locationUnknown")}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                  {member.lastActive?.at ? formatRelative(member.lastActive.at, locale) : t("neverActive")}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {invitations.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Mail01Icon}
              strokeWidth={2}
              className="size-4 text-muted-foreground"
            />
            <span className="text-sm font-semibold">
              {t("pendingInvitations")}
            </span>
            <span className="text-xs text-muted-foreground">
              {invitations.length}
            </span>
          </div>
          <div className="rounded-xl border">
            {invitations.map((invite, idx) => (
              <div
                key={invite.id}
                className={
                  "flex items-center gap-3 px-4 py-3" +
                  (idx > 0 ? " border-t" : "")
                }
              >
                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <span className="truncate font-mono text-sm">
                    {invite.email}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {t("invitationExpires", {
                      date: new Date(invite.expiresAt).toLocaleDateString(),
                    })}
                  </span>
                </div>
                <Badge variant="outline" className={ROLE_VARIANTS[invite.role]}>
                  {t(ROLE_LABEL_KEYS[invite.role])}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleResendInvite(invite)}
                  disabled={
                    resendingId === invite.id || revokingId === invite.id
                  }
                  title={t("resendInvitation")}
                >
                  <HugeiconsIcon
                    icon={
                      resendingId === invite.id
                        ? Loading03Icon
                        : MailSend01Icon
                    }
                    strokeWidth={2}
                    className={
                      "size-4" +
                      (resendingId === invite.id ? " animate-spin" : "")
                    }
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRevokeInvite(invite)}
                  disabled={
                    revokingId === invite.id || resendingId === invite.id
                  }
                  title={t("revokeInvitation")}
                >
                  <HugeiconsIcon
                    icon={
                      revokingId === invite.id ? Loading03Icon : Delete02Icon
                    }
                    strokeWidth={2}
                    className={
                      "size-4" +
                      (revokingId === invite.id ? " animate-spin" : "")
                    }
                  />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <InviteMemberDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onInvite={handleInvite}
        saving={inviting}
      />

      <EditMemberDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        member={
          editingMember
            ? {
                id: editingMember.id,
                role: editingMember.role,
                status: editingMember.status,
                permissions: editingMember.permissions,
                user: {
                  name: editingMember.user.name,
                  email: editingMember.user.email,
                },
              }
            : null
        }
        onSave={handleSaveMember}
        onRemove={handleRemoveMember}
        saving={saving}
        canTransferOwnership={
          viewerRole === "owner" && !!editingMember && editingMember.role !== "owner"
        }
        onTransferOwnership={() => {
          setTransferTarget(editingMember)
          setShowTransfer(true)
        }}
      />

      <TransferOwnershipDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        slug={slug}
        member={
          transferTarget
            ? { id: transferTarget.id, user: { name: transferTarget.user.name, email: transferTarget.user.email } }
            : null
        }
        onTransferred={() => {
          setTransferTarget(null)
          void refresh()
        }}
      />
    </PageTransition>
  )
}

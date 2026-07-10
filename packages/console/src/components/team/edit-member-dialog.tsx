"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import {
  MemberPermissionsForm,
  ALL_TOP_LEVEL_PERMISSIONS,
} from "@workspace/console/components/team/member-permissions-form"
import { confirm } from "@workspace/console/stores/confirm"
import type { Permission, CompanyMemberRole } from "@workspace/db/types"

interface MemberData {
  id: string
  role: CompanyMemberRole
  status: "active" | "suspended"
  permissions: Permission[]
  user: { name: string; email: string }
}

interface EditMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: MemberData | null
  onSave: (data: {
    role: CompanyMemberRole
    permissions: Permission[]
    status: "active" | "suspended"
  }) => Promise<void>
  onRemove: () => Promise<void>
  saving: boolean
  /** Viewer owner + hedef owner değil → "sahipliği devret" göster. */
  canTransferOwnership?: boolean
  /** Devir akışını başlat (edit dialog kapanır, TransferOwnershipDialog açılır). */
  onTransferOwnership?: () => void
}

export function EditMemberDialog({
  open,
  onOpenChange,
  member,
  onSave,
  onRemove,
  saving,
  canTransferOwnership,
  onTransferOwnership,
}: EditMemberDialogProps) {
  const t = useTranslations("team")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [role, setRole] = useState<CompanyMemberRole>("member")
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [status, setStatus] = useState<"active" | "suspended">("active")

  useEffect(() => {
    if (member) {
      setRole(member.role)
      setPermissions([...member.permissions])
      setStatus(member.status)
    }
  }, [member])

  // Admin rolune gecildiginde tum top-level yetkileri isaretle (scoped olanlari koru)
  useEffect(() => {
    if (role === "admin") {
      setPermissions((prev) => {
        const scoped = prev.filter(
          (p) =>
            p.startsWith("inbox.mailbox:") || p.startsWith("domains.domain:"),
        )
        return [...ALL_TOP_LEVEL_PERMISSIONS, ...scoped]
      })
    }
  }, [role])

  async function handleSave() {
    await onSave({ role, permissions, status })
  }

  async function handleRemoveClick() {
    if (!member) return
    const ok = await confirm({
      title: t("removeMember"),
      description: t("removeConfirmDesc", { name: member.user.name }),
      confirmText: t("removeMember"),
      destructive: true,
    })
    if (!ok) return
    await onRemove()
  }

  if (!member) return null

  const isOwner = member.role === "owner"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-5 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editMember")}</DialogTitle>
          <DialogDescription>
            {member.user.name} ({member.user.email})
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>{t("role")}</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as CompanyMemberRole)}
              disabled={saving || isOwner}
            >
              <SelectTrigger>
                <span className="truncate">{t(role) || t("selectRole")}</span>
              </SelectTrigger>
              <SelectContent>
                {isOwner && (
                  <SelectItem value="owner">{t("owner")}</SelectItem>
                )}
                <SelectItem value="admin">{t("admin")}</SelectItem>
                <SelectItem value="member">{t("member")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isOwner || role === "admin" ? (
            <div className="rounded-xl border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              {isOwner ? t("ownerHasAllNote") : t("adminHasAllNote")}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label>{t("permissions")}</Label>
              <MemberPermissionsForm
                companySlug={slug}
                permissions={permissions}
                onChange={setPermissions}
                disabled={saving}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label>{t("status")}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {status === "active" ? t("active") : t("suspended")}
              </span>
              <Switch
                checked={status === "active"}
                onCheckedChange={(checked) =>
                  setStatus(checked ? "active" : "suspended")
                }
                disabled={saving || isOwner}
              />
            </div>
          </div>

          {canTransferOwnership && !isOwner ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("transferOwnership")}</p>
                <p className="text-xs text-muted-foreground">{t("becomeAdminNote")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => {
                  onOpenChange(false)
                  onTransferOwnership?.()
                }}
              >
                {t("transferOwnership")}
              </Button>
            </div>
          ) : null}
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {!isOwner && (
            <Button
              variant="destructive"
              disabled={saving}
              onClick={handleRemoveClick}
            >
              {t("removeMember")}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || isOwner}>
              {saving && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

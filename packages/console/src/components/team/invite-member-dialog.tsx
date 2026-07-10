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
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  MemberPermissionsForm,
  ALL_TOP_LEVEL_PERMISSIONS,
} from "@workspace/console/components/team/member-permissions-form"
import type { Permission, CompanyMemberRole } from "@workspace/db/types"

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvite: (data: {
    email: string
    role: CompanyMemberRole
    permissions: Permission[]
  }) => Promise<void>
  saving: boolean
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  onInvite,
  saving,
}: InviteMemberDialogProps) {
  const t = useTranslations("team")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CompanyMemberRole>("member")
  const [permissions, setPermissions] = useState<Permission[]>([])

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

  useEffect(() => {
    if (!open) {
      setEmail("")
      setRole("member")
      setPermissions([])
    }
  }, [open])

  async function handleSubmit() {
    if (!email.trim()) return
    await onInvite({ email: email.trim(), role, permissions })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-5 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("inviteMember")}</DialogTitle>
          <DialogDescription>{t("inviteMemberDesc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>{t("email")}</Label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{t("role")}</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as CompanyMemberRole)}
              disabled={saving}
            >
              <SelectTrigger>
                <span className="truncate">{t(role) || t("selectRole")}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t("admin")}</SelectItem>
                <SelectItem value="member">{t("member")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "admin" ? (
            <div className="rounded-xl border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              {t("adminHasAllNote")}
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
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !email.trim()}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("addMember")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

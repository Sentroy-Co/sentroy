"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Camera01Icon } from "@hugeicons/core-free-icons"
import { useCompanyStore } from "@workspace/console/stores/company"
import { t as l10n } from "@workspace/console/lib/locale"
import { DirectAvatarUpload } from "@workspace/console/components/shared/direct-avatar-upload"
import { CompanyAvatar } from "@workspace/console/components/shared/company-avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { Pane, PaneTitle, SectionLabel, Group, Row, EditRow, UsageBar, PaneLoading, PaneNotice } from "./ui"

interface Settings {
  id: string
  name: string
  slug: string
  description?: string | null
  avatarUrl?: string | null
  coverImageUrl?: string | null
  usage?: { domains: number; members: number; mailboxes: number; storageBytes: number }
  membership?: { role: string }
  plan?: {
    name: Record<string, string>
    maxDomainsPerCompany: number
    maxMembersPerCompany: number
    maxMailboxesPerCompany: number
    storageLimit: number
  } | null
}

function fmtBytes(n: number): string {
  if (!n) return "0 B"
  const u = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

export function CompanyPane({ lang, slug, onDeleted }: { lang: string; slug: string; onDeleted: () => void }) {
  const t = useTranslations("os")
  const [d, setD] = useState<Settings | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [delOpen, setDelOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/companies/${slug}/settings`)
        if (r.status === 403) {
          if (!cancelled) setForbidden(true)
          return
        }
        const j = await r.json()
        if (!cancelled) setD(j.data ?? null)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  async function patch(body: Record<string, unknown>) {
    const r = await fetch(`/api/companies/${slug}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || t("common.couldNotSave"))
    setD((prev) => (prev ? { ...prev, ...j.data } : j.data))
    void useCompanyStore.getState().fetchCompanies(true)
    toast.success(t("common.saved"))
  }

  if (forbidden) return <PaneNotice>{t("companyPane.forbidden")}</PaneNotice>
  if (!d) return <PaneLoading />

  const isOwner = d.membership?.role === "owner"
  const usage = d.usage
  const plan = d.plan

  return (
    <Pane>
      <PaneTitle>{t("companyPane.title")}</PaneTitle>

      {/* Kapak görseli (public profil + dashboard'da görünür) */}
      <div className="mb-2 overflow-hidden rounded-xl ring-1 ring-border/60">
        <DirectAvatarUpload
          uploadUrl={`/api/companies/${slug}/cover`}
          defaultAspect="16:9"
          onUploaded={(json) => {
            const url = (json as { data?: { coverUrl?: string | null } }).data?.coverUrl ?? null
            setD((prev) => (prev ? { ...prev, coverImageUrl: url } : prev))
            toast.success(t("companyPane.coverUpdated"))
          }}
        >
          {({ onClick, disabled }) => (
            <button
              type="button"
              onClick={onClick}
              disabled={disabled}
              className="group relative block h-28 w-full overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-transparent"
            >
              {d.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.coverImageUrl} alt="" className="size-full object-cover" />
              ) : null}
              <span className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <HugeiconsIcon icon={Camera01Icon} className="size-5" strokeWidth={2} />
                <span className="text-xs font-medium">{t("companyPane.changeCover")}</span>
              </span>
            </button>
          )}
        </DirectAvatarUpload>
      </div>

      <div className="mb-2 flex items-center gap-4 rounded-xl bg-card p-4 ring-1 ring-border/60">
        <DirectAvatarUpload
          uploadUrl={`/api/companies/${slug}/avatar`}
          defaultAspect="1:1"
          onUploaded={(json) => {
            const url = (json as { data?: { avatarUrl?: string } }).data?.avatarUrl ?? null
            setD((prev) => (prev ? { ...prev, avatarUrl: url } : prev))
            void useCompanyStore.getState().fetchCompanies(true)
            toast.success(t("companyPane.logoUpdated"))
          }}
        >
          {({ onClick, disabled }) => (
            <button
              type="button"
              onClick={onClick}
              disabled={disabled}
              className="group relative size-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-border"
            >
              <CompanyAvatar name={d.name} avatarUrl={d.avatarUrl ?? null} size="lg" className="size-full rounded-2xl" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <HugeiconsIcon icon={Camera01Icon} className="size-5 text-white" strokeWidth={2} />
              </span>
            </button>
          )}
        </DirectAvatarUpload>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-foreground">{d.name}</p>
          <p className="truncate text-sm text-muted-foreground">sentroy.com/{d.slug}</p>
        </div>
      </div>

      <SectionLabel>{t("companyPane.general")}</SectionLabel>
      <Group>
        <EditRow label={t("companyPane.name")} value={d.name} onSave={(v) => patch({ name: v })} validate={(v) => (v ? null : t("companyPane.nameRequired"))} />
        <EditRow
          label={t("companyPane.urlSlug")}
          value={d.slug}
          dialogTitle={t("companyPane.urlSlug")}
          onSave={(v) => patch({ slug: v })}
          validate={(v) => (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) ? null : t("companyPane.slugInvalid"))}
        />
        <EditRow label={t("companyPane.description")} value={d.description || ""} placeholder={t("companyPane.descriptionPh")} multiline onSave={(v) => patch({ description: v || null })} />
      </Group>

      {plan && usage ? (
        <>
          <SectionLabel>{t("companyPane.planUsage")}</SectionLabel>
          <Group>
            <Row label={t("companyPane.currentPlan")} right={<span className="font-medium text-foreground">{l10n(plan.name, lang)}</span>} />
            <UsageBar label={t("companyPane.domains")} used={usage.domains} limit={plan.maxDomainsPerCompany} />
            <UsageBar label={t("companyPane.members")} used={usage.members} limit={plan.maxMembersPerCompany} />
            <UsageBar label={t("companyPane.mailboxes")} used={usage.mailboxes} limit={plan.maxMailboxesPerCompany} />
            <UsageBar label={t("companyPane.storage")} used={usage.storageBytes} limit={plan.storageLimit} format={fmtBytes} />
          </Group>
        </>
      ) : null}

      {isOwner ? (
        <>
          <SectionLabel>{t("companyPane.dangerZone")}</SectionLabel>
          <Group className="ring-red-500/30">
            <Row label={t("companyPane.deleteCompany")} description={t("companyPane.deleteDesc")} danger onClick={() => setDelOpen(true)} />
          </Group>
        </>
      ) : null}

      <DeleteCompanyDialog
        open={delOpen}
        onOpenChange={setDelOpen}
        name={d.name}
        slug={d.slug}
        onDeleted={onDeleted}
      />
    </Pane>
  )
}

function DeleteCompanyDialog({
  open,
  onOpenChange,
  name,
  slug,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  name: string
  slug: string
  onDeleted: () => void
}) {
  const t = useTranslations("os")
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)

  async function doDelete() {
    if (confirmText !== slug || busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/companies/${slug}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: slug }),
      })
      const j = await r.json()
      if (!r.ok) {
        toast.error(j.error || t("companyPane.deleteFailed"))
        setBusy(false)
        return
      }
      toast.success(t("companyPane.deleted"))
      onOpenChange(false)
      onDeleted()
    } catch {
      toast.error(t("common.somethingWrong"))
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="select-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("companyPane.deleteTitle", { name })}</DialogTitle>
          <DialogDescription>{t("companyPane.deleteDialogDesc", { slug })}</DialogDescription>
        </DialogHeader>
        <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={slug} autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={doDelete} disabled={busy || confirmText !== slug}>
            {busy ? t("companyPane.deleting") : t("companyPane.deleteCompany")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

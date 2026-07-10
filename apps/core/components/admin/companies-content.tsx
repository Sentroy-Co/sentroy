"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Building06Icon,
  Search01Icon,
  PencilEdit02Icon,
  Delete02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
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
import { BytesInput } from "@workspace/ui/components/bytes-input"
import { Label } from "@workspace/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

function CompanyAvatar({
  name,
  image,
  size = "size-8",
}: {
  name: string
  image?: string | null
  size?: string
}) {
  const letter = (name.trim()[0] || "?").toUpperCase()
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-xs font-semibold text-primary",
        size,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        letter
      )}
    </div>
  )
}

interface AdminCompany {
  id: string
  name: string
  slug: string
  ownerId: string
  planId: string
  maxMembers: number
  maxMailboxes: number
  maxDomains: number
  mailStorageLimit: number
  mailStorageUsed: number
  maxContacts: number
  trashRetentionDays: number
  monthlyEmailLimit: number
  monthlyEmailsSent: number
  owner: { name: string; email: string } | null
  membersCount: number
  avatarUrl?: string | null
  planName?: string | null
  storageUsed?: number
  fileCount?: number
  storageLimit?: number
  createdAt: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function CompaniesContent() {
  const t = useTranslations("admin")
  const tc = useTranslations("common")

  const [companies, setCompanies] = useState<AdminCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [editCompany, setEditCompany] = useState<AdminCompany | null>(null)
  const [editLimits, setEditLimits] = useState({
    maxMembers: 0,
    maxMailboxes: 0,
    maxDomains: 0,
    mailStorageLimit: 0,
    maxContacts: 0,
    trashRetentionDays: 0,
    monthlyEmailLimit: 0,
  })
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AdminCompany | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (search) params.set("search", search)

      const res = await fetch(`/api/admin/companies?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load companies")

      setCompanies(json.data.companies)
      setTotal(json.data.total)
      setTotalPages(json.data.totalPages)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load companies"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    fetchCompanies()
  }, [fetchCompanies])

  function openEditDialog(company: AdminCompany) {
    setEditCompany(company)
    setEditLimits({
      maxMembers: company.maxMembers,
      maxMailboxes: company.maxMailboxes,
      maxDomains: company.maxDomains,
      mailStorageLimit: company.mailStorageLimit,
      maxContacts: company.maxContacts,
      trashRetentionDays: company.trashRetentionDays,
      monthlyEmailLimit: company.monthlyEmailLimit,
    })
  }

  async function handleSaveCompany() {
    if (!editCompany) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/companies/${editCompany.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editLimits),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to update company")

      setCompanies((prev) =>
        prev.map((c) => (c.id === editCompany.id ? { ...c, ...json.data } : c)),
      )
      setEditCompany(null)
      toast.success(t("companySaved"))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update company"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCompany() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/companies/${deleteTarget.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to delete company")

      setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success(t("companyDeleted"))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete company"
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="rounded-xl border">
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
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
        <h1 className="text-2xl font-bold">{t("companies")}</h1>
        <div className="text-sm text-muted-foreground">
          {t("totalCompanies")}: {total}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={tc("search")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="pl-9"
          />
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Building06Icon} strokeWidth={1.5} />}
            title={tc("noResults")}
            description=""
          />
        </div>
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("owner")}</TableHead>
                  <TableHead>{t("plan")}</TableHead>
                  <TableHead>{t("members")}</TableHead>
                  <TableHead className="min-w-[160px]">{t("storage")}</TableHead>
                  <TableHead>{t("emailsSent")}</TableHead>
                  <TableHead className="text-end">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => {
                  const totalUsed =
                    (company.storageUsed ?? 0) + (company.mailStorageUsed ?? 0)
                  const limit =
                    (company.storageLimit ?? 0) > 0
                      ? company.storageLimit!
                      : company.mailStorageLimit
                  const pct =
                    limit > 0
                      ? Math.min(100, Math.round((totalUsed / limit) * 100))
                      : 0
                  return (
                  <TableRow key={company.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openEditDialog(company)}
                        className="flex items-center gap-2.5 text-left font-medium hover:underline"
                      >
                        <CompanyAvatar
                          name={company.name}
                          image={company.avatarUrl}
                        />
                        <span className="flex flex-col">
                          {company.name}
                          <span className="text-xs font-normal text-muted-foreground">
                            @{company.slug}
                          </span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      {company.owner
                        ? `${company.owner.name} (${company.owner.email})`
                        : company.ownerId}
                    </TableCell>
                    <TableCell>
                      <Badge variant={company.planName ? "default" : "outline"}>
                        {company.planName ?? t("noPlan")}
                      </Badge>
                    </TableCell>
                    <TableCell>{company.membersCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                          {formatBytes(totalUsed)}
                          {limit > 0 ? ` / ${formatBytes(limit)}` : ""}
                        </span>
                        {limit > 0 ? (
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={
                                pct >= 90
                                  ? "h-full rounded-full bg-destructive"
                                  : "h-full rounded-full bg-primary"
                              }
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {company.monthlyEmailsSent} / {company.monthlyEmailLimit}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(company)}
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                          <span className="sr-only">{t("editCompany")}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleteTarget(company)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                          <span className="sr-only">{tc("delete")}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {tc("back")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {tc("next")}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Edit Limits Dialog */}
      <Dialog open={!!editCompany} onOpenChange={(open) => !open && setEditCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              {editCompany ? (
                <>
                  <CompanyAvatar
                    name={editCompany.name}
                    image={editCompany.avatarUrl}
                    size="size-9"
                  />
                  <span className="flex flex-col">
                    {editCompany.name}
                    <span className="text-xs font-normal text-muted-foreground">
                      @{editCompany.slug}
                    </span>
                  </span>
                </>
              ) : (
                t("editCompany")
              )}
            </DialogTitle>
          </DialogHeader>

          {editCompany ? (
            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {t("plan")}
                </span>
                <Badge
                  variant={editCompany.planName ? "default" : "outline"}
                  className="w-fit"
                >
                  {editCompany.planName ?? t("noPlan")}
                </Badge>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {t("fileStorage")}
                </span>
                <span>
                  {formatBytes(editCompany.storageUsed ?? 0)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {editCompany.fileCount ?? 0} {t("files")}
                  </span>
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  {t("mailStorage")}
                </span>
                <span>{formatBytes(editCompany.mailStorageUsed)}</span>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("maxMembers")}</Label>
              <Input
                type="number"
                value={editLimits.maxMembers}
                onChange={(e) =>
                  setEditLimits((l) => ({ ...l, maxMembers: parseInt(e.target.value, 10) || 0 }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("maxMailboxes")}</Label>
              <Input
                type="number"
                value={editLimits.maxMailboxes}
                onChange={(e) =>
                  setEditLimits((l) => ({ ...l, maxMailboxes: parseInt(e.target.value, 10) || 0 }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("maxDomains")}</Label>
              <Input
                type="number"
                value={editLimits.maxDomains}
                onChange={(e) =>
                  setEditLimits((l) => ({ ...l, maxDomains: parseInt(e.target.value, 10) || 0 }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("storageLimitBytes")}</Label>
              <BytesInput
                value={editLimits.mailStorageLimit}
                onChange={(bytes) =>
                  setEditLimits((l) => ({ ...l, mailStorageLimit: bytes }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("maxContacts")}</Label>
              <Input
                type="number"
                value={editLimits.maxContacts}
                onChange={(e) =>
                  setEditLimits((l) => ({ ...l, maxContacts: parseInt(e.target.value, 10) || 0 }))
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("trashRetentionDays")}</Label>
              <Input
                type="number"
                value={editLimits.trashRetentionDays}
                onChange={(e) =>
                  setEditLimits((l) => ({ ...l, trashRetentionDays: parseInt(e.target.value, 10) || 0 }))
                }
              />
            </div>
            <div className="col-span-2 flex flex-col gap-2">
              <Label>{t("monthlyEmailLimit")}</Label>
              <Input
                type="number"
                value={editLimits.monthlyEmailLimit}
                onChange={(e) =>
                  setEditLimits((l) => ({ ...l, monthlyEmailLimit: parseInt(e.target.value, 10) || 0 }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditCompany(null)}
              disabled={saving}
            >
              {tc("cancel")}
            </Button>
            <Button onClick={handleSaveCompany} disabled={saving}>
              {saving && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc("delete")}</DialogTitle>
            <DialogDescription>
              {t("deleteCompanyConfirm", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteCompany} disabled={deleting}>
              {deleting && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

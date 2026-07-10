"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  UserMultipleIcon,
  Search01Icon,
  PencilEdit02Icon,
  Loading03Icon,
  UserIcon,
  Building06Icon,
  Logout01Icon,
  Mail01Icon,
  Login03Icon,
  CheckmarkBadge01Icon,
} from "@hugeicons/core-free-icons"

import { confirm } from "@workspace/console/stores/confirm"
import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  status: string
  image?: string | null
  emailVerified?: boolean
  lastLoginAt?: string
  createdAt: string
}

interface UserCompany {
  companyId: string
  name: string
  slug: string
  avatarUrl?: string | null
  role: string
  status: string
  planName?: string | null
  isOwner: boolean
}

const ROLE_LABELS: Record<string, string> = {
  user: "roleUser",
  admin: "roleAdmin",
}

const STATUS_LABELS: Record<string, string> = {
  active: "statusActive",
  suspended: "statusSuspended",
}

const COMPANY_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/** Kullanıcı avatarı — resim varsa img, yoksa baş harf. */
function UserAvatar({
  name,
  image,
  size = "size-10",
}: {
  name: string
  image?: string | null
  size?: string
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary",
        size,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </div>
  )
}

export function UsersContent() {
  const t = useTranslations("admin")
  const tc = useTranslations("common")

  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  // İlk yükleme skeleton'ı yalnız bir kez; sonraki refetch'lerde (arama/filtre/
  // sayfa) layout mount kalır → arama input'u focus'unu kaybetmez.
  const [initialLoad, setInitialLoad] = useState(true)
  const [search, setSearch] = useState("")
  // Arama input'u her tuşta fetch tetiklemesin — 300ms debounce.
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [tab, setTab] = useState("profile")
  const [editName, setEditName] = useState("")
  const [editRole, setEditRole] = useState("")
  const [editStatus, setEditStatus] = useState("")
  const [saving, setSaving] = useState(false)
  const [companies, setCompanies] = useState<UserCompany[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" })
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (roleFilter) params.set("role", roleFilter)
      if (statusFilter) params.set("status", statusFilter)

      const res = await fetch(`/api/admin/users?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load users")

      setUsers(json.data.users)
      setTotal(json.data.total)
      setTotalPages(json.data.totalPages)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load users"
      toast.error(message)
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [page, debouncedSearch, roleFilter, statusFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // search → debouncedSearch (300ms); arama değişince sayfa 1'e döner.
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const loadCompanies = useCallback(async (userId: string) => {
    setCompaniesLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/companies`)
      const json = await res.json()
      if (res.ok) setCompanies(json.data ?? [])
    } catch {
      setCompanies([])
    } finally {
      setCompaniesLoading(false)
    }
  }, [])

  function openEditDialog(user: AdminUser) {
    setEditUser(user)
    setTab("profile")
    setEditName(user.name)
    setEditRole(user.role)
    setEditStatus(user.status)
    setCompanies([])
    loadCompanies(user.id)
  }

  async function handleSaveUser() {
    if (!editUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          role: editRole,
          status: editStatus,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to update user")

      setUsers((prev) =>
        prev.map((u) => (u.id === editUser.id ? { ...u, ...json.data } : u)),
      )
      setEditUser((prev) => (prev ? { ...prev, ...json.data } : prev))
      toast.success(t("userSaved"))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update user"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword() {
    if (!editUser) return
    const ok = await confirm({
      title: t("sendResetLink"),
      description: t("resetLinkConfirm", { email: editUser.email }),
      confirmText: t("sendResetLink"),
    })
    if (!ok) return
    setActionLoading("reset")
    try {
      const res = await fetch(
        `/api/admin/users/${editUser.id}/reset-password`,
        { method: "POST" },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("resetLinkSent"))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleImpersonate() {
    if (!editUser) return
    const ok = await confirm({
      title: t("impersonate"),
      description: t("impersonateConfirm", { name: editUser.name }),
      confirmText: t("impersonate"),
      destructive: true,
    })
    if (!ok) return
    setActionLoading("impersonate")
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}/impersonate`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("impersonateStarted"))
      // Yeni session cookie set edildi → ana sayfaya git (o kullanıcı olarak).
      window.location.href = "/"
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed")
      setActionLoading(null)
    }
  }

  if (initialLoad) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-8 w-40" />
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
        <h1 className="text-2xl font-bold">{t("users")}</h1>
        <div className="text-sm text-muted-foreground">
          {t("totalUsers")}: {total}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={tc("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter || "all"}
          onValueChange={(v) => {
            setRoleFilter(v === "all" ? "" : v || "")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[140px]">
            <span>
              {roleFilter === "user"
                ? t("roleUser")
                : roleFilter === "admin"
                  ? t("roleAdmin")
                  : t("allRoles")}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allRoles")}</SelectItem>
            <SelectItem value="user">{t("roleUser")}</SelectItem>
            <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) => {
            setStatusFilter(v === "all" ? "" : v || "")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[140px]">
            <span>
              {statusFilter === "active"
                ? t("statusActive")
                : statusFilter === "suspended"
                  ? t("statusSuspended")
                  : t("allStatuses")}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="active">{t("statusActive")}</SelectItem>
            <SelectItem value="suspended">{t("statusSuspended")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.5} />}
            title={tc("noResults")}
            description=""
          />
        </div>
      ) : (
        <>
          <div
            className={cn(
              "rounded-xl border transition-opacity",
              loading && "pointer-events-none opacity-60",
            )}
            aria-busy={loading}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("lastLogin")}</TableHead>
                  <TableHead className="text-end">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openEditDialog(user)}
                        className="flex items-center gap-2.5 text-left font-medium hover:underline"
                      >
                        <UserAvatar
                          name={user.name}
                          image={user.image}
                          size="size-8"
                        />
                        {user.name}
                      </button>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === "admin" ? "default" : "outline"}
                      >
                        {t(ROLE_LABELS[user.role] ?? "roleUser")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          user.status === "active"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                        }
                      >
                        {t(STATUS_LABELS[user.status] ?? "statusActive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEditDialog(user)}
                        >
                          <HugeiconsIcon
                            icon={PencilEdit02Icon}
                            strokeWidth={2}
                          />
                          <span className="sr-only">{t("editUser")}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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

      <Dialog
        open={!!editUser}
        onOpenChange={(open) => !open && setEditUser(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editUser ? (
                <>
                  <UserAvatar name={editUser.name} image={editUser.image} />
                  <span className="flex flex-col">
                    <span>{editUser.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {editUser.email}
                    </span>
                  </span>
                </>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {editUser ? (
            <Tabs
              value={tab}
              onValueChange={setTab}
              className="flex flex-col gap-4"
            >
              <TabsList>
                <TabsTrigger value="profile" className="gap-2">
                  <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
                  {t("tabProfile")}
                </TabsTrigger>
                <TabsTrigger value="companies" className="gap-2">
                  <HugeiconsIcon icon={Building06Icon} strokeWidth={2} />
                  {t("tabCompanies")}
                </TabsTrigger>
                <TabsTrigger value="security" className="gap-2">
                  <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
                  {t("tabSecurity")}
                </TabsTrigger>
              </TabsList>

              <div className="min-h-[360px] min-w-0">
                {/* ── PROFİL ──────────────────────────────────────────── */}
                <TabsContent value="profile" className="mt-0 flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>{t("name")}</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>{t("email")}</Label>
                    <Input value={editUser.email} disabled readOnly />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label>{t("role")}</Label>
                      <Select
                        value={editRole}
                        onValueChange={(v) => setEditRole(v || "")}
                      >
                        <SelectTrigger>
                          <span>
                            {editRole === "admin"
                              ? t("roleAdmin")
                              : t("roleUser")}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">{t("roleUser")}</SelectItem>
                          <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>{t("status")}</Label>
                      <Select
                        value={editStatus}
                        onValueChange={(v) => setEditStatus(v || "")}
                      >
                        <SelectTrigger>
                          <span>
                            {editStatus === "suspended"
                              ? t("statusSuspended")
                              : t("statusActive")}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">
                            {t("statusActive")}
                          </SelectItem>
                          <SelectItem value="suspended">
                            {t("statusSuspended")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">
                        {t("emailVerified")}
                      </dt>
                      <dd className="flex items-center gap-1">
                        {editUser.emailVerified ? (
                          <>
                            <HugeiconsIcon
                              icon={CheckmarkBadge01Icon}
                              strokeWidth={2}
                              className="size-4 text-emerald-500"
                            />
                            {t("verified")}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("notVerified")}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">
                        {t("lastLogin")}
                      </dt>
                      <dd>
                        {editUser.lastLoginAt
                          ? new Date(editUser.lastLoginAt).toLocaleString()
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">
                        {t("memberSince")}
                      </dt>
                      <dd>
                        {editUser.createdAt
                          ? new Date(editUser.createdAt).toLocaleDateString()
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-xs text-muted-foreground">ID</dt>
                      <dd className="truncate font-mono text-xs">
                        {editUser.id}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveUser} disabled={saving}>
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
                  </div>
                </TabsContent>

                {/* ── ŞİRKETLER ───────────────────────────────────────── */}
                <TabsContent
                  value="companies"
                  className="mt-0 flex flex-col gap-2"
                >
                  {companiesLoading ? (
                    <>
                      <Skeleton className="h-14 w-full" />
                      <Skeleton className="h-14 w-full" />
                    </>
                  ) : companies.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      {t("noCompanies")}
                    </div>
                  ) : (
                    companies.map((c) => (
                      <div
                        key={c.companyId}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <UserAvatar
                          name={c.name}
                          image={c.avatarUrl}
                          size="size-9"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">
                            {c.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            @{c.slug}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={c.isOwner ? "default" : "outline"}>
                            {c.isOwner
                              ? COMPANY_ROLE_LABELS.owner
                              : (COMPANY_ROLE_LABELS[c.role] ?? c.role)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {c.planName ?? t("noPlan")}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* ── GÜVENLİK ────────────────────────────────────────── */}
                <TabsContent
                  value="security"
                  className="mt-0 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <HugeiconsIcon icon={Mail01Icon} strokeWidth={2} />
                        {t("sendResetLink")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("resetLinkDesc")}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleResetPassword}
                      disabled={actionLoading === "reset"}
                    >
                      {actionLoading === "reset" && (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          strokeWidth={2}
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      )}
                      {t("sendResetLink")}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <HugeiconsIcon icon={Login03Icon} strokeWidth={2} />
                        {t("impersonate")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("impersonateDesc")}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleImpersonate}
                      disabled={actionLoading === "impersonate"}
                    >
                      {actionLoading === "impersonate" && (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          strokeWidth={2}
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                      )}
                      {t("impersonate")}
                    </Button>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

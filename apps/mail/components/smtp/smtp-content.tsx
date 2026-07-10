"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ServerStack01Icon,
  PlusSignIcon,
  Delete02Icon,
  Loading03Icon,
  Copy01Icon,
  Tick02Icon,
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
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

interface SmtpCredential {
  id: string
  name: string
  username: string
  domainId: string
  isActive: boolean
  lastUsedAt?: string
  createdAt?: string
}

interface CreatedCredential extends SmtpCredential {
  password: string
}

function formatDate(date?: string) {
  if (!date) return "-"
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function CopyField({
  label,
  value,
}: {
  label: string
  value: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm break-all">
          {value}
        </code>
        <Button variant="outline" size="icon" onClick={handleCopy}>
          <HugeiconsIcon
            icon={copied ? Tick02Icon : Copy01Icon}
            strokeWidth={2}
          />
        </Button>
      </div>
    </div>
  )
}

export function SmtpContent() {
  const t = useTranslations("smtp")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const { domains, domainsLoading } = useCompanyDataStore()

  const [credentials, setCredentials] = useState<SmtpCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [createdCredential, setCreatedCredential] =
    useState<CreatedCredential | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [newName, setNewName] = useState("")
  const [newDomainId, setNewDomainId] = useState("")

  const apiBase = `/api/companies/${slug}/smtp`

  const fetchCredentials = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load SMTP credentials")
      }
      setCredentials((json.data as SmtpCredential[]) ?? [])
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load SMTP credentials"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  function resetForm() {
    setNewName("")
    setNewDomainId("")
  }

  async function handleCreate() {
    if (!newName.trim()) return
    if (!newDomainId) {
      toast.error(t("domainRequired"))
      return
    }

    setCreating(true)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          domainId: newDomainId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to create SMTP credential")
      }

      const created = json.data as CreatedCredential
      setCreatedCredential(created)
      setCredentials((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          username: created.username,
          domainId: created.domainId,
          isActive: created.isActive,
          lastUsedAt: created.lastUsedAt,
          createdAt: created.createdAt,
        },
      ])
      resetForm()
      setShowCreateDialog(false)
      setShowCredentialsDialog(true)
      toast.success(t("credentialCreated"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create SMTP credential"
      toast.error(message)
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(credential: SmtpCredential) {
    setTogglingId(credential.id)
    try {
      const res = await fetch(`${apiBase}/${credential.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !credential.isActive }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to update SMTP credential")
      }
      setCredentials((prev) =>
        prev.map((c) =>
          c.id === credential.id
            ? { ...c, isActive: !credential.isActive }
            : c
        )
      )
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update"
      toast.error(message)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete SMTP credential")
      }
      setCredentials((prev) => prev.filter((c) => c.id !== id))
      toast.success(t("credentialDeleted"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete"
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  function getDomainName(domainId: string) {
    const domain = domains.find((d) => d.id === domainId)
    return domain?.name ?? domainId
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
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
        <Button onClick={() => setShowCreateDialog(true)}>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("createCredential")}
        </Button>
      </div>

      {/* Connection Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("connectionInfo")}</CardTitle>
          <CardDescription>{t("connectionDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {t("host")}
              </span>
              <code className="rounded-md border bg-muted px-3 py-2 text-sm">
                mail.sentroy.com
              </code>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {t("port")}
              </span>
              <code className="rounded-md border bg-muted px-3 py-2 text-sm">
                587
              </code>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                {t("encryption")}
              </span>
              <code className="rounded-md border bg-muted px-3 py-2 text-sm">
                STARTTLS
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      {credentials.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={
              <HugeiconsIcon icon={ServerStack01Icon} strokeWidth={1.5} />
            }
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={() => setShowCreateDialog(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("createCredential")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("username")}</TableHead>
                <TableHead>{t("domain")}</TableHead>
                <TableHead>{t("active")}</TableHead>
                <TableHead>{t("lastUsed")}</TableHead>
                <TableHead className="text-end">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((cred) => (
                <TableRow key={cred.id}>
                  <TableCell className="font-medium">{cred.name}</TableCell>
                  <TableCell>
                    <code className="text-sm">{cred.username}</code>
                  </TableCell>
                  <TableCell>{getDomainName(cred.domainId)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={cred.isActive}
                      onCheckedChange={() => handleToggleActive(cred)}
                      disabled={togglingId === cred.id}
                    />
                  </TableCell>
                  <TableCell>{formatDate(cred.lastUsedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletingId === cred.id}
                        onClick={() => handleDelete(cred.id)}
                      >
                        <HugeiconsIcon
                          icon={
                            deletingId === cred.id
                              ? Loading03Icon
                              : Delete02Icon
                          }
                          strokeWidth={2}
                          className={
                            deletingId === cred.id
                              ? "animate-spin"
                              : undefined
                          }
                        />
                        <span className="sr-only">{t("deleteAction")}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create SMTP Credential Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createCredential")}</DialogTitle>
            <DialogDescription>
              {t("createDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("name")}</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t("domain")}</Label>
              <Select value={newDomainId} onValueChange={(v) => setNewDomainId(v ?? "")}>
                <SelectTrigger>
                  <span>{newDomainId ? getDomainName(newDomainId) : t("selectDomain")}</span>
                </SelectTrigger>
                <SelectContent>
                  {domains.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id} label={domain.name}>
                      {domain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false)
                resetForm()
              }}
              disabled={creating}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("createCredential")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Credentials Dialog (one-time display) */}
      <Dialog
        open={showCredentialsDialog}
        onOpenChange={(open) => {
          setShowCredentialsDialog(open)
          if (!open) setCreatedCredential(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("credentialsTitle")}</DialogTitle>
            <DialogDescription>
              {t("credentialsDescription")}
            </DialogDescription>
          </DialogHeader>
          {createdCredential && (
            <div className="flex flex-col gap-3">
              <CopyField label={t("host")} value="mail.sentroy.com" />
              <CopyField label={t("port")} value="587" />
              <CopyField
                label={t("username")}
                value={createdCredential.username}
              />
              <CopyField
                label={t("password")}
                value={createdCredential.password}
              />
              <p className="text-sm text-muted-foreground">
                {t("passwordWarning")}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setShowCredentialsDialog(false)
                setCreatedCredential(null)
              }}
            >
              {t("done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

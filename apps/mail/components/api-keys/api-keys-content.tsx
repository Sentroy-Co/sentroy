"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Key01Icon,
  PlusSignIcon,
  Delete02Icon,
  Loading03Icon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { confirm } from "@workspace/console/stores/confirm"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Calendar } from "@workspace/ui/components/calendar"

interface ApiKey {
  id: string
  name: string
  key?: string
  scopes: string[]
  domainId?: string
  lastUsedAt?: string
  expiresAt?: string
  createdAt?: string
}

const AVAILABLE_SCOPES = ["send", "read", "admin"]

function formatDate(date?: string) {
  if (!date) return "-"
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function ApiKeysContent() {
  const t = useTranslations("apiKeys")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const { domains } = useCompanyDataStore()

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [createdKey, setCreatedKey] = useState("")
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const [newName, setNewName] = useState("")
  const [newScopes, setNewScopes] = useState<string[]>([])
  const [newDomainId, setNewDomainId] = useState("")
  const [newExpiresAt, setNewExpiresAt] = useState<Date | undefined>(undefined)

  const apiBase = `/api/companies/${slug}/api-keys`

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load API keys")
      }
      setKeys((json.data as ApiKey[]) ?? [])
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load API keys"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  function resetForm() {
    setNewName("")
    setNewScopes([])
    setNewDomainId("")
    setNewExpiresAt(undefined)
  }

  function toggleScope(scope: string) {
    setNewScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((s) => s !== scope)
        : [...prev, scope]
    )
  }

  async function handleCreate() {
    if (!newName.trim()) return
    if (newScopes.length === 0) {
      toast.error(t("scopeRequired"))
      return
    }

    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        name: newName.trim(),
        scopes: newScopes,
      }
      if (newDomainId) body.domainId = newDomainId
      if (newExpiresAt) body.expiresAt = newExpiresAt.toISOString()

      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to create API key")
      }

      const created = json.data as ApiKey
      setCreatedKey(created.key || "")
      setKeys((prev) => [...prev, { ...created, key: undefined }])
      resetForm()
      setShowCreateDialog(false)
      setShowKeyDialog(true)
      toast.success(t("keyCreated"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create API key"
      toast.error(message)
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    const key = keys.find((k) => k.id === id)
    const ok = await confirm({
      title: t("confirmRevokeTitle"),
      description: t("confirmRevokeDesc", { name: key?.name ?? id }),
      confirmText: t("revoke"),
      destructive: true,
    })
    if (!ok) return

    setRevokingId(id)
    try {
      const res = await fetch(`${apiBase}/${id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to revoke API key")
      }
      setKeys((prev) => prev.filter((k) => k.id !== id))
      toast.success(t("keyRevoked"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to revoke API key"
      toast.error(message)
    } finally {
      setRevokingId(null)
    }
  }

  async function handleCopyKey() {
    await navigator.clipboard.writeText(createdKey)
    setCopied(true)
    toast.success(t("keyCopied"))
    setTimeout(() => setCopied(false), 2000)
  }

  function getDomainName(domainId?: string) {
    if (!domainId) return "-"
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
          {t("createKey")}
        </Button>
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Key01Icon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={() => setShowCreateDialog(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("createKey")}
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
                <TableHead>{t("scopes")}</TableHead>
                <TableHead>{t("domain")}</TableHead>
                <TableHead>{t("lastUsed")}</TableHead>
                <TableHead>{t("expiresAt")}</TableHead>
                <TableHead className="text-end">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell className="font-medium">{apiKey.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {apiKey.scopes.map((scope) => (
                        <Badge key={scope} variant="outline">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{getDomainName(apiKey.domainId)}</TableCell>
                  <TableCell>{formatDate(apiKey.lastUsedAt)}</TableCell>
                  <TableCell>{formatDate(apiKey.expiresAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={revokingId === apiKey.id}
                        onClick={() => handleRevoke(apiKey.id)}
                      >
                        <HugeiconsIcon
                          icon={
                            revokingId === apiKey.id
                              ? Loading03Icon
                              : Delete02Icon
                          }
                          strokeWidth={2}
                          className={
                            revokingId === apiKey.id
                              ? "animate-spin"
                              : undefined
                          }
                        />
                        <span className="sr-only">{t("revoke")}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create API Key Dialog */}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createKey")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
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
              <Label>{t("scopes")}</Label>
              <div className="flex flex-col gap-2">
                {AVAILABLE_SCOPES.map((scope) => (
                  <div key={scope} className="flex items-center gap-2">
                    <Checkbox
                      id={`scope-${scope}`}
                      checked={newScopes.includes(scope)}
                      onCheckedChange={() => toggleScope(scope)}
                      disabled={creating}
                    />
                    <Label
                      htmlFor={`scope-${scope}`}
                      className="cursor-pointer font-normal"
                    >
                      {scope}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {domains.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>{t("domain")} ({t("optional")})</Label>
                <Select value={newDomainId} onValueChange={(v) => setNewDomainId(v ?? "")}>
                  <SelectTrigger>
                    <span>{domains.find((d) => d.id === newDomainId)?.name || t("selectDomain")}</span>
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
            )}

            <div className="flex flex-col gap-2">
              <Label>{t("expiresAt")} ({t("optional")})</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button variant="outline" className="justify-start">
                      {newExpiresAt
                        ? newExpiresAt.toLocaleDateString()
                        : t("pickDate")}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newExpiresAt}
                    onSelect={setNewExpiresAt}
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
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
              {t("createKey")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Key Dialog (one-time display) */}
      <Dialog
        open={showKeyDialog}
        onOpenChange={(open) => {
          setShowKeyDialog(open)
          if (!open) {
            setCreatedKey("")
            setCopied(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("keyCreatedTitle")}</DialogTitle>
            <DialogDescription>{t("keyCreatedDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm break-all">
                {createdKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyKey}
              >
                <HugeiconsIcon
                  icon={copied ? Tick02Icon : Copy01Icon}
                  strokeWidth={2}
                />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("keyWarning")}
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setShowKeyDialog(false)
                setCreatedKey("")
                setCopied(false)
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

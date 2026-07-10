"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
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

interface AccessToken {
  id: string
  name: string
  tokenPrefix: string
  createdById: string
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  /** Only returned once at creation */
  plainToken?: string
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—"
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export function AccessTokensContent() {
  const t = useTranslations("accessTokens")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [tokens, setTokens] = useState<AccessToken[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newExpiry, setNewExpiry] = useState("")

  // Created token reveal
  const [revealToken, setRevealToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [slugCopied, setSlugCopied] = useState(false)

  const apiBase = `/api/companies/${slug}/access-tokens`

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setTokens((json.data as AccessToken[]) ?? [])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load tokens")
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const body: Record<string, unknown> = { name: newName.trim() }
      if (newExpiry) body.expiresAt = new Date(newExpiry).toISOString()
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      const created = json.data as AccessToken
      setRevealToken(created.plainToken ?? null)
      setCreateOpen(false)
      setNewName("")
      setNewExpiry("")
      fetchTokens()
      toast.success(t("tokenCreated"))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create token")
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(token: AccessToken) {
    const ok = await confirm({
      title: t("revokeTitle"),
      description: t("revokeDesc", { name: token.name }),
      confirmText: t("revoke"),
      destructive: true,
    })
    if (!ok) return
    setRevokingId(token.id)
    try {
      const res = await fetch(`${apiBase}?id=${token.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setTokens((prev) => prev.filter((t) => t.id !== token.id))
      toast.success(t("tokenRevoked"))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke")
    } finally {
      setRevokingId(null)
    }
  }

  function handleCopy() {
    if (!revealToken) return
    navigator.clipboard.writeText(revealToken)
    setCopied(true)
    toast.success(t("copied"))
    setTimeout(() => setCopied(false), 2000)
  }

  function handleCopySlug() {
    navigator.clipboard.writeText(slug)
    setSlugCopied(true)
    toast.success(t("slugCopied"))
    setTimeout(() => setSlugCopied(false), 2000)
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageTransition>
    )
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("description")}{" "}
            <a
              href="https://sentroy-co.github.io/client-sdk/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {t("viewDocs")} &rarr;
            </a>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("createToken")}
        </Button>
      </div>

      {/* Company slug strip — SDK baglantisi icin gerekli bilgi */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("companySlug")}
        </span>
        <code className="flex-1 min-w-0 truncate rounded-md bg-background px-2 py-1 font-mono text-sm">
          {slug}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopySlug}
          className="shrink-0"
        >
          <HugeiconsIcon
            icon={slugCopied ? Tick02Icon : Copy01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {slugCopied ? t("copied") : t("copy")}
        </Button>
      </div>

      {tokens.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Key01Icon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("createToken")}
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
                <TableHead>{t("token")}</TableHead>
                <TableHead>{t("lastUsed")}</TableHead>
                <TableHead>{t("expires")}</TableHead>
                <TableHead>{t("created")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell className="font-medium">{token.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {token.tokenPrefix}••••••
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(token.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {token.expiresAt ? formatDate(token.expiresAt) : t("never")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(token.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={revokingId === token.id}
                      onClick={() => handleRevoke(token)}
                    >
                      <HugeiconsIcon
                        icon={
                          revokingId === token.id
                            ? Loading03Icon
                            : Delete02Icon
                        }
                        strokeWidth={2}
                        className={
                          revokingId === token.id
                            ? "animate-spin text-muted-foreground"
                            : "text-destructive"
                        }
                      />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Create dialog ──────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("name")}</Label>
              <Input
                value={newName}
                onChange={(e) =>
                  setNewName((e.target as HTMLInputElement).value)
                }
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("expiresLabel")}</Label>
              <Input
                type="date"
                value={newExpiry}
                onChange={(e) =>
                  setNewExpiry((e.target as HTMLInputElement).value)
                }
                min={new Date().toISOString().split("T")[0]}
              />
              <p className="text-xs text-muted-foreground">
                {t("expiresHint")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Token reveal dialog ────────────────────────────────────────── */}
      <Dialog
        open={!!revealToken}
        onOpenChange={(open) => {
          if (!open) {
            setRevealToken(null)
            setCopied(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tokenCreatedTitle")}</DialogTitle>
            <DialogDescription>{t("tokenCreatedDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("companySlug")}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden rounded-lg border bg-muted/50 px-3 py-2 text-sm break-all">
                  {slug}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopySlug}>
                  <HugeiconsIcon
                    icon={slugCopied ? Tick02Icon : Copy01Icon}
                    strokeWidth={2}
                  />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("accessToken")}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden rounded-lg border bg-muted/50 px-3 py-2 text-sm break-all">
                  {revealToken}
                </code>
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    strokeWidth={2}
                  />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setRevealToken(null)
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

"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Loading03Icon,
  Delete02Icon,
  Edit02Icon,
  ShieldKeyIcon,
  Copy01Icon,
  Tick02Icon,
  ArrowReloadHorizontalIcon,
  GlobalIcon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Switch } from "@workspace/ui/components/switch"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { confirm } from "@workspace/console/stores/confirm"

/**
 * Sentroy Auth — per-company OAuth client management.
 *
 * Müşteri bu ekranda kendi sitesi için bir OAuth client kaydeder; client_id
 * hep görünür, client_secret sadece create + rotate response'unda tek
 * seferlik gösterilir.
 */

type OAuthScope = "openid" | "profile" | "email" | "offline_access"

interface OAuthClient {
  id: string
  clientId: string
  clientSecretPrefix: string
  name: string
  description: string | null
  redirectUris: string[]
  allowedScopes: OAuthScope[]
  homepageUrl: string | null
  logoUrl: string | null
  enabled: boolean
  lastUsedAt: string | null
  createdAt: string
}

const SCOPE_OPTIONS: {
  value: OAuthScope
  label: string
  hint: string
  required?: boolean
}[] = [
  { value: "openid", label: "openid", hint: "OIDC subject id (always required)", required: true },
  { value: "profile", label: "profile", hint: "name + picture" },
  { value: "email", label: "email", hint: "email + verification status" },
  {
    value: "offline_access",
    label: "offline_access",
    hint: "refresh tokens — keep users signed in past 1h",
  },
]

export function OAuthClientsContent() {
  const t = useTranslations("oauthClients")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]
  const apiBase = `/api/companies/${slug}/oauth-clients`

  const [clients, setClients] = useState<OAuthClient[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<OAuthClient | null>(null)
  const [createdSecret, setCreatedSecret] = useState<{
    clientId: string
    clientSecret: string
    name: string
  } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("loadFailed"))
      setClients(json.data ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [apiBase, t])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  async function deleteClient(c: OAuthClient) {
    const ok = await confirm({
      title: t("deleteConfirmTitle", { name: c.name }),
      description: t("deleteConfirmDescription", { clientId: c.clientId }),
      confirmText: t("deleteConfirm"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/${c.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success(t("deleted"))
      fetchAll()
    } else {
      toast.error(t("deleteFailed"))
    }
  }

  async function rotateSecret(c: OAuthClient) {
    const ok = await confirm({
      title: t("rotateConfirmTitle", { name: c.name }),
      description: t("rotateConfirmDescription"),
      confirmText: t("rotateConfirm"),
      destructive: true,
    })
    if (!ok) return
    const res = await fetch(`${apiBase}/${c.id}?action=rotate-secret`, {
      method: "PATCH",
    })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error || t("rotateFailed"))
      return
    }
    setCreatedSecret({
      clientId: c.clientId,
      clientSecret: json.data.clientSecret,
      name: c.name,
    })
    fetchAll()
  }

  async function toggleEnabled(c: OAuthClient) {
    const res = await fetch(`${apiBase}/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !c.enabled }),
    })
    if (res.ok) {
      fetchAll()
    } else {
      toast.error(t("failed"))
    }
  }

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-4rem)] min-w-0 flex-col gap-4">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-4">
          <div className="flex flex-col gap-1">
            <div className="inline-flex w-fit items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <HugeiconsIcon
                icon={ShieldKeyIcon}
                strokeWidth={2}
                className="size-3"
              />
              {t("subtitle")}
            </div>
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="max-w-2xl text-xs text-muted-foreground">
              {t.rich("description", {
                clientIdCode: () => <code>client_id</code>,
                clientSecretCode: () => <code>client_secret</code>,
              })}
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("newButton")}
          </Button>
        </div>

        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 pe-3">
            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : clients.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t("empty")}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {clients.map((c) => (
                  <ClientCard
                    key={c.id}
                    client={c}
                    onEdit={() => setEditingClient(c)}
                    onDelete={() => deleteClient(c)}
                    onRotate={() => rotateSecret(c)}
                    onToggle={() => toggleEnabled(c)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <CreateClientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        apiBase={apiBase}
        onCreated={(secret) => {
          setCreatedSecret(secret)
          fetchAll()
        }}
      />
      {createdSecret ? (
        <SecretShownOnceDialog
          open={!!createdSecret}
          onOpenChange={(o) => !o && setCreatedSecret(null)}
          info={createdSecret}
        />
      ) : null}
      {editingClient ? (
        <EditClientDialog
          open={!!editingClient}
          onOpenChange={(o) => !o && setEditingClient(null)}
          apiBase={apiBase}
          client={editingClient}
          onSaved={() => {
            setEditingClient(null)
            fetchAll()
          }}
        />
      ) : null}
    </PageTransition>
  )
}

function ClientCard({
  client,
  onEdit,
  onDelete,
  onRotate,
  onToggle,
}: {
  client: OAuthClient
  onEdit: () => void
  onDelete: () => void
  onRotate: () => void
  onToggle: () => void
}) {
  const t = useTranslations("oauthClients")
  const [copiedField, setCopiedField] = useState<"id" | null>(null)
  function copy(value: string) {
    navigator.clipboard.writeText(value)
    setCopiedField("id")
    setTimeout(() => setCopiedField(null), 1500)
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 max-w-full items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{client.name}</h3>
            {!client.enabled ? (
              <Badge variant="outline" className="text-[10px]">
                {t("disabledBadge")}
              </Badge>
            ) : null}
          </div>
          {client.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {client.description}
            </p>
          ) : null}
          {client.homepageUrl ? (
            <a
              href={client.homepageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon
                icon={GlobalIcon}
                strokeWidth={2}
                className="size-3"
              />
              {(() => {
                try {
                  return new URL(client.homepageUrl).hostname
                } catch {
                  return client.homepageUrl
                }
              })()}
            </a>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Switch checked={client.enabled} onCheckedChange={onToggle} />
            {t("enabledLabel")}
          </label>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            title={t("editTitle")}
          >
            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRotate}
            title={t("rotateTitle")}
          >
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            title={t("deleteTitle")}
          >
            <HugeiconsIcon
              icon={Delete02Icon}
              strokeWidth={2}
              className="text-destructive"
            />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("fieldClientId")}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <code className="truncate font-mono">{client.clientId}</code>
            <button
              type="button"
              onClick={() => copy(client.clientId)}
              className="text-muted-foreground hover:text-foreground"
              title={t("copyTitle")}
            >
              <HugeiconsIcon
                icon={copiedField === "id" ? Tick02Icon : Copy01Icon}
                strokeWidth={2}
                className="size-3"
              />
            </button>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("fieldClientSecret")}
          </div>
          <div className="mt-0.5 truncate font-mono text-muted-foreground">
            {client.clientSecretPrefix}…
            <span className="ml-1 text-[10px]">{t("secretShownOnceHint")}</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("redirectUrisLabel")}
        </div>
        <ul className="mt-0.5 flex flex-col gap-0.5 font-mono text-[11px]">
          {client.redirectUris.map((u) => (
            <li key={u} className="truncate">
              {u}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>{t("scopesLabel")}</span>
        {client.allowedScopes.map((s) => (
          <Badge key={s} variant="outline" className="px-1.5 py-0 text-[10px]">
            {s}
          </Badge>
        ))}
      </div>
    </div>
  )
}

function CreateClientDialog({
  open,
  onOpenChange,
  apiBase,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  onCreated: (secret: { clientId: string; clientSecret: string; name: string }) => void
}) {
  const t = useTranslations("oauthClients")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [redirectUrisText, setRedirectUrisText] = useState("")
  const [homepageUrl, setHomepageUrl] = useState("")
  const [scopes, setScopes] = useState<Set<OAuthScope>>(
    () => new Set<OAuthScope>(["openid", "profile", "email"]),
  )
  const [saving, setSaving] = useState(false)

  // i18n hint mapping per scope value
  const scopeHint: Record<OAuthScope, string> = {
    openid: t("scopeOpenidHint"),
    profile: t("scopeProfileHint"),
    email: t("scopeEmailHint"),
    offline_access: t("scopeOfflineHint"),
  }

  useEffect(() => {
    if (open) {
      setName("")
      setDescription("")
      setRedirectUrisText("")
      setHomepageUrl("")
      setScopes(new Set<OAuthScope>(["openid", "profile", "email"]))
    }
  }, [open])

  function toggleScope(s: OAuthScope) {
    setScopes((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      // openid her zaman set
      next.add("openid")
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const redirectUris = redirectUrisText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          redirectUris,
          allowedScopes: Array.from(scopes),
          homepageUrl: homepageUrl || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("failed"))
      toast.success(t("created"))
      onOpenChange(false)
      onCreated({
        clientId: json.data.clientId,
        clientSecret: json.data.clientSecret,
        name: json.data.name,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={"max-w-xl"}>
        <DialogHeader>
          <DialogTitle>{t("createDialogTitle")}</DialogTitle>
          <DialogDescription>{t("createDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("name")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("descriptionLabel")}</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              {t("redirectUrisInputLabel")}
            </label>
            <Textarea
              value={redirectUrisText}
              onChange={(e) => setRedirectUrisText(e.target.value)}
              rows={4}
              placeholder={t("redirectUrisPlaceholder")}
              disabled={saving}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              {t("redirectUrisHint")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("scopesPickerLabel")}</label>
            <div className="flex flex-col gap-1.5 rounded-lg border p-3">
              {SCOPE_OPTIONS.map((s) => (
                <label
                  key={s.value}
                  className="flex items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={scopes.has(s.value)}
                    onChange={() => toggleScope(s.value)}
                    disabled={saving || s.required}
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <div className="flex flex-col">
                    <code className="font-mono text-xs">{s.label}</code>
                    <span className="text-[10px] text-muted-foreground">
                      {scopeHint[s.value]}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t("scopesPickerHint")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("homepageUrl")}</label>
            <Input
              value={homepageUrl}
              onChange={(e) => setHomepageUrl(e.target.value)}
              placeholder={t("homepageUrlPlaceholder")}
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name || !redirectUrisText}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("createSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditClientDialog({
  open,
  onOpenChange,
  apiBase,
  client,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiBase: string
  client: OAuthClient
  onSaved: () => void
}) {
  const t = useTranslations("oauthClients")
  const [name, setName] = useState(client.name)
  const [description, setDescription] = useState(client.description ?? "")
  const [redirectUrisText, setRedirectUrisText] = useState(
    client.redirectUris.join("\n"),
  )
  const [homepageUrl, setHomepageUrl] = useState(client.homepageUrl ?? "")
  const [scopes, setScopes] = useState<Set<OAuthScope>>(
    () => new Set<OAuthScope>(client.allowedScopes),
  )
  const [saving, setSaving] = useState(false)

  const scopeHint: Record<OAuthScope, string> = {
    openid: t("scopeOpenidHint"),
    profile: t("scopeProfileHint"),
    email: t("scopeEmailHint"),
    offline_access: t("scopeOfflineHint"),
  }

  // Re-seed when caller swaps the active client (different row)
  useEffect(() => {
    if (open) {
      setName(client.name)
      setDescription(client.description ?? "")
      setRedirectUrisText(client.redirectUris.join("\n"))
      setHomepageUrl(client.homepageUrl ?? "")
      setScopes(new Set<OAuthScope>(client.allowedScopes))
    }
  }, [open, client])

  function toggleScope(s: OAuthScope) {
    setScopes((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      next.add("openid")
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const redirectUris = redirectUrisText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch(`${apiBase}/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          redirectUris,
          allowedScopes: Array.from(scopes),
          homepageUrl: homepageUrl || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("failed"))
      toast.success(t("updated"))
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failed"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("editDialogTitle")}</DialogTitle>
          <DialogDescription>{t("editDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("name")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("descriptionLabel")}</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">
              {t("redirectUrisInputLabel")}
            </label>
            <Textarea
              value={redirectUrisText}
              onChange={(e) => setRedirectUrisText(e.target.value)}
              rows={4}
              placeholder={t("redirectUrisPlaceholder")}
              disabled={saving}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              {t("redirectUrisHint")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("scopesPickerLabel")}</label>
            <div className="flex flex-col gap-1.5 rounded-lg border p-3">
              {SCOPE_OPTIONS.map((s) => (
                <label
                  key={s.value}
                  className="flex items-start gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={scopes.has(s.value)}
                    onChange={() => toggleScope(s.value)}
                    disabled={saving || s.required}
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <div className="flex flex-col">
                    <code className="font-mono text-xs">{s.label}</code>
                    <span className="text-[10px] text-muted-foreground">
                      {scopeHint[s.value]}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t("scopesPickerHint")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">{t("homepageUrl")}</label>
            <Input
              value={homepageUrl}
              onChange={(e) => setHomepageUrl(e.target.value)}
              placeholder={t("homepageUrlPlaceholder")}
              disabled={saving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name || !redirectUrisText}>
            {saving && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {t("editSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SecretShownOnceDialog({
  open,
  onOpenChange,
  info,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  info: { clientId: string; clientSecret: string; name: string }
}) {
  const t = useTranslations("oauthClients")
  const [copied, setCopied] = useState<"id" | "secret" | null>(null)
  function copy(value: string, field: "id" | "secret") {
    navigator.clipboard.writeText(value)
    setCopied(field)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("credentialsTitle", { name: info.name })}</DialogTitle>
          <DialogDescription>
            {t("credentialsDescription", { envName: "SENTROY_CLIENT_SECRET" })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("fieldClientId")}
            </span>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
              <code className="flex-1 break-all font-mono text-xs">{info.clientId}</code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copy(info.clientId, "id")}
              >
                <HugeiconsIcon icon={copied === "id" ? Tick02Icon : Copy01Icon} strokeWidth={2} />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("fieldClientSecret")}
            </span>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
              <code className="flex-1 break-all font-mono text-xs">
                {info.clientSecret}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copy(info.clientSecret, "secret")}
              >
                <HugeiconsIcon
                  icon={copied === "secret" ? Tick02Icon : Copy01Icon}
                  strokeWidth={2}
                />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("credentialsDone")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

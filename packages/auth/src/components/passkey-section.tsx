"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  KeyIcon,
  Delete02Icon,
  PlusSignIcon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { confirm } from "@workspace/console/stores/confirm"

interface Passkey {
  id: string
  name: string
  transports?: string[]
  createdAt: string
  lastUsedAt: string | null
}

function formatDate(d: string | null) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return null
  }
}

export function PasskeySection() {
  const t = useTranslations("auth")

  const [supported, setSupported] = useState<boolean | null>(null)
  const [items, setItems] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState("")

  useEffect(() => {
    setSupported(browserSupportsWebAuthn())
  }, [])

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch("/api/passkey")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setItems((json.data ?? []) as Passkey[])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    const name = newName.trim() || t("passkeyDefaultName")
    setAdding(true)
    try {
      const beginRes = await fetch("/api/passkey/register/begin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const beginJson = await beginRes.json()
      if (!beginRes.ok)
        throw new Error(beginJson.error || "Begin failed")

      // Browser prompts user — TouchID, security key, etc.
      const attResp = await startRegistration({
        optionsJSON: beginJson.data,
      })

      const completeRes = await fetch("/api/passkey/register/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, response: attResp }),
      })
      const completeJson = await completeRes.json()
      if (!completeRes.ok)
        throw new Error(completeJson.error || "Verify failed")

      toast.success(t("passkeyAdded"))
      setDialogOpen(false)
      setNewName("")
      refresh()
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.name === "NotAllowedError"
          ? t("passkeyCancelled")
          : err instanceof Error
          ? err.message
          : "Add failed"
      toast.error(message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(p: Passkey) {
    const ok = await confirm({
      title: t("passkeyRemoveConfirmTitle"),
      description: t("passkeyRemoveConfirmDesc", { name: p.name }),
      confirmText: t("passkeyRemove"),
      destructive: true,
    })
    if (!ok) return
    setRemovingId(p.id)
    try {
      const res = await fetch(`/api/passkey/${p.id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Delete failed")
      setItems((prev) => prev.filter((i) => i.id !== p.id))
      toast.success(t("passkeyRemoved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setRemovingId(null)
    }
  }

  if (supported === false) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          className="size-4"
        />
        {t("passkeyUnsupported")}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{t("passkeyTitle")}</span>
          <span className="text-xs text-muted-foreground">
            {t("passkeyDescription")}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setNewName("")
            setDialogOpen(true)
          }}
          disabled={loading}
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("passkeyAdd")}
        </Button>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">{t("passkeyLoading")}</div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          {t("passkeyEmpty")}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                <HugeiconsIcon
                  icon={KeyIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </div>
              <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {p.lastUsedAt
                    ? t("passkeyLastUsed", {
                        date: formatDate(p.lastUsedAt) ?? "",
                      })
                    : t("passkeyAdded2", {
                        date: formatDate(p.createdAt) ?? "",
                      })}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemove(p)}
                disabled={removingId === p.id}
                title={t("passkeyRemove")}
              >
                <HugeiconsIcon
                  icon={
                    removingId === p.id ? Loading03Icon : Delete02Icon
                  }
                  strokeWidth={2}
                  className={
                    "size-4" + (removingId === p.id ? " animate-spin" : "")
                  }
                />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("passkeyAdd")}</DialogTitle>
            <DialogDescription>
              {t("passkeyAddDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="passkey-name" className="text-xs">
              {t("passkeyNameLabel")}
            </Label>
            <Input
              id="passkey-name"
              value={newName}
              onChange={(e) =>
                setNewName((e.target as HTMLInputElement).value)
              }
              placeholder={t("passkeyDefaultName")}
              disabled={adding}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={adding}
            >
              {t("forgotBackToLogin")}
            </Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("passkeyContinue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

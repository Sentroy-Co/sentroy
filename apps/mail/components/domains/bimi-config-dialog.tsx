"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Tick02Icon,
  Cancel01Icon,
  Loading03Icon,
  Refresh01Icon,
  ImageAdd01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"

interface BimiConfig {
  bimiLogoUrl: string | null
  bimiVmcUrl: string | null
  bimiVerified: boolean
}

export function BimiConfigDialog({
  open,
  onOpenChange,
  domainId,
  domainName,
  domainStatus,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domainId: string
  domainName: string
  domainStatus: string
  onUpdated: () => void
}) {
  const t = useTranslations("bimi")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [logoUrl, setLogoUrl] = useState("")
  const [vmcUrl, setVmcUrl] = useState("")
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const apiBase = `/api/companies/${slug}/domains/${domainId}/bimi`

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(apiBase)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          const d = json.data as BimiConfig
          setLogoUrl(d.bimiLogoUrl || "")
          setVmcUrl(d.bimiVmcUrl || "")
          setVerified(d.bimiVerified)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, apiBase])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(apiBase, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: logoUrl.trim() || null,
          vmcUrl: vmcUrl.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setVerified(false)
      toast.success(t("saved"))
      onUpdated()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    try {
      const res = await fetch(apiBase, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setVerified(json.data?.bimiVerified ?? false)
      if (json.data?.bimiVerified) {
        toast.success(t("verified"))
      } else {
        toast.error(t("notVerified"))
      }
      onUpdated()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to verify")
    } finally {
      setVerifying(false)
    }
  }

  const isActive = domainStatus === "active"
  const bimiRecord = logoUrl.trim()
    ? `v=BIMI1; l=${logoUrl.trim()}${vmcUrl.trim() ? `; a=${vmcUrl.trim()}` : ""}`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={ImageAdd01Icon}
              strokeWidth={2}
              className="size-5"
            />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", { domain: domainName })}
          </DialogDescription>
        </DialogHeader>

        {!isActive ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-muted-foreground">
            {t("domainNotActive")}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="size-6 animate-spin text-muted-foreground"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Status badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t("status")}:</span>
              <Badge
                variant="outline"
                className={
                  verified
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                    : "border-muted-foreground/30"
                }
              >
                <HugeiconsIcon
                  icon={verified ? Tick02Icon : Cancel01Icon}
                  strokeWidth={2}
                />
                {verified ? t("statusVerified") : t("statusNotVerified")}
              </Badge>
            </div>

            {/* Logo URL */}
            <div className="flex flex-col gap-1.5">
              <Label>{t("logoUrl")}</Label>
              <Input
                value={logoUrl}
                onChange={(e) =>
                  setLogoUrl((e.target as HTMLInputElement).value)
                }
                placeholder="https://example.com/logo.svg"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                {t("logoUrlHint")}
              </p>
            </div>

            {/* CMC/VMC URL */}
            <div className="flex flex-col gap-1.5">
              <Label>
                {t("vmcUrl")}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({t("optional")})
                </span>
              </Label>
              <Input
                value={vmcUrl}
                onChange={(e) =>
                  setVmcUrl((e.target as HTMLInputElement).value)
                }
                placeholder="https://example.com/bimi.pem"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">{t("vmcUrlHint")}</p>
            </div>

            {/* Generated BIMI record preview */}
            {bimiRecord && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("dnsRecord")}</Label>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    TXT — default._bimi.{domainName}
                  </p>
                  <code className="text-xs break-all">{bimiRecord}</code>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("dnsRecordHint")}
                </p>
              </div>
            )}
          </div>
        )}

        {isActive && !loading && (
          <DialogFooter className="gap-2 sm:gap-0">
            {logoUrl.trim() && (
              <Button
                variant="outline"
                onClick={handleVerify}
                disabled={verifying || saving}
              >
                {verifying ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={Refresh01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("verify")}
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || verifying}>
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
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

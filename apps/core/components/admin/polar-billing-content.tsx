"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Copy01Icon,
  Tick02Icon,
  Alert02Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

type Mode = "sandbox" | "production"

interface PolarSettingsView {
  enabled: boolean
  activeMode: Mode
  sandboxAccessTokenPrefix: string | null
  sandboxWebhookSecretPrefix: string | null
  productionAccessTokenPrefix: string | null
  productionWebhookSecretPrefix: string | null
  vaultConfigured: boolean
}

type SecretKey =
  | "sandboxAccessToken"
  | "sandboxWebhookSecret"
  | "productionAccessToken"
  | "productionWebhookSecret"

/**
 * Write-only secret alanı — mevcut değer asla geri gelmez; yalnız prefix
 * gösterilir. Top-level component (render içinde tanımlanmaz) ki input
 * her keystroke'ta remount olup focus kaybetmesin.
 */
function SecretField({
  label,
  prefix,
  value,
  onChange,
  onClear,
  statusLabel,
  replaceHint,
  clearLabel,
}: {
  label: string
  prefix: string | null
  value: string
  onChange: (value: string) => void
  onClear: () => void
  statusLabel: string
  replaceHint: string
  clearLabel: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs text-muted-foreground">{statusLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          value={value}
          placeholder={prefix ? replaceHint : ""}
          onChange={(e) => onChange(e.target.value)}
        />
        {prefix && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {clearLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

export function PolarBillingContent() {
  const t = useTranslations("billing")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<Mode | null>(null)
  const [copied, setCopied] = useState(false)

  const [view, setView] = useState<PolarSettingsView | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [activeMode, setActiveMode] = useState<Mode>("sandbox")
  const [secrets, setSecrets] = useState<Record<SecretKey, string>>({
    sandboxAccessToken: "",
    sandboxWebhookSecret: "",
    productionAccessToken: "",
    productionWebhookSecret: "",
  })

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/polar`
      : "/api/webhooks/polar"

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/polar")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      const data = json.data as PolarSettingsView
      setView(data)
      setEnabled(data.enabled)
      setActiveMode(data.activeMode)
    } catch {
      toast.error(t("loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave() {
    setSaving(true)
    const payload: Record<string, unknown> = { enabled, activeMode }
    // Yalnız doldurulmuş secret'ları gönder (boş = değiştirme).
    for (const key of Object.keys(secrets) as SecretKey[]) {
      if (secrets[key].trim()) payload[key] = secrets[key].trim()
    }
    try {
      const res = await fetch("/api/admin/polar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setView(json.data as PolarSettingsView)
      setSecrets({
        sandboxAccessToken: "",
        sandboxWebhookSecret: "",
        productionAccessToken: "",
        productionWebhookSecret: "",
      })
      toast.success(t("saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  async function clearSecret(key: SecretKey) {
    try {
      const res = await fetch("/api/admin/polar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: "" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setView(json.data as PolarSettingsView)
      toast.success(t("saved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"))
    }
  }

  async function testConnection(mode: Mode) {
    setTesting(mode)
    try {
      const res = await fetch("/api/admin/polar/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast.success(t("testSuccess"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("testFailed"))
    } finally {
      setTesting(null)
    }
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function secretProps(field: SecretKey, label: string) {
    const prefixMap: Record<SecretKey, string | null> = {
      sandboxAccessToken: view?.sandboxAccessTokenPrefix ?? null,
      sandboxWebhookSecret: view?.sandboxWebhookSecretPrefix ?? null,
      productionAccessToken: view?.productionAccessTokenPrefix ?? null,
      productionWebhookSecret: view?.productionWebhookSecretPrefix ?? null,
    }
    const prefix = prefixMap[field]
    return {
      label,
      prefix,
      value: secrets[field],
      onChange: (v: string) => setSecrets((s) => ({ ...s, [field]: v })),
      onClear: () => clearSecret(field),
      statusLabel: prefix ? t("configuredPrefix", { prefix }) : t("notSet"),
      replaceHint: t("replaceHint"),
      clearLabel: t("clear"),
    }
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageTransition>
    )
  }

  return (
    <PageTransition className="flex w-full max-w-3xl flex-1 flex-col gap-6">
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>

      {view && !view.vaultConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <HugeiconsIcon
            icon={Alert02Icon}
            strokeWidth={2}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>{t("vaultWarning")}</span>
        </div>
      )}

      {/* Genel */}
      <Card>
        <CardHeader>
          <CardTitle>{t("generalTitle")}</CardTitle>
          <CardDescription>{t("generalHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <Label>{t("enabled")}</Label>
              <span className="text-xs text-muted-foreground">
                {t("enabledHint")}
              </span>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("activeMode")}</Label>
            <div className="inline-flex w-fit rounded-lg border p-0.5">
              {(["sandbox", "production"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setActiveMode(m)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    activeMode === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "sandbox" ? t("modeSandbox") : t("modeProduction")}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {t("activeModeHint")}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("webhookUrl")}</Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyWebhookUrl}
              >
                <HugeiconsIcon
                  icon={copied ? Tick02Icon : Copy01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              {t("webhookUrlHint")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sandbox */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("sandboxSection")}</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing !== null}
              onClick={() => testConnection("sandbox")}
            >
              {testing === "sandbox" && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("testConnection")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SecretField {...secretProps("sandboxAccessToken", t("accessToken"))} />
          <SecretField
            {...secretProps("sandboxWebhookSecret", t("webhookSecret"))}
          />
        </CardContent>
      </Card>

      {/* Production */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("productionSection")}</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing !== null}
              onClick={() => testConnection("production")}
            >
              {testing === "production" && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("testConnection")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SecretField
            {...secretProps("productionAccessToken", t("accessToken"))}
          />
          <SecretField
            {...secretProps("productionWebhookSecret", t("webhookSecret"))}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
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
      </div>
    </PageTransition>
  )
}

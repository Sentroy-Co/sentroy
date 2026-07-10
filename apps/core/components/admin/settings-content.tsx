"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { BytesInput } from "@workspace/ui/components/bytes-input"
import { Label } from "@workspace/ui/components/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

interface SystemSettings {
  /** Storage tek dosya upload üst sınırı (byte). Default 50MB. */
  maxUploadBytes: number
}

// NOT: Company limitleri buradan GELMEZ — yeni company default plan'ın
// limitleriyle açılır (admin → Plans → varsayılan plan). Eski "varsayılan
// limitler" kartı hiçbir akışta kullanılmıyordu, kaldırıldı.
const INITIAL_SETTINGS: SystemSettings = {
  maxUploadBytes: 52428800,
}

export function SettingsContent() {
  const t = useTranslations("admin")
  const tc = useTranslations("common")

  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/settings")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load settings")
      setSettings({ ...INITIAL_SETTINGS, ...json.data })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load settings"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to save settings")
      setSettings({ ...INITIAL_SETTINGS, ...json.data })
      toast.success(t("settingsSaved"))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save settings"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageTransition>
    )
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("systemSettings")}</h1>

      {/* ── Storage upload — admin-configurable single-file limit ───── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("storageSettingsTitle")}</CardTitle>
          <CardDescription>
            {t("storageSettingsDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("maxUploadBytes")}</Label>
              <BytesInput
                value={settings.maxUploadBytes}
                onChange={(bytes) =>
                  setSettings((s) => ({ ...s, maxUploadBytes: bytes }))
                }
                disabled={loading || saving}
              />
              <p className="text-xs text-muted-foreground">
                {t("maxUploadBytesHint")}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => handleSave()}
              disabled={loading || saving}
              size="sm"
            >
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
        </CardContent>
      </Card>

      {/* ── Auth limits — read-only info card ───────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("authLimitsTitle")}</CardTitle>
          <CardDescription>{t("authLimitsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <AuthLimitRow
              label={t("authMagicLink")}
              window="60s"
              max={5}
              extra={t("authExpires", { value: "5m" })}
            />
            <AuthLimitRow
              label={t("authEmailOtp")}
              window="60s"
              max={3}
              extra={t("authExpires", { value: "5m" })}
            />
            <AuthLimitRow
              label={t("authResetPassword")}
              window="60s"
              max={3}
              extra={t("authExpires", { value: "1h" })}
            />
            <AuthLimitRow
              label={t("authVerifyEmail")}
              window="60s"
              max={3}
              extra={t("authExpires", { value: "1h" })}
            />
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            {t("authLimitsNote")}
          </p>
        </CardContent>
      </Card>
    </PageTransition>
  )
}

function AuthLimitRow({
  label,
  window,
  max,
  extra,
}: {
  label: string
  window: string
  max: number
  extra?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {extra && (
          <span className="text-[10px] text-muted-foreground">{extra}</span>
        )}
      </div>
      <span className="font-mono text-xs tabular-nums">
        {max}/{window}
      </span>
    </div>
  )
}

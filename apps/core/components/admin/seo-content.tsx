"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

import {
  LocalizedField,
  PageTransition,
  type LocalizedValue,
} from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

interface SeoSettingsState {
  gaId: string | null
  gtmId: string | null
  metaPixelId: string | null
  plausibleDomain: string | null
  hotjarId: string | null
  twitterHandle: string | null
  defaultOgImageUrl: string | null
  defaultDescription: Record<string, string>
  defaultOgTitle: Record<string, string>
  defaultKeywords: Record<string, string[]>
  robotsOverride: string | null
  googleSiteVerification: string | null
  bingSiteVerification: string | null
  updatedAt?: string | Date
}

const INITIAL_STATE: SeoSettingsState = {
  gaId: null,
  gtmId: null,
  metaPixelId: null,
  plausibleDomain: null,
  hotjarId: null,
  twitterHandle: "sentroy",
  defaultOgImageUrl: null,
  defaultDescription: { en: "", tr: "" },
  defaultOgTitle: { en: "", tr: "" },
  defaultKeywords: { en: [], tr: [] },
  robotsOverride: null,
  googleSiteVerification: null,
  bingSiteVerification: null,
}

function normalize(json: unknown): SeoSettingsState {
  const data = (json ?? {}) as Partial<SeoSettingsState>
  return {
    ...INITIAL_STATE,
    ...data,
    defaultDescription: {
      ...INITIAL_STATE.defaultDescription,
      ...(data.defaultDescription ?? {}),
    },
    defaultOgTitle: {
      ...INITIAL_STATE.defaultOgTitle,
      ...(data.defaultOgTitle ?? {}),
    },
    defaultKeywords: {
      ...INITIAL_STATE.defaultKeywords,
      ...(data.defaultKeywords ?? {}),
    },
  }
}

export function SeoContent() {
  const t = useTranslations("admin")
  const tc = useTranslations("common")

  const [settings, setSettings] = useState<SeoSettingsState>(INITIAL_STATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/seo")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load SEO settings")
      setSettings(normalize(json.data))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load SEO settings"
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
      const res = await fetch("/api/admin/seo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to save SEO settings")
      setSettings(normalize(json.data))
      toast.success(t("settingsSaved"))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save SEO settings"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  function setField<K extends keyof SeoSettingsState>(key: K, value: SeoSettingsState[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  // LocalizedField bekleyen shape — keywords string[] olduğu için her dil
  // için virgülle birleştirilip string'e dökülür; onChange'de yeniden parse.
  type LocalizedMetaKey = "ogTitle" | "description" | "keywords"
  const localizedMeta = useMemo<Record<LocalizedMetaKey, LocalizedValue>>(
    () => ({
      ogTitle: settings.defaultOgTitle,
      description: settings.defaultDescription,
      keywords: Object.fromEntries(
        Object.entries(settings.defaultKeywords).map(([lang, list]) => [
          lang,
          list.join(", "),
        ]),
      ),
    }),
    [
      settings.defaultOgTitle,
      settings.defaultDescription,
      settings.defaultKeywords,
    ],
  )

  function handleLocalizedMetaChange(
    next: Record<LocalizedMetaKey, LocalizedValue>,
  ) {
    setSettings((prev) => ({
      ...prev,
      defaultOgTitle: next.ogTitle,
      defaultDescription: next.description,
      defaultKeywords: Object.fromEntries(
        Object.entries(next.keywords).map(([lang, raw]) => [
          lang,
          raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        ]),
      ),
    }))
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </PageTransition>
    )
  }

  const updatedAt = settings.updatedAt ? new Date(settings.updatedAt) : null
  const updatedAtLabel =
    updatedAt && !Number.isNaN(updatedAt.getTime()) && updatedAt.getTime() > 0
      ? updatedAt.toLocaleString()
      : null

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("seoTitle")}</h1>
        {updatedAtLabel && (
          <span className="text-xs text-muted-foreground">
            {t("seoLastUpdated", { date: updatedAtLabel })}
          </span>
        )}
      </div>

      {/* ── Analytics & tracking ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("seoAnalyticsTitle")}</CardTitle>
          <CardDescription>{t("seoAnalyticsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>{t("seoGaId")}</Label>
              <Input
                value={settings.gaId ?? ""}
                placeholder="G-XXXXXXXXXX"
                onChange={(e) => setField("gaId", e.target.value || null)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("seoGtmId")}</Label>
              <Input
                value={settings.gtmId ?? ""}
                placeholder="GTM-XXXXXXX"
                onChange={(e) => setField("gtmId", e.target.value || null)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("seoMetaPixelId")}</Label>
              <Input
                value={settings.metaPixelId ?? ""}
                placeholder="123456789012345"
                onChange={(e) => setField("metaPixelId", e.target.value || null)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("seoPlausibleDomain")}</Label>
              <Input
                value={settings.plausibleDomain ?? ""}
                placeholder="sentroy.com"
                onChange={(e) => setField("plausibleDomain", e.target.value || null)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("seoHotjarId")}</Label>
              <Input
                value={settings.hotjarId ?? ""}
                placeholder="1234567"
                onChange={(e) => setField("hotjarId", e.target.value || null)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Site verification ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("seoVerificationTitle")}</CardTitle>
          <CardDescription>{t("seoVerificationDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>{t("seoGoogleSiteVerification")}</Label>
              <Input
                value={settings.googleSiteVerification ?? ""}
                placeholder="abc123…"
                onChange={(e) =>
                  setField("googleSiteVerification", e.target.value || null)
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("seoBingSiteVerification")}</Label>
              <Input
                value={settings.bingSiteVerification ?? ""}
                placeholder="def456…"
                onChange={(e) =>
                  setField("bingSiteVerification", e.target.value || null)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Default meta per locale ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("seoDefaultMetaTitle")}</CardTitle>
          <CardDescription>{t("seoDefaultMetaDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LocalizedField
            value={localizedMeta}
            onChange={handleLocalizedMetaChange}
            fields={[
              {
                name: "ogTitle",
                label: t("seoDefaultOgTitle"),
              },
              {
                name: "description",
                label: t("seoDefaultDescription"),
                multiline: true,
                rows: 3,
              },
              {
                name: "keywords",
                label: t("seoDefaultKeywords"),
                placeholder: "all-in-one backend, transactional email",
              },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("seoDefaultKeywordsHint")}
          </p>
        </CardContent>
      </Card>

      {/* ── Social ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("seoSocialTitle")}</CardTitle>
          <CardDescription>{t("seoSocialDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>{t("seoTwitterHandle")}</Label>
              <Input
                value={settings.twitterHandle ?? ""}
                placeholder="sentroy"
                onChange={(e) => setField("twitterHandle", e.target.value || null)}
              />
              <p className="text-xs text-muted-foreground">
                {t("seoTwitterHandleHint")}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("seoDefaultOgImageUrl")}</Label>
              <Input
                value={settings.defaultOgImageUrl ?? ""}
                placeholder="https://cdn.sentroy.com/og/default.png"
                onChange={(e) =>
                  setField("defaultOgImageUrl", e.target.value || null)
                }
              />
              {settings.defaultOgImageUrl && (
                <div className="mt-2 overflow-hidden rounded-md border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.defaultOgImageUrl}
                    alt="OG preview"
                    className="aspect-[1200/630] w-full max-w-md object-cover"
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).style.display = "none"
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Robots override (advanced) ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("seoRobotsTitle")}</CardTitle>
          <CardDescription>{t("seoRobotsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={8}
            placeholder={"User-agent: *\nAllow: /"}
            className="font-mono text-xs"
            value={settings.robotsOverride ?? ""}
            onChange={(e) => setField("robotsOverride", e.target.value || null)}
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
          {tc("save")}
        </Button>
      </div>
    </PageTransition>
  )
}

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  KeyIcon,
  PasswordValidationIcon,
  Message01Icon,
  UserAdd01Icon,
  CircleArrowReload02Icon,
  Loading03Icon,
  Tick02Icon,
  PaintBrushIcon,
  ArrowRightDoubleIcon,
  Layers01Icon,
  AlertCircleIcon,
  Add01Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { CodeEditor } from "@workspace/ui/components/code-editor"
import { SystemMailAiPanel } from "@/components/admin/system-mail-ai-panel"
import {
  TemplateGalleryGrid,
  TemplateGalleryBadge,
} from "@workspace/console/components/templates/template-gallery-grid"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import { SystemMailTabs } from "@/components/admin/system-mail-tabs"

interface EventVariable {
  name: string
  description: string
  sample: string
  escape?: boolean
}

interface EventOverride {
  subject: Record<string, string>
  htmlBody: Record<string, string>
  enabled: boolean
  updatedAt: string
  updatedBy: string | null
}

interface EventRow {
  key: string
  // SystemMailEventCategory ile aynı olmalı (packages/auth system-mail-events.ts).
  category: "auth" | "verification" | "otp" | "invitation" | "notification"
  label: string
  description: string
  variables: EventVariable[]
  defaultSubject: Record<string, string>
  defaultHtmlBody: Record<string, string>
  override: EventOverride | null
  customized: boolean
}

const SUPPORTED_LOCALES: { code: string; flag: string; label: string }[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "tr", flag: "🇹🇷", label: "Türkçe" },
]

const CATEGORY_META: Record<
  EventRow["category"],
  { icon: typeof Mail01Icon; tint: string }
> = {
  auth: { icon: KeyIcon, tint: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  verification: {
    icon: PasswordValidationIcon,
    tint: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  otp: { icon: Message01Icon, tint: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  invitation: {
    icon: UserAdd01Icon,
    tint: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  },
  notification: {
    icon: Mail01Icon,
    tint: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
}

interface PreviewState {
  subject: string
  html: string
  text: string
  loading: boolean
}

export function SystemMailEventsContent() {
  const t = useTranslations("systemMail")
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [locale, setLocale] = useState<string>("en")

  // Draft state — keyed by event key + locale; lets the editor preserve
  // unsaved edits when toggling between locales/events.
  const [drafts, setDrafts] = useState<
    Record<string, { subject: Record<string, string>; htmlBody: Record<string, string>; enabled: boolean }>
  >({})

  const [saving, setSaving] = useState(false)
  const [resetTarget, setResetTarget] = useState<EventRow | null>(null)
  const [resetting, setResetting] = useState(false)

  const [preview, setPreview] = useState<PreviewState>({
    subject: "",
    html: "",
    text: "",
    loading: false,
  })

  const subjectRef = useRef<HTMLInputElement | null>(null)
  /**
   * CodeEditor (react-simple-code-editor) textarea'ya ref expose etmediği
   * için body için DOM cursor manipülasyonu yapamıyoruz; variable insert
   * append-to-end olarak çalışır. Subject hâlâ native input olduğu için
   * cursor'da insert ediyor.
   */

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/system-mail/events")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      const rows = (json.data ?? []) as EventRow[]
      setEvents(rows)
      // Hydrate drafts from server state — overrides win, otherwise
      // we seed with the registry default so the editor has copy to
      // show even before the admin types anything.
      const next: typeof drafts = {}
      for (const e of rows) {
        next[e.key] = {
          subject: { ...e.defaultSubject, ...(e.override?.subject ?? {}) },
          htmlBody: { ...e.defaultHtmlBody, ...(e.override?.htmlBody ?? {}) },
          enabled: e.override?.enabled !== false,
        }
      }
      setDrafts(next)
      setActiveKey((cur) => cur ?? rows[0]?.key ?? null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("eventsLoadFailed"))
    } finally {
      setLoading(false)
    }
    // t is stable from next-intl; ignore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const activeEvent = useMemo(
    () => events.find((e) => e.key === activeKey) ?? null,
    [events, activeKey],
  )
  const activeDraft = activeKey ? drafts[activeKey] : undefined

  // ── Preview --------------------------------------------------------

  const renderPreview = useCallback(
    async (
      key: string,
      lang: string,
      draft: { subject: Record<string, string>; htmlBody: Record<string, string> },
    ) => {
      setPreview((p) => ({ ...p, loading: true }))
      try {
        const res = await fetch(
          `/api/admin/system-mail/events/${encodeURIComponent(key)}/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locale: lang,
              subject: draft.subject,
              htmlBody: draft.htmlBody,
            }),
          },
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Preview failed")
        setPreview({
          subject: json.data.subject ?? "",
          html: json.data.html ?? "",
          text: json.data.text ?? "",
          loading: false,
        })
      } catch (err) {
        setPreview({ subject: "", html: "", text: "", loading: false })
        toast.error(err instanceof Error ? err.message : t("previewFailed"))
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  )

  // Re-render preview whenever the draft for the active event/locale
  // settles. Debounce keeps typing smooth on slow networks.
  useEffect(() => {
    if (!activeKey || !activeDraft) return
    const handle = window.setTimeout(() => {
      void renderPreview(activeKey, locale, {
        subject: activeDraft.subject,
        htmlBody: activeDraft.htmlBody,
      })
    }, 350)
    return () => window.clearTimeout(handle)
  }, [activeKey, activeDraft, locale, renderPreview])

  // ── Editor mutators ---------------------------------------------

  function updateActiveDraft(
    patch: Partial<{ subject: string; htmlBody: string; enabled: boolean }>,
  ) {
    if (!activeKey) return
    setDrafts((prev) => {
      const cur = prev[activeKey]
      if (!cur) return prev
      const next = {
        subject: { ...cur.subject },
        htmlBody: { ...cur.htmlBody },
        enabled: cur.enabled,
      }
      if (patch.subject !== undefined) next.subject[locale] = patch.subject
      if (patch.htmlBody !== undefined) next.htmlBody[locale] = patch.htmlBody
      if (patch.enabled !== undefined) next.enabled = patch.enabled
      return { ...prev, [activeKey]: next }
    })
  }

  function insertVariable(name: string, target: "subject" | "body") {
    if (!activeDraft) return
    const insert = `{${name}}`
    if (target === "subject") {
      const el = subjectRef.current
      const cur = activeDraft.subject[locale] ?? ""
      if (el) {
        const start = el.selectionStart ?? cur.length
        const end = el.selectionEnd ?? cur.length
        const next = cur.slice(0, start) + insert + cur.slice(end)
        updateActiveDraft({ subject: next })
        requestAnimationFrame(() => {
          el.focus()
          const pos = start + insert.length
          el.setSelectionRange(pos, pos)
        })
      } else {
        updateActiveDraft({ subject: cur + insert })
      }
    } else {
      const cur = activeDraft.htmlBody[locale] ?? ""
      // CodeEditor cursor position'a insert için ref expose etmiyor —
      // body için sona ekleme. Kullanıcı isterse manuel taşıyabilir.
      updateActiveDraft({ htmlBody: cur + insert })
    }
  }

  /**
   * Template gallery'den seçim → activeDraft'a uygula. Kullanıcı'nın
   * `name`/`subject`/`body` alanları LocalizedString olabilir; mevcut
   * locale için resolve, yoksa fallback ile ilk string.
   */
  function applyTemplate(template: PickedTemplate) {
    if (!activeKey || !activeDraft) return
    const resolveLoc = (v: unknown): string => {
      if (typeof v === "string") return v
      if (v && typeof v === "object") {
        const obj = v as Record<string, string>
        if (typeof obj[locale] === "string") return obj[locale]
        for (const val of Object.values(obj)) {
          if (typeof val === "string" && val.trim()) return val
        }
      }
      return ""
    }
    const subject = resolveLoc(template.subject)
    const body = resolveLoc(template.htmlBody)
    setDrafts((prev) => {
      const cur = prev[activeKey] ?? activeDraft
      return {
        ...prev,
        [activeKey]: {
          subject: { ...cur.subject, [locale]: subject || cur.subject[locale] || "" },
          htmlBody: { ...cur.htmlBody, [locale]: body || cur.htmlBody[locale] || "" },
          enabled: cur.enabled,
        },
      }
    })
    toast.success(t("templateApplied"))
  }

  // ── Save / Reset -------------------------------------------------

  async function saveActive() {
    if (!activeEvent || !activeDraft) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/admin/system-mail/events/${encodeURIComponent(activeEvent.key)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: activeDraft.subject,
            htmlBody: activeDraft.htmlBody,
            enabled: activeDraft.enabled,
          }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Save failed")

      toast.success(t("savedEvent"))
      // Reflect new override state in the list (for the customized badge)
      setEvents((prev) =>
        prev.map((e) =>
          e.key === activeEvent.key
            ? {
                ...e,
                customized: true,
                override: {
                  subject: json.data.override.subject,
                  htmlBody: json.data.override.htmlBody,
                  enabled: json.data.override.enabled,
                  updatedAt: json.data.override.updatedAt,
                  updatedBy: json.data.override.updatedBy,
                },
              }
            : e,
        ),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  async function confirmReset() {
    if (!resetTarget) return
    setResetting(true)
    try {
      const res = await fetch(
        `/api/admin/system-mail/events/${encodeURIComponent(resetTarget.key)}`,
        { method: "DELETE" },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Reset failed")

      // Revert draft + list state to defaults.
      setDrafts((prev) => ({
        ...prev,
        [resetTarget.key]: {
          subject: { ...resetTarget.defaultSubject },
          htmlBody: { ...resetTarget.defaultHtmlBody },
          enabled: true,
        },
      }))
      setEvents((prev) =>
        prev.map((e) =>
          e.key === resetTarget.key
            ? { ...e, customized: false, override: null }
            : e,
        ),
      )
      toast.success(t("resetSuccess"))
      setResetTarget(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("resetFailed"))
    } finally {
      setResetting(false)
    }
  }

  // ── Loading state ------------------------------------------------

  if (loading) {
    return (
      <PageTransition className="flex flex-col gap-6">
        <SystemMailTabs />
        <div className="flex flex-col gap-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-[36rem] w-full rounded-xl" />
        </div>
      </PageTransition>
    )
  }

  // ── Group events by category for the sidebar list ---------------

  // Defansif: kategori tipi ileride genişlerse (yeni event kategorisi) undefined
  // grup .push'u sayfayı crash etmesin — bilinmeyen kategori kendi grubuna düşer.
  const groups: Record<string, EventRow[] | undefined> = {}
  for (const e of events) (groups[e.category] ??= []).push(e)

  return (
    <PageTransition className="flex flex-col gap-6">
      <SystemMailTabs />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("eventsTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("eventsDesc")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* ── Event list ─────────────────────────────────────────── */}
        <Card className="self-start lg:sticky lg:top-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t("eventsListTitle")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t("eventsListDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-3">
            {(["auth", "verification", "otp", "invitation", "notification"] as const).map(
              (cat) =>
                (groups[cat]?.length ?? 0) === 0 ? null : (
                  <div key={cat} className="flex flex-col gap-1.5">
                    <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t(`category.${cat}`)}
                    </div>
                    <div className="flex flex-col gap-1">
                      {(groups[cat] ?? []).map((event) => (
                        <EventListRow
                          key={event.key}
                          event={event}
                          active={event.key === activeKey}
                          onSelect={() => setActiveKey(event.key)}
                        />
                      ))}
                    </div>
                  </div>
                ),
            )}
          </CardContent>
        </Card>

        {/* ── Editor + preview ───────────────────────────────────── */}
        {activeEvent && activeDraft ? (
          <Card>
            <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  {activeEvent.label}
                  {activeEvent.customized && (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <HugeiconsIcon
                        icon={PaintBrushIcon}
                        strokeWidth={2}
                        className="size-3"
                      />
                      {t("customized")}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {activeEvent.description}
                </CardDescription>
                <code className="mt-1 inline-flex w-fit items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {activeEvent.key}
                </code>
              </div>

              <div className="flex flex-col items-end gap-2">
                <LocalePicker locale={locale} onChange={setLocale} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={activeDraft.enabled}
                    onCheckedChange={(checked) =>
                      updateActiveDraft({ enabled: checked === true })
                    }
                  />
                  {activeDraft.enabled ? t("enabled") : t("disabled")}
                </label>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-5 p-4 sm:p-6">
              {/* Subject */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium">{t("subjectLabel")}</Label>
                <Input
                  ref={subjectRef}
                  value={activeDraft.subject[locale] ?? ""}
                  onChange={(e) =>
                    updateActiveDraft({
                      subject: (e.target as HTMLInputElement).value,
                    })
                  }
                  placeholder={
                    activeEvent.defaultSubject[locale] ??
                    activeEvent.defaultSubject.en ??
                    ""
                  }
                />
                <VariableChips
                  variables={activeEvent.variables}
                  onPick={(name) => insertVariable(name, "subject")}
                  hint={t("clickToInsert")}
                />
              </div>

              {/* HTML body — Prism syntax-highlighted CodeEditor + AI panel */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium">{t("bodyLabel")}</Label>
                  <TemplatePicker
                    onPick={applyTemplate}
                    t={t}
                  />
                </div>
                <SystemMailAiPanel
                  bodyHtml={activeDraft.htmlBody[locale] ?? ""}
                  subject={activeDraft.subject[locale] ?? ""}
                  outputLang={locale}
                  onApply={(nextHtml) =>
                    updateActiveDraft({ htmlBody: nextHtml })
                  }
                />
                <CodeEditor
                  value={activeDraft.htmlBody[locale] ?? ""}
                  onChange={(value) => updateActiveDraft({ htmlBody: value })}
                  language="markup"
                  placeholder={
                    activeEvent.defaultHtmlBody[locale] ??
                    activeEvent.defaultHtmlBody.en ??
                    ""
                  }
                  minHeight={320}
                  maxHeight={480}
                />
                <VariableChips
                  variables={activeEvent.variables}
                  onPick={(name) => insertVariable(name, "body")}
                  hint={t("clickToInsert")}
                />
                <VariableDiffBanner
                  eventVariables={activeEvent.variables}
                  bodyHtml={activeDraft.htmlBody[locale] ?? ""}
                  subject={activeDraft.subject[locale] ?? ""}
                  t={t}
                />
              </div>

              {/* Preview */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">
                    {t("previewLabel")}
                  </Label>
                  {preview.loading && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="size-3 animate-spin"
                      />
                      {t("previewRendering")}
                    </span>
                  )}
                </div>
                <div className="overflow-hidden rounded-lg border bg-muted/30">
                  <div className="border-b bg-card px-4 py-2">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {t("subjectLabel")}
                    </div>
                    <div className="truncate text-sm font-medium">
                      {preview.subject || (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </div>
                  </div>
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={`<!doctype html><html><body style="margin:0;background:#fff">${preview.html}</body></html>`}
                    className="block h-[480px] w-full bg-white"
                  />
                </div>
              </div>
            </CardContent>

            <div className="flex flex-col items-stretch gap-2 border-t bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {activeEvent.override?.updatedAt
                  ? t("lastUpdated", {
                      date: new Date(
                        activeEvent.override.updatedAt,
                      ).toLocaleString(),
                    })
                  : t("usingDefaults")}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResetTarget(activeEvent)}
                  disabled={!activeEvent.customized || saving}
                  className="gap-1.5"
                >
                  <HugeiconsIcon
                    icon={CircleArrowReload02Icon}
                    strokeWidth={2}
                    className="size-3.5"
                  />
                  {t("resetToDefault")}
                </Button>
                <Button onClick={saveActive} disabled={saving} className="gap-1.5">
                  {saving ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="size-3.5 animate-spin"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="size-3.5"
                    />
                  )}
                  {t("save")}
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="grid place-items-center p-12 text-center">
            <div className="flex max-w-sm flex-col items-center gap-2">
              <HugeiconsIcon
                icon={ArrowRightDoubleIcon}
                strokeWidth={2}
                className="size-6 text-muted-foreground"
              />
              <p className="text-sm font-medium">{t("emptyEditorTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t("emptyEditorDesc")}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* ── Reset confirmation dialog ──────────────────────────── */}
      <Dialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => (resetting ? null : !open && setResetTarget(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("resetDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("resetDialogDesc", { event: resetTarget?.label ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetTarget(null)}
              disabled={resetting}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReset}
              disabled={resetting}
              className="gap-1.5"
            >
              {resetting && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="size-3.5 animate-spin"
                />
              )}
              {t("resetToDefault")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

// ─── Subcomponents ─────────────────────────────────────────────────

function EventListRow({
  event,
  active,
  onSelect,
}: {
  event: EventRow
  active: boolean
  onSelect: () => void
}) {
  const meta = CATEGORY_META[event.category]
  return (
    <button
      type="button"
      onClick={onSelect}
      data-active={active}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-start transition-colors",
        active
          ? "border-border bg-card shadow-sm"
          : "border-transparent hover:bg-muted/60",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          meta.tint,
        )}
      >
        <HugeiconsIcon icon={meta.icon} strokeWidth={2} className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-sm font-medium leading-tight",
            !active && "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {event.label}
        </span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {event.key}
        </span>
      </span>
      {event.customized && (
        <span
          className="mt-0.5 size-2 shrink-0 rounded-full bg-emerald-500"
          aria-label="Customized"
        />
      )}
    </button>
  )
}

function LocalePicker({
  locale,
  onChange,
}: {
  locale: string
  onChange: (locale: string) => void
}) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
    >
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="tab"
          aria-selected={locale === l.code}
          onClick={() => onChange(l.code)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
            locale === l.code
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span aria-hidden>{l.flag}</span>
          <span>{l.code.toUpperCase()}</span>
        </button>
      ))}
    </div>
  )
}

function VariableChips({
  variables,
  onPick,
  hint,
}: {
  variables: EventVariable[]
  onPick: (name: string) => void
  hint: string
}) {
  if (variables.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {hint}
      </span>
      {variables.map((v) => (
        <button
          key={v.name}
          type="button"
          onClick={() => onPick(v.name)}
          title={v.description}
          className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          {`{${v.name}}`}
        </button>
      ))}
    </div>
  )
}

// ── Template gallery picker ─────────────────────────────────────────────

interface PickedTemplate {
  id: string
  key: string
  collectionId: string | null
  name: unknown
  description: unknown
  subject: unknown
  htmlBody: unknown
  variables: string[]
  thumbnailUrl: string | null
  category: string
  isPublic: boolean
  updatedAt: string | Date
}

interface PickedCollection {
  id: string
  key: string
  name: unknown
  coverUrl: string | null
}

const TEMPLATE_CATEGORY_VALUES = [
  "otp",
  "verification",
  "password-reset",
  "welcome",
  "newsletter",
  "transactional",
  "billing",
  "marketing",
  "notification",
  "other",
] as const
type TemplateCategoryValue = (typeof TEMPLATE_CATEGORY_VALUES)[number]

function TemplatePicker({
  onPick,
  t,
}: {
  onPick: (template: PickedTemplate) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PickedTemplate[]>([])
  const [collections, setCollections] = useState<PickedCollection[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  /** "all" | category değeri */
  const [categoryFilter, setCategoryFilter] = useState<"all" | TemplateCategoryValue>("all")
  /** "all" | "standalone" | collectionId */
  const [collectionFilter, setCollectionFilter] = useState<string>("all")

  useEffect(() => {
    if (!open) return
    let aborted = false
    setLoading(true)
    setError(null)
    fetch("/api/admin/system-mail/templates")
      .then((r) => r.json().then((j) => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (aborted) return
        if (!ok) {
          setError(json?.error || t("templatePickerLoadFailed"))
          setItems([])
          setCollections([])
        } else {
          // Yeni response shape'i: { items, collections }. Geriye dönük
          // uyumluluk için array da kabul edilir.
          const raw = json.data
          if (Array.isArray(raw)) {
            setItems(raw)
            setCollections([])
          } else if (raw && typeof raw === "object") {
            setItems(Array.isArray(raw.items) ? raw.items : [])
            setCollections(
              Array.isArray(raw.collections) ? raw.collections : [],
            )
          }
        }
      })
      .catch((err) => {
        if (aborted) return
        setError(err instanceof Error ? err.message : t("templatePickerLoadFailed"))
      })
      .finally(() => {
        if (!aborted) setLoading(false)
      })
    return () => {
      aborted = true
    }
  }, [open, t])

  /**
   * Sıralı filter pipeline:
   *   1. Search (free-text)
   *   2. Category (exact match)
   *   3. Collection ('all' / 'standalone' / id)
   * Sıra önemli değil — hepsi independent predicate.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (categoryFilter !== "all" && it.category !== categoryFilter) {
        return false
      }
      if (collectionFilter === "standalone" && it.collectionId !== null) {
        return false
      }
      if (
        collectionFilter !== "all" &&
        collectionFilter !== "standalone" &&
        it.collectionId !== collectionFilter
      ) {
        return false
      }
      if (!q) return true
      const name = pickFirstStringValue(it.name).toLowerCase()
      const subject = pickFirstStringValue(it.subject).toLowerCase()
      const desc = pickFirstStringValue(it.description).toLowerCase()
      return (
        name.includes(q) ||
        subject.includes(q) ||
        desc.includes(q) ||
        it.key.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
      )
    })
  }, [items, query, categoryFilter, collectionFilter])

  const collectionById = useMemo(
    () => new Map(collections.map((c) => [c.id, c])),
    [collections],
  )

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 gap-1 text-xs"
      >
        <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} className="size-3.5" />
        {t("pickTemplateCta")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto flex max-h-[88vh] w-full flex-col rounded-t-xl p-0 sm:max-w-6xl"
        >
          <SheetHeader className="px-6 pt-6 pb-3">
            <SheetTitle>{t("templatePickerTitle")}</SheetTitle>
            <SheetDescription>{t("templatePickerDesc")}</SheetDescription>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder={t("templatePickerSearchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                className="flex-1"
              />
              <Select
                value={categoryFilter}
                onValueChange={(v) =>
                  v && setCategoryFilter(v as "all" | TemplateCategoryValue)
                }
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <span className="truncate">
                    {categoryFilter === "all"
                      ? t("templatePickerAllCategories")
                      : t(`templatePickerCategories.${categoryFilter}`)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("templatePickerAllCategories")}
                  </SelectItem>
                  {TEMPLATE_CATEGORY_VALUES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`templatePickerCategories.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {collections.length > 0 && (
                <Select
                  value={collectionFilter}
                  onValueChange={(v) => v && setCollectionFilter(v)}
                >
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <span className="truncate">
                      {collectionFilter === "all"
                        ? t("templatePickerAllCollections")
                        : collectionFilter === "standalone"
                          ? t("templatePickerStandalone")
                          : pickFirstStringValue(
                              collectionById.get(collectionFilter)?.name,
                            ) ||
                            collectionById.get(collectionFilter)?.key ||
                            collectionFilter}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t("templatePickerAllCollections")}
                    </SelectItem>
                    <SelectItem value="standalone">
                      {t("templatePickerStandalone")}
                    </SelectItem>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {pickFirstStringValue(c.name) || c.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(categoryFilter !== "all" || collectionFilter !== "all") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCategoryFilter("all")
                    setCollectionFilter("all")
                  }}
                >
                  {t("templatePickerClearFilters")}
                </Button>
              )}
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto border-t bg-muted/20 p-4 sm:p-6">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 w-full rounded-xl" />
                ))}
              </div>
            ) : error ? (
              <div className="flex items-center justify-center p-6 text-sm text-destructive">
                {error}
              </div>
            ) : (
              <TemplateGalleryGrid
                emptyLabel={t("templatePickerEmpty")}
                items={filtered.map((tpl) => {
                  const tplCollection = tpl.collectionId
                    ? collectionById.get(tpl.collectionId)
                    : null
                  return {
                    id: tpl.id,
                    name:
                      pickFirstStringValue(tpl.name) ||
                      `(${tpl.key.slice(0, 16)}…)`,
                    subject: pickFirstStringValue(tpl.subject),
                    thumbnailUrl: tpl.thumbnailUrl ?? undefined,
                    badges: [
                      // Tıklanabilir collection chip — kart click'ini durdurup
                      // collectionFilter'a yazar. Mail library'deki davranış
                      // ile aynı UX.
                      ...(tplCollection
                        ? [
                            <button
                              key="collection"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setCollectionFilter(tplCollection.id)
                              }}
                              title={t("templatePickerFilterByCollection")}
                              className="inline-flex cursor-pointer items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
                            >
                              {pickFirstStringValue(tplCollection.name) ||
                                tplCollection.key}
                            </button>,
                          ]
                        : []),
                      <TemplateGalleryBadge key="cat">
                        {tpl.category}
                      </TemplateGalleryBadge>,
                      ...(tpl.variables.length > 0
                        ? [
                            <TemplateGalleryBadge key="vars">
                              {t("templatePickerVarsCount", {
                                count: tpl.variables.length,
                              })}
                            </TemplateGalleryBadge>,
                          ]
                        : []),
                    ],
                  }
                })}
                onSelect={(id) => {
                  const tpl = filtered.find((x) => x.id === id)
                  if (tpl) {
                    onPick(tpl)
                    setOpen(false)
                  }
                }}
              />
            )}
          </div>
          <SheetFooter className="border-t bg-background px-6 py-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

function pickFirstStringValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) return v
    }
  }
  return ""
}

// ── Variable diff banner ────────────────────────────────────────────────

/**
 * `{varName}` ve `{{varName}}` placeholder'larını çeker. Mustache section
 * tag'leri (`{#name}` `{/name}`) yine `name` olarak yakalanır — sistem
 * göndermiyorsa kullanıcı'nın çözmesi gereken bir şey yine de bunlar.
 */
function extractTemplateVariables(...sources: string[]): Set<string> {
  const found = new Set<string>()
  const regex = /\{\{?\s*[#/]?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}?\}/g
  for (const src of sources) {
    if (!src) continue
    let m: RegExpExecArray | null
    while ((m = regex.exec(src)) !== null) {
      if (m[1]) found.add(m[1])
    }
  }
  return found
}

function VariableDiffBanner({
  eventVariables,
  bodyHtml,
  subject,
  t,
}: {
  eventVariables: EventVariable[]
  bodyHtml: string
  subject: string
  t: ReturnType<typeof useTranslations>
}) {
  const expected = useMemo(
    () => new Set(eventVariables.map((v) => v.name)),
    [eventVariables],
  )
  const used = useMemo(
    () => extractTemplateVariables(bodyHtml, subject),
    [bodyHtml, subject],
  )
  const missing = useMemo(
    () => Array.from(expected).filter((v) => !used.has(v)),
    [expected, used],
  )
  const extra = useMemo(
    () => Array.from(used).filter((v) => !expected.has(v)),
    [expected, used],
  )

  if (missing.length === 0 && extra.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
        <HugeiconsIcon
          icon={AlertCircleIcon}
          strokeWidth={2}
          className="size-3.5"
        />
        {t("variableDiffTitle")}
      </div>
      {missing.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("variableDiffMissing", { count: missing.length })}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {missing.map((name) => (
              <code
                key={name}
                className="rounded border border-amber-500/30 bg-background px-1.5 py-0.5 font-mono text-[11px]"
                title={
                  eventVariables.find((v) => v.name === name)?.description ||
                  ""
                }
              >
                {`{${name}}`}
              </code>
            ))}
          </div>
        </div>
      )}
      {extra.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("variableDiffExtra", { count: extra.length })}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {extra.map((name) => (
              <code
                key={name}
                className="rounded border border-rose-500/30 bg-rose-500/5 px-1.5 py-0.5 font-mono text-[11px] text-rose-700 dark:text-rose-300"
              >
                {`{${name}}`}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

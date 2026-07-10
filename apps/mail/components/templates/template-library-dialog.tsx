"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  File01Icon,
  ArrowLeft01Icon,
  Tick02Icon,
  EyeIcon,
  Moon01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons"
import {
  parseEmailTemplate,
  buildDefaultVars,
  renderEmailTemplate,
  type TemplateVars,
  type ScalarValue,
} from "@workspace/ui/lib/email-template"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
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
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

type LocalizedString = Record<string, string>

const CATEGORIES = [
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

type Category = (typeof CATEGORIES)[number]

interface LibraryTemplate {
  id: string
  key: string
  collectionId: string | null
  name: LocalizedString
  description: LocalizedString
  category: Category
  subject: LocalizedString
  htmlBody: LocalizedString
  variables: string[]
  thumbnailUrl: string | null
}

/** iframe sandbox altında script çalışmaz; <script> + on*= handler'larını
 *  strip et. Email preview için güvenli render + console "Blocked script
 *  execution" warning'ini elimine. */
function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<iframe\b[^>]*\/?>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
    .replace(/<frame\b[^>]*\/?>/gi, "")
    .replace(/<frameset\b[^<]*(?:(?!<\/frameset>)<[^<]*)*<\/frameset>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "")
}


interface LibraryCollection {
  id: string
  key: string
  name: LocalizedString
  description: LocalizedString
  coverUrl: string | null
}

interface DomainOption {
  id: string
  domain: string
}

const CATEGORY_TINT: Record<Category, string> = {
  otp: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  verification: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "password-reset": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  welcome: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  newsletter: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  transactional: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  billing: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  marketing: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  notification: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  other: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
}

export function TemplateLibraryDialog({
  open,
  onOpenChange,
  defaultDomainId,
  onCloned,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultDomainId?: string
  onCloned: () => void
}) {
  const t = useTranslations("templateLibraryBrowse")
  const params = useParams()
  const slug = params["company-slug"] as string

  const [items, setItems] = useState<LibraryTemplate[]>([])
  const [collections, setCollections] = useState<LibraryCollection[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Category | "all">("all")
  const [collectionFilter, setCollectionFilter] = useState<string>("all")

  // Two-step: önce browse → bir item seçilince clone formu (domain seç + onay)
  const [selected, setSelected] = useState<LibraryTemplate | null>(null)
  const [domains, setDomains] = useState<DomainOption[]>([])
  const [domainId, setDomainId] = useState<string>("")
  const [cloning, setCloning] = useState(false)
  const [cloningCollectionId, setCloningCollectionId] = useState<string | null>(null)

  // Preview state — clone'dan önce template'in compiled görünümü.
  // System template'leri admin tarafında raw HTML olarak yazıldığı için
  // server compile'a gerek yok; client-side variable replace ile iframe'e basılır.
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLang, setPreviewLang] = useState<string>("")
  const [previewVars, setPreviewVars] = useState<TemplateVars>({})
  const [previewDark, setPreviewDark] = useState(false)
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)

  const previewLocales = useMemo(() => {
    if (!selected) return []
    const set = new Set<string>()
    for (const k of Object.keys(selected.htmlBody || {})) {
      if (selected.htmlBody[k]?.trim()) set.add(k)
    }
    for (const k of Object.keys(selected.subject || {})) {
      if (selected.subject[k]?.trim()) set.add(k)
    }
    return Array.from(set)
  }, [selected])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [tplRes, colRes] = await Promise.all([
        fetch(
          `/api/companies/${slug}/template-library${
            filter !== "all" ? `?category=${filter}` : ""
          }`,
        ),
        fetch(`/api/companies/${slug}/template-collections`),
      ])
      const tplJson = await tplRes.json()
      const colJson = await colRes.json()
      if (tplRes.ok) setItems(tplJson.data ?? [])
      if (colRes.ok) setCollections(colJson.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [slug, filter])

  // Domain listesini bir kez yükle (clone formunda dropdown için).
  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await fetch(`/api/companies/${slug}/domains`)
        const json = await res.json()
        if (res.ok) {
          const list = (json.data as Array<Record<string, unknown>>).map((d) => ({
            id: d.id as string,
            domain: (d.domain as string) ?? (d.name as string) ?? "",
          }))
          setDomains(list)
          if (defaultDomainId && list.some((d) => d.id === defaultDomainId)) {
            setDomainId(defaultDomainId)
          } else if (list.length === 1) {
            setDomainId(list[0].id)
          }
        }
      } catch {
        // silent
      }
    })()
  }, [open, slug, defaultDomainId])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  // Modal kapanırken seçimi sıfırla.
  useEffect(() => {
    if (!open) {
      setSelected(null)
      setFilter("all")
      setCollectionFilter("all")
      setPreviewOpen(false)
    }
  }, [open])

  // Yeni template seçilince preview state'ini sıfırla (default lang ilk dolu locale).
  useEffect(() => {
    if (!selected) {
      setPreviewOpen(false)
      return
    }
    setPreviewLang(previewLocales[0] ?? "")
    // Default vars — scalar boş string, section'lar tek-row default field'larla.
    const lang = previewLocales[0] ?? ""
    const html = lang ? selected.htmlBody[lang] ?? "" : ""
    setPreviewVars(buildDefaultVars(parseEmailTemplate(html)))
    setPreviewDark(false)
  }, [selected, previewLocales])

  // Iframe'a compiled HTML'i yaz — preview açıkken her var/lang/dark değişiminde
  // yeniden render et. Client-side variable replace yapılır (raw HTML).
  useEffect(() => {
    if (!previewOpen || !selected || !previewLang) return
    const iframe = previewIframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return
    const rawHtml = selected.htmlBody[previewLang] ?? ""
    const rawSubject = selected.subject[previewLang] ?? ""
    const renderedBody = sanitizeEmailHtml(
      renderEmailTemplate(rawHtml, previewVars),
    )
    const renderedSubject = renderEmailTemplate(rawSubject, previewVars)
    const bg = previewDark ? "#0a0a0a" : "#ffffff"
    const fg = previewDark ? "#fafafa" : "#0a0a0a"
    const cardBg = previewDark ? "#1a1a1a" : "#f5f5f5"
    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:${bg};color:${fg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.h{background:${cardBg};border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px}.h .l{color:${previewDark ? "#a1a1a1" : "#737373"};font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}.h .s{font-weight:600;font-size:15px}a{color:${previewDark ? "#60a5fa" : "#2563eb"}}</style></head><body><div class="h"><div class="l">Subject</div><div class="s">${renderedSubject || "(no subject)"}</div></div>${renderedBody || "<p style=\"color:#888;font-style:italic\">(empty)</p>"}</body></html>`)
    doc.close()
  }, [previewOpen, selected, previewLang, previewVars, previewDark])

  async function cloneCollection(collectionId: string) {
    if (!domainId) {
      toast.error(t("domainRequired"))
      return
    }
    setCloningCollectionId(collectionId)
    try {
      const res = await fetch(
        `/api/companies/${slug}/template-collections/${collectionId}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainId }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Clone failed")
      const data = json.data as { created: number; failed: number }
      if (data.failed > 0) {
        toast.warning(
          t("collectionPartial", { ok: data.created, fail: data.failed }),
        )
      } else {
        toast.success(t("collectionCloned", { count: data.created }))
      }
      onCloned()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setCloningCollectionId(null)
    }
  }

  async function clone() {
    if (!selected) return
    if (!domainId) {
      toast.error(t("domainRequired"))
      return
    }
    setCloning(true)
    try {
      const res = await fetch(
        `/api/companies/${slug}/template-library/${selected.id}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainId }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Clone failed")
      toast.success(t("cloned"))
      onCloned()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setCloning(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Masaüstünde tam ekran genişliği yerine merkezde 7xl ile sınırlı —
        // çok geniş ekranlarda yan boşluklar görsel rahatlık sağlar; küçük
        // ekranlarda yine tam genişlik (sm breakpoint altında max-w yok).
        className="mx-auto flex max-h-[92vh] min-h-[60vh] flex-col gap-0 overflow-hidden rounded-t-xl p-0 sm:max-w-7xl"
        style={{ height: "92vh" }}
      >
        {selected ? (
          // ── Step 2: Clone form ──────────────────────────────────────
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 flex-row items-start gap-3 space-y-0 border-b">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelected(null)}
                aria-label={t("back")}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
              </Button>
              <div className="flex flex-col gap-1">
                <SheetTitle>{selected.name.en || selected.key}</SheetTitle>
                <SheetDescription>
                  {selected.description.en || t("noDescription")}
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-6">

            <div className="flex flex-col gap-4">
              {previewOpen ? (
                <div className="flex flex-col overflow-hidden rounded-xl border bg-muted/20">
                  <div className="flex items-center justify-between border-b bg-background px-3 py-2">
                    <div className="flex items-center gap-2">
                      {previewLocales.length > 1 &&
                        previewLocales.map((l) => (
                          <button
                            key={l}
                            type="button"
                            onClick={() => setPreviewLang(l)}
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase transition-colors",
                              previewLang === l
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:bg-muted/60",
                            )}
                          >
                            {l}
                          </button>
                        ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPreviewDark((d) => !d)}
                      title={previewDark ? t("lightMode") : t("darkMode")}
                    >
                      <HugeiconsIcon
                        icon={previewDark ? Sun01Icon : Moon01Icon}
                        strokeWidth={2}
                        className="size-3.5"
                      />
                    </Button>
                  </div>
                  <iframe
                    ref={previewIframeRef}
                    title="Library preview"
                    className={cn(
                      "h-72 w-full",
                      previewDark ? "bg-neutral-950" : "bg-white",
                    )}
                    sandbox="allow-same-origin"
                  />
                  {(() => {
                    const lang = previewLang || previewLocales[0] || ""
                    const html = lang ? selected.htmlBody[lang] ?? "" : ""
                    const parsed = parseEmailTemplate(html)
                    if (
                      parsed.scalars.length === 0 &&
                      parsed.sections.length === 0
                    ) {
                      return null
                    }
                    return (
                      <div className="flex flex-col gap-2 border-t bg-background p-3">
                        {parsed.scalars.length > 0 && (
                          <div className="grid grid-cols-2 gap-2">
                            {parsed.scalars.map((v) => (
                              <div key={v} className="flex flex-col gap-1">
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                                  {`{${v}}`}
                                </code>
                                <Input
                                  value={
                                    typeof previewVars[v] === "string"
                                      ? (previewVars[v] as string)
                                      : ""
                                  }
                                  onChange={(e) =>
                                    setPreviewVars((p) => ({
                                      ...p,
                                      [v]: e.target.value,
                                    }))
                                  }
                                  placeholder={t("variableValuePlaceholder")}
                                  className="h-7 text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        {parsed.sections.map((section) => {
                          const rows = Array.isArray(previewVars[section.name])
                            ? (previewVars[section.name] as Array<
                                Record<string, ScalarValue>
                              >)
                            : []
                          return (
                            <div
                              key={section.name}
                              className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                                  {`{#${section.name}}`}
                                </code>
                                <span className="text-[10px] text-muted-foreground">
                                  {rows.length} ×
                                </span>
                              </div>
                              {rows.map((row, idx) => (
                                <div
                                  key={idx}
                                  className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-2"
                                >
                                  {section.fields.map((field) => (
                                    <div
                                      key={field}
                                      className="flex flex-col gap-0.5"
                                    >
                                      <code className="font-mono text-[9px] text-muted-foreground">
                                        {field}
                                      </code>
                                      <Input
                                        value={String(row[field] ?? "")}
                                        onChange={(e) => {
                                          const value = e.target.value
                                          setPreviewVars((prev) => {
                                            const next = Array.isArray(
                                              prev[section.name],
                                            )
                                              ? [
                                                  ...(prev[
                                                    section.name
                                                  ] as Array<
                                                    Record<string, ScalarValue>
                                                  >),
                                                ]
                                              : []
                                            next[idx] = {
                                              ...(next[idx] ?? {}),
                                              [field]: value,
                                            }
                                            return {
                                              ...prev,
                                              [section.name]: next,
                                            }
                                          })
                                        }}
                                        placeholder={field}
                                        className="h-6 text-xs"
                                      />
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewVars((prev) => {
                                        const next = Array.isArray(
                                          prev[section.name],
                                        )
                                          ? [
                                              ...(prev[section.name] as Array<
                                                Record<string, ScalarValue>
                                              >),
                                            ]
                                          : []
                                        next.splice(idx, 1)
                                        return {
                                          ...prev,
                                          [section.name]: next,
                                        }
                                      })
                                    }
                                    className="col-span-2 ms-auto rounded p-0.5 text-[10px] text-muted-foreground hover:text-destructive"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setPreviewVars((prev) => {
                                    const next = Array.isArray(
                                      prev[section.name],
                                    )
                                      ? [
                                          ...(prev[section.name] as Array<
                                            Record<string, ScalarValue>
                                          >),
                                        ]
                                      : []
                                    const blank: Record<string, ScalarValue> =
                                      {}
                                    for (const f of section.fields) blank[f] = ""
                                    next.push(blank)
                                    return { ...prev, [section.name]: next }
                                  })
                                }}
                                className="h-6 text-xs"
                              >
                                +
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              ) : selected.thumbnailUrl ? (
                <div className="overflow-hidden rounded-xl border bg-muted/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.thumbnailUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-xl border bg-muted/40">
                  <HugeiconsIcon
                    icon={File01Icon}
                    strokeWidth={1.5}
                    className="size-12 text-muted-foreground/40"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant={previewOpen ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setPreviewOpen((o) => !o)}
                  disabled={previewLocales.length === 0}
                >
                  <HugeiconsIcon
                    icon={EyeIcon}
                    strokeWidth={2}
                    className="size-3.5"
                    data-icon="inline-start"
                  />
                  {previewOpen ? t("hidePreview") : t("showPreview")}
                </Button>
              </div>

              {selected.variables.length > 0 && !previewOpen && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">{t("variables")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.variables.map((v) => (
                      <code
                        key={v}
                        className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
                      >
                        {v}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{t("targetDomain")}</Label>
                <Select
                  value={domainId}
                  onValueChange={(v) => v && setDomainId(v)}
                  disabled={cloning || domains.length === 0}
                >
                  <SelectTrigger>
                    <span className="truncate">
                      {domains.find((d) => d.id === domainId)?.domain ||
                        t("pickDomain")}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {domains.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {domains.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {t("noDomains")}
                  </span>
                )}
              </div>
            </div>
            </div>

            <SheetFooter className="shrink-0 flex-row justify-end border-t">
              <Button
                variant="outline"
                onClick={() => setSelected(null)}
                disabled={cloning}
              >
                {t("back")}
              </Button>
              <Button
                onClick={clone}
                disabled={cloning || !domainId || domains.length === 0}
              >
                {cloning ? (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("cloneCta")}
              </Button>
            </SheetFooter>
          </div>
        ) : (
          // ── Step 1: Browse ──────────────────────────────────────────
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="shrink-0 border-b">
              <SheetTitle>{t("title")}</SheetTitle>
              <SheetDescription>{t("description")}</SheetDescription>
            </SheetHeader>

            <div className="shrink-0 flex flex-wrap items-center gap-2 px-6 pt-4">
              <Select
                value={filter}
                onValueChange={(v) => v && setFilter(v as Category | "all")}
              >
                <SelectTrigger className="w-[180px]">
                  <span className="truncate">
                    {filter === "all"
                      ? t("allCategories")
                      : t(`categories.${filter}`)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allCategories")}</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`categories.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {collections.length > 0 && (
                <Select
                  value={collectionFilter}
                  onValueChange={(v) => v && setCollectionFilter(v)}
                >
                  <SelectTrigger className="w-[200px]">
                    <span className="truncate">
                      {collectionFilter === "all"
                        ? t("allCollections")
                        : collectionFilter === "standalone"
                        ? t("standaloneOnly")
                        : collections.find((c) => c.id === collectionFilter)
                            ?.name.en ||
                          collections.find((c) => c.id === collectionFilter)
                            ?.key ||
                          collectionFilter}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allCollections")}</SelectItem>
                    <SelectItem value="standalone">
                      {t("standaloneOnly")}
                    </SelectItem>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name.en || c.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Bir spesifik koleksiyon seçilmişse "Clone all" toolbar */}
              {collectionFilter !== "all" &&
                collectionFilter !== "standalone" && (
                  <Button
                    size="sm"
                    onClick={() => cloneCollection(collectionFilter)}
                    disabled={
                      cloningCollectionId !== null ||
                      !domainId ||
                      domains.length === 0
                    }
                    className="ms-auto"
                  >
                    {cloningCollectionId === collectionFilter ? (
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="size-3.5 animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className="size-3.5"
                        data-icon="inline-start"
                      />
                    )}
                    {t("cloneEntireCollection")}
                  </Button>
                )}
            </div>

            {/* Clone-all CTA için domain seçici (zaten clone form'unda var ama
                üst seviyede de göster ki kullanıcı koleksiyon klonlama
                öncesinde domain seçebilsin). */}
            {collectionFilter !== "all" &&
              collectionFilter !== "standalone" &&
              domains.length > 0 && (
                <div className="shrink-0 mx-6 flex items-center gap-2 rounded-lg border bg-muted/30 p-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("targetDomain")}:
                  </Label>
                  <Select
                    value={domainId}
                    onValueChange={(v) => v && setDomainId(v)}
                  >
                    <SelectTrigger className="h-8 w-[240px]">
                      <span className="truncate text-xs">
                        {domains.find((d) => d.id === domainId)?.domain ||
                          t("pickDomain")}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {(() => {
              const visible = items.filter((it) => {
                if (collectionFilter === "all") return true
                if (collectionFilter === "standalone") return !it.collectionId
                return it.collectionId === collectionFilter
              })
              if (loading) {
                return (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-72 w-full rounded-xl" />
                    ))}
                  </div>
                )
              }
              if (visible.length === 0) {
                return (
                  <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                    {t("empty")}
                  </div>
                )
              }
              return (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visible.map((item) => {
                  const itemCollection = item.collectionId
                    ? collections.find((c) => c.id === item.collectionId)
                    : null
                  return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="group relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card text-start transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    {itemCollection && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          setCollectionFilter(itemCollection.id)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            e.stopPropagation()
                            setCollectionFilter(itemCollection.id)
                          }
                        }}
                        title={t("filterByCollection")}
                        className="absolute end-2 top-2 z-10 max-w-[60%] cursor-pointer truncate rounded-md border border-white/40 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm hover:bg-black/75"
                      >
                        {itemCollection.name.en || itemCollection.key}
                      </span>
                    )}
                    <div className="aspect-[3/4] overflow-hidden bg-muted/40">
                      {item.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.thumbnailUrl}
                          alt=""
                          className="size-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <HugeiconsIcon
                            icon={File01Icon}
                            strokeWidth={1.5}
                            className="size-10 text-muted-foreground/40"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 px-3 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {item.name.en || item.key}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 border-transparent text-[10px] capitalize",
                            CATEGORY_TINT[item.category],
                          )}
                        >
                          {t(`categories.${item.category}`)}
                        </Badge>
                      </div>
                      {item.description.en && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {item.description.en}
                        </p>
                      )}
                    </div>
                  </button>
                  )
                })}
              </div>
              )
            })()}
            </div>

            <SheetFooter className="shrink-0 flex-row justify-end border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("close")}
              </Button>
            </SheetFooter>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

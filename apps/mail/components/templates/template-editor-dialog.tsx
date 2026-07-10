"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import * as htmlToImage from "html-to-image"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Moon01Icon,
  Sun01Icon,
  PlayIcon,
  AiBrain01Icon,
  PlusSignIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"
import { AiComposeDialog } from "@/components/templates/ai-compose-dialog"
import { routing } from "@workspace/auth/i18n/routing"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import {
  parseEmailTemplates,
  buildDefaultVars,
  renderEmailTemplate,
  type TemplateVars,
  type ScalarValue,
} from "@workspace/ui/lib/email-template"

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
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  LocalizedField,
  type LocalizedValue,
} from "@workspace/console/components/shared"
import { CodeEditor } from "@workspace/ui/components/code-editor"
import { cn } from "@workspace/ui/lib/utils"
import type { LocalizedString, Template as SdkTemplate } from "@sentroy-co/sdk"

const HugerteEditor = dynamic(() => import("@workspace/ui/components/hugerte-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-xl border bg-muted/30">
      <HugeiconsIcon
        icon={Loading03Icon}
        strokeWidth={2}
        className="size-5 animate-spin text-muted-foreground"
      />
    </div>
  ),
})

// ── Helpers ─────────────────────────────────────────────────────────────────

type LocalizedMap = Record<string, string>

function toMap(val: LocalizedString | null | undefined): LocalizedMap {
  if (!val) return {}
  if (typeof val === "string") return val ? { en: val } : {}
  return { ...val }
}

type ContentFormat = "rich" | "mjml"

/** İçeriğin MJML olup olmadığını algılar. */
function detectFormat(content: string): ContentFormat {
  return /<mjml[\s>]/i.test(content) ? "mjml" : "rich"
}

/** Extracts {var} and {{var}} variable names from a string. */

/** iframe sandbox altında script çalışmaz; <script> + on*= handler'larını
 *  strip et. Email HTML zaten script içermemeli — preview/snapshot için
 *  güvenli render + console "Blocked script execution" warning'ini elimine. */
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


// ── Types ───────────────────────────────────────────────────────────────────

interface Template {
  id: string
  name: LocalizedString
  subject: LocalizedString
  mjmlBody: LocalizedString
  domainId?: string
}

interface TemplateEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: Template | null
  onSaved: () => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSaved,
}: TemplateEditorDialogProps) {
  const t = useTranslations("templates")
  const tCommon = useTranslations("common")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const { domains, domainsLoading } = useCompanyDataStore()

  const isEdit = !!template

  // Form state — tum desteklenen diller tab olarak gosterilir,
  // kullanicinin doldurmadigi diller save sirasinda filtrelenir.
  const [names, setNames] = useState<LocalizedMap>({})
  const [subjects, setSubjects] = useState<LocalizedMap>({})
  const [bodies, setBodies] = useState<LocalizedMap>({})
  const [formats, setFormats] = useState<Record<string, ContentFormat>>({})
  const [domainId, setDomainId] = useState("")
  // Preview'in takip ettigi dil (body LocalizedField tab'i ile senkron).
  const [activeLang, setActiveLang] = useState(routing.defaultLocale as string)
  const [saving, setSaving] = useState(false)

  // Preview state — section-aware vars (scalar string ya da array of rows)
  const [previewDark, setPreviewDark] = useState(false)
  const [previewVars, setPreviewVars] = useState<TemplateVars>({})

  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)
  // Off-screen iframe — save sonrası snapshot bunun body'sinden alınır.
  const thumbnailFrameRef = useRef<HTMLIFrameElement | null>(null)

  // AI compose dialog state.
  const [aiComposeOpen, setAiComposeOpen] = useState(false)

  const apiBase = `/api/companies/${slug}/templates`

  // ── Load template on open ────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const defaultLang = routing.defaultLocale
    if (template) {
      const nameMap = toMap(template.name)
      const subjectMap = toMap(template.subject)
      const bodyMap = toMap(template.mjmlBody)
      const fmts: Record<string, ContentFormat> = {}
      for (const l of routing.locales) {
        fmts[l] = detectFormat(bodyMap[l] || "")
      }
      setNames(nameMap)
      setSubjects(subjectMap)
      setBodies(bodyMap)
      setFormats(fmts)
      // Ilk dolu dile default'la, yoksa default locale
      const firstFilled = routing.locales.find(
        (l) => bodyMap[l] || subjectMap[l] || nameMap[l],
      )
      setActiveLang(firstFilled ?? defaultLang)
      setDomainId(template.domainId ?? "")
    } else {
      const fmts: Record<string, ContentFormat> = {}
      for (const l of routing.locales) fmts[l] = "rich"
      setNames({})
      setSubjects({})
      setBodies({})
      setFormats(fmts)
      setActiveLang(defaultLang)
      setDomainId("")
    }
    setPreviewVars({})
  }, [open, template])

  // ── Variable extraction ──────────────────────────────────────────────────

  // Section-aware parse — preview tab'i scalar input + array row UI gösterir.
  const parsedVariables = useMemo(() => {
    const sources: string[] = []
    for (const v of Object.values(subjects)) sources.push(v || "")
    for (const v of Object.values(bodies)) sources.push(v || "")
    return parseEmailTemplates(sources)
  }, [subjects, bodies])

  const isMjmlActive = (formats[activeLang] || "rich") === "mjml"

  // Preview'ı debounce et — her keystroke'ta iframe'i yeniden yüklemesin
  const currentBody = bodies[activeLang] || ""
  const currentSubject = subjects[activeLang] || ""
  const [debouncedBody, setDebouncedBody] = useState(currentBody)
  const [debouncedSubject, setDebouncedSubject] = useState(currentSubject)

  useEffect(() => {
    // Dil değişiminde anında güncelle (debounce yok)
    setDebouncedBody(currentBody)
    setDebouncedSubject(currentSubject)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLang])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBody(currentBody)
      setDebouncedSubject(currentSubject)
    }, 300)
    return () => clearTimeout(timer)
  }, [currentBody, currentSubject])

  // ── Preview HTML ─────────────────────────────────────────────────────────

  const previewHtml = useMemo(() => {
    const rawBody = debouncedBody
    const rawSubject = debouncedSubject
    const renderedBody = isMjmlActive
      ? `<div style="padding:32px;text-align:center;color:#888;font-family:ui-sans-serif,system-ui,sans-serif;">
           <div style="font-size:32px;margin-bottom:12px;">⚙️</div>
           <div style="font-weight:600;margin-bottom:6px;">MJML Preview</div>
           <div style="font-size:13px;line-height:1.5;max-width:360px;margin:0 auto;">
             MJML will be compiled to responsive HTML on save. Use the rich preview after saving to view the compiled output.
           </div>
         </div>`
      : renderEmailTemplate(rawBody, previewVars)
    const renderedSubject = renderEmailTemplate(rawSubject, previewVars)

    const bg = previewDark ? "#0a0a0a" : "#ffffff"
    const fg = previewDark ? "#fafafa" : "#0a0a0a"
    const cardBg = previewDark ? "#1a1a1a" : "#f5f5f5"

    return `<!DOCTYPE html>
<html lang="${activeLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${renderedSubject}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 20px;
    background: ${bg};
    color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  .mail-header {
    background: ${cardBg};
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 20px;
    font-size: 14px;
  }
  .mail-header .label {
    color: ${previewDark ? "#a1a1a1" : "#737373"};
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }
  .mail-header .subject {
    font-weight: 600;
    font-size: 16px;
  }
  .mail-body {
    background: ${bg};
  }
  a { color: ${previewDark ? "#60a5fa" : "#2563eb"}; }
</style>
</head>
<body>
  <div class="mail-header">
    <div class="label">Subject</div>
    <div class="subject">${renderedSubject || "(no subject)"}</div>
  </div>
  <div class="mail-body">
    ${renderedBody || '<p style="color: #888; font-style: italic;">No content</p>'}
  </div>
</body>
</html>`
  }, [debouncedBody, debouncedSubject, activeLang, previewVars, previewDark, isMjmlActive])

  // Iframe document'ine içeriği yaz — srcDoc'tan daha güvenilir
  useEffect(() => {
    const iframe = previewIframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return
    doc.open()
    doc.write(sanitizeEmailHtml(previewHtml))
    doc.close()
  }, [previewHtml])

  function setPreviewVar(key: string, value: string) {
    setPreviewVars((prev) => ({ ...prev, [key]: value }))
  }
  function updateSectionField(
    section: string,
    rowIdx: number,
    field: string,
    value: ScalarValue,
  ) {
    setPreviewVars((prev) => {
      const rows = Array.isArray(prev[section])
        ? [...(prev[section] as Array<Record<string, ScalarValue>>)]
        : []
      const row = { ...(rows[rowIdx] ?? {}) }
      row[field] = value
      rows[rowIdx] = row
      return { ...prev, [section]: rows }
    })
  }
  function addSectionRow(section: string) {
    const fields =
      parsedVariables.sections.find((s) => s.name === section)?.fields ?? []
    setPreviewVars((prev) => {
      const rows = Array.isArray(prev[section])
        ? [...(prev[section] as Array<Record<string, ScalarValue>>)]
        : []
      const blank: Record<string, ScalarValue> = {}
      for (const f of fields) blank[f] = ""
      rows.push(blank)
      return { ...prev, [section]: rows }
    })
  }
  function removeSectionRow(section: string, rowIdx: number) {
    setPreviewVars((prev) => {
      const rows = Array.isArray(prev[section])
        ? [...(prev[section] as Array<Record<string, ScalarValue>>)]
        : []
      rows.splice(rowIdx, 1)
      return { ...prev, [section]: rows }
    })
  }

  // ── Validation ───────────────────────────────────────────────────────────

  /** En az bir dilde name + subject + body doldurulmus olmalı. */
  function isValid(): boolean {
    if (!domainId && !isEdit) return false
    return routing.locales.some(
      (l) =>
        (names[l] ?? "").trim() &&
        (subjects[l] ?? "").trim() &&
        (bodies[l] ?? "").trim(),
    )
  }

  // ── Thumbnail snapshot ───────────────────────────────────────────────────

  /**
   * Save sonrası fire-and-forget — gizli iframe'e default locale body'i yaz,
   * html-to-image ile PNG snapshot al, thumbnail endpoint'ine POST et.
   * Hata olursa save UX'i etkilenmez (cosmetic).
   */
  async function captureAndUploadThumbnail(templateId: string) {
    const iframe = thumbnailFrameRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return

    const html =
      bodies[routing.defaultLocale]?.trim() ||
      Object.values(bodies).find((v) => v?.trim())?.trim() ||
      ""
    if (!html) return

    doc.open()
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body style="margin:0;background:#fff;color:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${sanitizeEmailHtml(html)}</body></html>`,
    )
    doc.close()

    await new Promise((r) => setTimeout(r, 300))

    let blob: Blob | null
    try {
      blob = await htmlToImage.toBlob(doc.body, {
        backgroundColor: "#ffffff",
        pixelRatio: 1.5,
        cacheBust: true,
      })
    } catch (err) {
      console.warn("[templates] thumbnail capture failed:", err)
      return
    }
    if (!blob) return

    const form = new FormData()
    form.append("file", blob, `${templateId}.png`)
    try {
      const res = await fetch(`${apiBase}/${templateId}/thumbnail`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.warn("[templates] thumbnail upload failed:", json)
      }
    } catch (err) {
      console.warn("[templates] thumbnail upload error:", err)
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!isValid()) return
    setSaving(true)
    try {
      // Temizle: boş dilleri at — sadece tum alanlari dolu olan diller kayda girer.
      const cleanNames: LocalizedMap = {}
      const cleanSubjects: LocalizedMap = {}
      const cleanBodies: LocalizedMap = {}
      const savedLangs: string[] = []
      for (const l of routing.locales) {
        const hasAll =
          (names[l] ?? "").trim() &&
          (subjects[l] ?? "").trim() &&
          (bodies[l] ?? "").trim()
        if (!hasAll) continue
        cleanNames[l] = names[l].trim()
        cleanSubjects[l] = subjects[l].trim()
        cleanBodies[l] = bodies[l]
        savedLangs.push(l)
      }

      // Tek dil varsa string olarak gönder (backward compat)
      const singleLang = savedLangs.length === 1 ? savedLangs[0] : null

      const payload: Record<string, unknown> = {
        name: singleLang ? cleanNames[singleLang] : cleanNames,
        subject: singleLang ? cleanSubjects[singleLang] : cleanSubjects,
        mjmlBody: singleLang ? cleanBodies[singleLang] : cleanBodies,
      }
      if (!isEdit) payload.domainId = domainId

      const url = isEdit ? `${apiBase}/${template!.id}` : apiBase
      const method = isEdit ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to save")

      toast.success(isEdit ? t("templateUpdated") : t("templateCreated"))

      // Snapshot fire-and-forget — UI bloklamadan arkada koşar.
      const savedId =
        (json.data?.id as string | undefined) ?? template?.id ?? null
      if (savedId) {
        captureAndUploadThumbnail(savedId)
          .catch(() => {})
          .finally(() => {
            onSaved()
          })
      } else {
        onSaved()
      }

      onOpenChange(false)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save template"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full-screen — template editing form + side preview ekran alanını
          tam kullanmalı, küçük modal olmamalı. Center positioning override
          edilir; rounded ve padding sıfırlanır. */}
      <DialogContent className="!max-w-none !w-screen !h-screen !top-0 !start-0 !translate-x-0 !translate-y-0 !rounded-none overflow-hidden p-0 gap-0">
        <div className="flex h-screen flex-col">
          <DialogHeader className="flex-row items-start justify-between gap-3 border-b px-6 py-4 space-y-0">
            <div className="flex flex-col gap-1">
              <DialogTitle>
                {isEdit ? t("editTemplate") : t("createTemplate")}
              </DialogTitle>
              <DialogDescription>{t("variablesHint")}</DialogDescription>
            </div>
            {!isEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAiComposeOpen(true)}
                disabled={saving}
                className={"mr-6"}
              >
                <HugeiconsIcon
                  icon={AiBrain01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("aiGenerate")}
              </Button>
            )}
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* ── Left: Form ───────────────────────────────────────────── */}
            <ScrollArea className="flex-1 border-r">
              <div className="flex flex-col gap-4 p-6">
                {/* Domain (only for create) */}
                {!isEdit && (
                  <div className="flex flex-col gap-2">
                    <Label>{t("domain")}</Label>
                    <Select
                      value={domainId}
                      onValueChange={(v) => setDomainId(v || "")}
                      disabled={saving || domainsLoading}
                    >
                      <SelectTrigger>
                        <span className="truncate">
                          {domains.find((d) => d.id === domainId)?.name ||
                            t("domain")}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {domains
                          .filter((d) => d.status === "active")
                          .map((d) => (
                            <SelectItem
                              key={d.id}
                              value={d.id}
                              label={d.name}
                            >
                              {d.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Tek bir LocalizedField — name + subject + body aynı dil
                    tab'ı altında. Önceki sürümde her field kendi tab strip'ini
                    açıyordu (3 ayrı row), kullanıcının dil değiştirmek için
                    her bir field'ı ayrı tıklaması gerekiyordu. Multi-item
                    mode tek strip + flat field listesi → atomic locale
                    değişimi, çok daha az gürültü. */}
                <LocalizedField<"name" | "subject" | "body">
                  value={{ name: names, subject: subjects, body: bodies }}
                  onChange={(
                    next: Record<
                      "name" | "subject" | "body",
                      LocalizedValue
                    >,
                  ) => {
                    setNames(next.name ?? {})
                    setSubjects(next.subject ?? {})
                    setBodies(next.body ?? {})
                  }}
                  onActiveChange={setActiveLang}
                  defaultLocale={activeLang}
                  disabled={saving}
                  fields={[
                    {
                      name: "name",
                      label: t("name"),
                      placeholder: t("namePlaceholder"),
                    },
                    {
                      name: "subject",
                      label: t("subject"),
                      placeholder: t("subjectPlaceholder"),
                    },
                    {
                      name: "body",
                      label: t("body"),
                      render: ({ lang, value, onChange, disabled }) => {
                        const fmt = formats[lang] || "rich"
                        if (fmt === "mjml") {
                          return (
                            <div className="flex flex-col gap-2">
                              <CodeEditor
                                key={`mjml-${lang}`}
                                value={value}
                                onChange={onChange}
                                disabled={disabled}
                                placeholder="<mjml>...</mjml>"
                                minHeight={400}
                                maxHeight={400}
                              />
                              <p className="text-xs text-muted-foreground">
                                MJML will be compiled to HTML on save. Use{" "}
                                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                                  {"<mj-text>"}
                                </code>
                                ,{" "}
                                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                                  {"<mj-button>"}
                                </code>
                                , etc. Learn more at{" "}
                                <a
                                  href="https://documentation.mjml.io/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline"
                                >
                                  mjml.io
                                </a>
                                .
                              </p>
                            </div>
                          )
                        }
                        return (
                          <HugerteEditor
                            key={`rich-${lang}`}
                            initialValue={value}
                            onEditorChange={onChange}
                            height={400}
                            disabled={disabled}
                            showHtmlToggle
                            placeholder={t("bodyPlaceholder")}
                          />
                        )
                      },
                    },
                  ]}
                />
              </div>
            </ScrollArea>

            {/* ── Right: Preview ───────────────────────────────────────── */}
            <div className="flex w-[45%] flex-col bg-muted/20">
              {/* Preview header */}
              <div className="flex items-center justify-between border-b bg-background px-4 py-3">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={PlayIcon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                  <span className="text-sm font-medium">{t("preview")}</span>
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {activeLang}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase"
                  >
                    {formats[activeLang] || "rich"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPreviewDark(!previewDark)}
                  title={previewDark ? t("lightMode") : t("darkMode")}
                >
                  <HugeiconsIcon
                    icon={previewDark ? Sun01Icon : Moon01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </Button>
              </div>

              {/* Variables panel */}
              <div className="border-b bg-background px-4 py-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("variables")}
                </div>
                {parsedVariables.scalars.length === 0 &&
                parsedVariables.sections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("variablesEmpty")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {parsedVariables.scalars.map((varName) => (
                      <div
                        key={varName}
                        className="flex items-center gap-2"
                      >
                        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {`{${varName}}`}
                        </code>
                        <Input
                          value={
                            typeof previewVars[varName] === "string"
                              ? (previewVars[varName] as string)
                              : ""
                          }
                          onChange={(e) =>
                            setPreviewVar(varName, e.target.value)
                          }
                          placeholder={t("variableValue")}
                          className="h-7 text-xs"
                        />
                      </div>
                    ))}
                    {parsedVariables.sections.map((section) => {
                      const rows = Array.isArray(previewVars[section.name])
                        ? (previewVars[section.name] as Array<
                            Record<string, ScalarValue>
                          >)
                        : []
                      return (
                        <div
                          key={section.name}
                          className="flex flex-col gap-2 rounded-lg border bg-background/60 p-2"
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
                              className="flex flex-col gap-1 rounded-md border bg-muted/30 p-2"
                            >
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>#{idx + 1}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeSectionRow(section.name, idx)
                                  }
                                  className="rounded p-0.5 hover:bg-destructive/15 hover:text-destructive"
                                  title={t("removeRow")}
                                >
                                  <HugeiconsIcon
                                    icon={Delete02Icon}
                                    strokeWidth={2}
                                    className="size-3"
                                  />
                                </button>
                              </div>
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
                                    onChange={(e) =>
                                      updateSectionField(
                                        section.name,
                                        idx,
                                        field,
                                        e.target.value,
                                      )
                                    }
                                    placeholder={field}
                                    className="h-6 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addSectionRow(section.name)}
                            className="h-6 text-xs"
                          >
                            <HugeiconsIcon
                              icon={PlusSignIcon}
                              strokeWidth={2}
                              data-icon="inline-start"
                              className="size-3"
                            />
                            {t("addRow")}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Iframe preview */}
              <div className="flex-1 overflow-hidden p-3">
                {!activeLang ? (
                  <Skeleton className="h-full w-full rounded-lg" />
                ) : (
                  <iframe
                    ref={previewIframeRef}
                    title="Email preview"
                    className={cn(
                      "h-full w-full rounded-lg border shadow-sm",
                      previewDark ? "bg-neutral-950" : "bg-white",
                    )}
                    sandbox="allow-same-origin"
                  />
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !isValid()}>
              {saving && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {tCommon("save")}
            </Button>
          </DialogFooter>

          {/* Snapshot kaynağı — display:none html-to-image render'ı bozar,
              off-screen absolute pozisyon kullanılır. */}
          <iframe
            ref={thumbnailFrameRef}
            title="thumbnail-source"
            aria-hidden="true"
            tabIndex={-1}
            style={{
              position: "fixed",
              top: 0,
              left: -9999,
              width: 600,
              height: 800,
              border: 0,
              pointerEvents: "none",
            }}
          />
        </div>
      </DialogContent>

      <AiComposeDialog
        open={aiComposeOpen}
        onOpenChange={setAiComposeOpen}
        onApply={({ name, subject, body }) => {
          // AI çıktısını editor state'ine merge et — kullanıcı değiştirebilir.
          // Yalnızca dolu locale'ler basılır; kullanıcının seçmediği diller
          // mevcut state'i korur.
          setNames((prev) => ({ ...prev, ...name }))
          setSubjects((prev) => ({ ...prev, ...subject }))
          setBodies((prev) => ({ ...prev, ...body }))
          // İlk doldurulan locale'i aktif yap → editör hemen onu gösterir.
          const firstLocale = Object.keys(body)[0]
          if (firstLocale) setActiveLang(firstLocale)
        }}
      />
    </Dialog>
  )
}

// Compatibility: re-export type so callers can use it
export type { SdkTemplate }

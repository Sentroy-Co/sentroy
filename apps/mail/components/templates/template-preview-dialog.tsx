"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import * as htmlToImage from "html-to-image"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Moon01Icon,
  Sun01Icon,
  SentIcon,
  PlusSignIcon,
  Delete02Icon,
} from "@hugeicons/core-free-icons"

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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import { useSession } from "@workspace/auth/client/auth-client"
import {
  resolveLocalized,
  localizedLanguages,
  type LocalizedString,
} from "@sentroy-co/sdk"

interface PreviewTemplate {
  id: string
  name: LocalizedString
  subject: LocalizedString
  mjmlBody: LocalizedString
  domainId?: string
  thumbnailUrl?: string
}

interface Mailbox {
  email: string
  domainId?: string
}

interface TemplatePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: PreviewTemplate | null
  /** Eski (v1.15 öncesi) veya snapshot fail etmiş template'lerde dialog
   *  iframe'den otomatik snapshot alıp upload eder; başarılı olursa
   *  parent state'i güncellesin diye burası tetiklenir. */
  onThumbnailGenerated?: (templateId: string, url: string) => void
}

function asMap(val: LocalizedString | null | undefined): Record<string, string> {
  if (!val) return {}
  if (typeof val === "string") return val ? { en: val } : {}
  return { ...val }
}

/**
 * Email HTML'inden script tag'leri ve inline event handler'ları (on*=) strip
 * eder. İki amaç:
 *  1. iframe sandbox="allow-same-origin" (allow-scripts YOK) altında inline
 *     script'ler "Blocked script execution" console hatası üretiyordu.
 *  2. Mail client'ları zaten script'leri çalıştırmaz; preview'da çalıştırmaya
 *     izin verirsek prod ile divergence + güvenlik riski.
 *
 * Regex tabanlı — DOMPurify gibi tam sanitizer değil. Email template'leri
 * için yeterli (zaten sadece HTML+CSS bekleniyor).
 */
function sanitizeEmailHtml(html: string): string {
  return html
    .replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      "",
    )
    // <iframe>, <object>, <embed>, <frame> tag'leri — Hugerte editor'in
    // sandbox_iframes default'u nedeniyle bunlar nested sandbox üretiyor;
    // ayrıca email client'ları zaten bloke eder. Self-closing dahil.
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

export function TemplatePreviewDialog({
  open,
  onOpenChange,
  template,
  onThumbnailGenerated,
}: TemplatePreviewDialogProps) {
  const t = useTranslations("templates")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]
  const { data: session } = useSession()

  const langs = useMemo(
    () => (template ? localizedLanguages(template.subject) : []),
    [template],
  )

  const [activeLang, setActiveLang] = useState<string>("")
  const [vars, setVars] = useState<TemplateVars>({})
  const [previewHtml, setPreviewHtml] = useState("")
  const [previewSubject, setPreviewSubject] = useState("")
  const [loading, setLoading] = useState(false)
  const [dark, setDark] = useState(false)

  // Test send state — kullanıcı önizlemeyi tatmin edici bulduğunda kendine
  // (veya başka bir adrese) bu kompoze halini gönderebilir. Mailbox listesi
  // template'in domainId'sine filtrelenir.
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [testTo, setTestTo] = useState("")
  const [testFrom, setTestFrom] = useState("")
  const [testSending, setTestSending] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Bir template için en fazla bir auto-snapshot denemesi olsun — kullanıcı
  // dialog'ta variable doldurup yeniden render alırsa tekrar yüklemeye
  // çalışmasın.
  const snapshotAttemptedRef = useRef<Set<string>>(new Set())

  // Variables are auto-derived from subject + body across all locales —
  // user fills them, preview re-renders with substituted values.
  // Yapı: scalar'lar tek input; section'lar (örn `{#products}...{/products}`)
  // collapsible row listesi olarak. Her section render'da array iter eder.
  const parsedVars = useMemo(() => {
    if (!template) return { scalars: [], sections: [] }
    const sources: string[] = []
    for (const v of Object.values(asMap(template.subject))) sources.push(v)
    for (const v of Object.values(asMap(template.mjmlBody))) sources.push(v)
    return parseEmailTemplates(sources)
  }, [template])

  // Reset state when dialog opens with a new template.
  useEffect(() => {
    if (!open || !template) return
    const firstFilled =
      langs.find((l) => asMap(template.subject)[l]) ?? langs[0] ?? ""
    setActiveLang(firstFilled)
    // Default vars: scalar'lar boş, section'lar tek-row default field'larla.
    setVars(buildDefaultVars(parsedVars))
    setPreviewHtml("")
    setPreviewSubject("")
    setDark(false)
    setTestTo(session?.user?.email ?? "")
    setTestFrom("")
  }, [open, template, langs, session, parsedVars])

  // Mailbox listesi — template'in domain'iyle eşleşenlere indirgenir, ilki
  // default sender olur. Test send için kullanıcının zaten bir mailbox
  // kurmuş olması beklenir; yoksa "send disabled" mesajı gösteririz.
  useEffect(() => {
    if (!open || !template) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/companies/${slug}/mailboxes`)
        const json = await res.json()
        if (!res.ok || cancelled) return
        const list = (json.data ?? []) as Mailbox[]
        const filtered = template.domainId
          ? list.filter((m) => m.domainId === template.domainId)
          : list
        setMailboxes(filtered)
        if (filtered.length > 0) setTestFrom(filtered[0].email)
      } catch {
        // sessiz — test send disabled olur
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, template, slug])

  // Fetch compiled HTML from sentroy whenever dialog opens, language
  // changes, or variables change. Debounced for variables to avoid hammer
  // on every keystroke.
  useEffect(() => {
    if (!open || !template || !activeLang) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        // MJML template'leri server-side compile gerektirir; raw HTML'leri
        // client-side render ederiz — section ({#products}...{/products})
        // desteği için bu yol mail-server deploy bağımsız çalışır.
        const rawBody = asMap(template.mjmlBody)[activeLang] ?? ""
        const rawSubject = asMap(template.subject)[activeLang] ?? ""
        const isMjml = /<\s*mjml[\s>]/i.test(rawBody)
        if (!isMjml) {
          setPreviewHtml(renderEmailTemplate(rawBody, vars))
          setPreviewSubject(renderEmailTemplate(rawSubject, vars))
          return
        }
        const res = await fetch(
          `/api/companies/${slug}/templates/${template.id}/preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ variables: vars, lang: activeLang }),
            signal: controller.signal,
          },
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to render preview")
        setPreviewHtml(json.data?.html ?? "")
        setPreviewSubject(json.data?.subject ?? "")
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return
        const message =
          err instanceof Error ? err.message : "Failed to render preview"
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, template, activeLang, vars, slug])

  // Render compiled HTML into the iframe each time it changes. Use
  // doc.write rather than srcDoc — more reliable for inline scripts /
  // base href and preserves theme tweaks via injected wrapper.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return
    const bg = dark ? "#0a0a0a" : "#ffffff"
    const safe = sanitizeEmailHtml(previewHtml || "")
    doc.open()
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>html,body{margin:0;background:${bg}}</style></head><body>${safe}</body></html>`,
    )
    doc.close()
  }, [previewHtml, dark])

  // Auto-thumbnail backfill — template'de thumbnailUrl yoksa (eski kayıtlar
  // veya editor save snapshot'ı fail etmiş olanlar) ilk başarılı preview
  // render'ında iframe'den snapshot al, /thumbnail endpoint'ine POST et.
  // Variable doldurulmuş halini değil, baseline (vars boş) görüntüsünü
  // tercih ederiz — card'da gözüken görsel "kullanıcının placeholder ile
  // doldurduğu Ali" değil "{{userName}} merhaba" baseline'ı olur.
  //
  // Robust capture (admin v1.24.3 pattern):
  //  - Image yüklemeyi bekle (load/error/3s timeout)
  //  - skipFonts + filter: external CSS/script CORS fail kaynaklarını skip
  //  - imagePlaceholder: CORS-tainted image'lar için tiny SVG fallback
  //  - body.scrollHeight < 8 ise capture iptal
  //  - Blob.size < 256 ise upload iptal
  useEffect(() => {
    if (!open || !template || !previewHtml) return
    if (template.thumbnailUrl) return
    // Kullanıcı sample değer doldurduysa snapshot alma — baseline (boş)
    // görüntüsünü tercih ederiz. Default vars (boş scalar + boş section row)
    // baseline sayılır.
    const hasUserInput = Object.values(vars).some((v) => {
      if (typeof v === "string") return v.length > 0
      if (typeof v === "number" || typeof v === "boolean") return true
      if (Array.isArray(v)) {
        return v.some((row) =>
          Object.values(row).some((f) => f != null && String(f).length > 0),
        )
      }
      return false
    })
    if (hasUserInput) return
    if (snapshotAttemptedRef.current.has(template.id)) return
    snapshotAttemptedRef.current.add(template.id)

    const tplId = template.id
    const PLACEHOLDER_IMG =
      "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj48cmVjdCB3aWR0aD0iODAiIGhlaWdodD0iODAiIGZpbGw9IiNmM2YzZjMiLz48dGV4dCB4PSI0MCIgeT0iNDQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtc2l6ZT0iMTAiIGZpbGw9IiM5OTkiPmltZzwvdGV4dD48L3N2Zz4="

    const captureFilter = (node: Node): boolean => {
      if (!(node instanceof Element)) return true
      const tag = node.tagName.toLowerCase()
      if (tag === "link") {
        const rel = (node as HTMLLinkElement).rel?.toLowerCase()
        if (rel === "stylesheet" || rel === "preload") return false
      }
      if (tag === "script") return false
      return true
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      const iframe = iframeRef.current
      const doc = iframe?.contentDocument || iframe?.contentWindow?.document
      if (!doc?.body) return

      // Image yüklemeyi bekle — load/error, hangisi önce gelirse
      const imgs = Array.from(doc.images || [])
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalWidth > 0
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                const done = () => resolve()
                img.addEventListener("load", done, { once: true })
                img.addEventListener("error", done, { once: true })
                setTimeout(done, 3000)
              }),
        ),
      )
      if (cancelled) return

      const bodyHeight = doc.body.scrollHeight
      const bodyWidth = doc.body.scrollWidth
      if (bodyHeight < 8) {
        console.warn("[preview] empty body — skipping snapshot", {
          bodyHeight,
          bodyWidth,
        })
        return
      }

      let blob: Blob | null = null
      try {
        blob = await htmlToImage.toBlob(doc.body, {
          backgroundColor: "#ffffff",
          pixelRatio: 1.5,
          cacheBust: true,
          width: bodyWidth || 600,
          height: bodyHeight,
          skipFonts: true,
          imagePlaceholder: PLACEHOLDER_IMG,
          filter: captureFilter,
        })
      } catch (err) {
        console.warn("[preview] htmlToImage failed:", err)
        return
      }
      if (!blob || blob.size < 256) {
        console.warn("[preview] empty blob — skipping upload", {
          blobSize: blob?.size,
          bodyHeight,
        })
        return
      }
      if (cancelled) return

      const form = new FormData()
      form.append("file", blob, `${tplId}.png`)
      try {
        const res = await fetch(
          `/api/companies/${slug}/templates/${tplId}/thumbnail`,
          { method: "POST", body: form },
        )
        const json = await res.json().catch(() => ({}))
        if (res.ok && json.data?.thumbnailUrl) {
          console.info("[preview] thumbnail backfilled:", json.data.thumbnailUrl)
          onThumbnailGenerated?.(tplId, json.data.thumbnailUrl)
        } else if (!res.ok) {
          console.warn(
            "[preview] thumbnail upload failed:",
            res.status,
            json,
          )
        }
      } catch (err) {
        console.warn("[preview] backfill upload error:", err)
      }
    }, 800)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, template, previewHtml, vars, slug, onThumbnailGenerated])

  async function handleTestSend() {
    if (!template || !testTo || !testFrom || !template.domainId) return
    setTestSending(true)
    try {
      const res = await fetch(`/api/companies/${slug}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testTo,
          from: testFrom,
          subject:
            previewSubject ||
            asMap(template.subject)[activeLang] ||
            resolveLocalized(template.subject) ||
            "(no subject)",
          domainId: template.domainId,
          templateId: template.id,
          lang: activeLang,
          variables: vars,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to send")
      toast.success(t("testSendOk", { to: testTo }))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send"
      toast.error(message)
    } finally {
      setTestSending(false)
    }
  }

  const canTestSend =
    !!testTo && !!testFrom && !!template?.domainId && mailboxes.length > 0

  const missingVars = useMemo(() => {
    const missing: string[] = []
    for (const s of parsedVars.scalars) {
      const v = vars[s]
      if (typeof v !== "string" || v.length === 0) missing.push(s)
    }
    for (const sec of parsedVars.sections) {
      const value = vars[sec.name]
      if (!Array.isArray(value) || value.length === 0) {
        missing.push(sec.name)
      }
    }
    return missing
  }, [parsedVars, vars])

  // Section row helpers — UI'da Add/Remove + per-field edit için.
  function updateScalar(name: string, value: string) {
    setVars((prev) => ({ ...prev, [name]: value }))
  }
  function updateSectionField(
    section: string,
    rowIdx: number,
    field: string,
    value: ScalarValue,
  ) {
    setVars((prev) => {
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
      parsedVars.sections.find((s) => s.name === section)?.fields ?? []
    setVars((prev) => {
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
    setVars((prev) => {
      const rows = Array.isArray(prev[section])
        ? [...(prev[section] as Array<Record<string, ScalarValue>>)]
        : []
      rows.splice(rowIdx, 1)
      return { ...prev, [section]: rows }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-5xl max-h-[92vh] overflow-hidden p-0">
        <div className="flex h-[92vh] flex-col">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>
              {template
                ? resolveLocalized(template.name) || t("untitled")
                : t("preview")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {previewSubject || (template ? resolveLocalized(template.subject) : "")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* ── Sidebar: lang + variables ──────────────────────────── */}
            <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-muted/20 p-4">
              {langs.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("languages")}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {langs.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setActiveLang(l)}
                        className={cn(
                          "rounded-md px-2 py-1 text-[11px] font-medium uppercase transition-colors",
                          activeLang === l
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-background/60",
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("variables")}
                </span>
                {parsedVars.scalars.length === 0 &&
                parsedVars.sections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("variablesEmpty")}
                  </p>
                ) : (
                  <>
                    {parsedVars.scalars.map((name) => (
                      <div key={name} className="flex flex-col gap-1">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {`{${name}}`}
                        </code>
                        <Input
                          value={
                            typeof vars[name] === "string"
                              ? (vars[name] as string)
                              : ""
                          }
                          onChange={(e) => updateScalar(name, e.target.value)}
                          placeholder={t("variableValue")}
                          className="h-7 text-xs"
                        />
                      </div>
                    ))}

                    {parsedVars.sections.map((section) => {
                      const rows = Array.isArray(vars[section.name])
                        ? (vars[section.name] as Array<
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
                  </>
                )}
              </div>

              {/* Test send paneli — kullanıcı önizlemenin gerçek mail
                  client'ta nasıl göründüğünü test etmek için kendine
                  (veya başka bir adrese) yollar. */}
              <div className="flex flex-col gap-2 border-t pt-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("testSendTitle")}
                </span>
                {mailboxes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("testSendNoMailbox")}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {t("testSendFrom")}
                      </span>
                      <Select
                        value={testFrom}
                        onValueChange={(v) => v && setTestFrom(v)}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <span className="truncate">{testFrom}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {mailboxes.map((m) => (
                            <SelectItem key={m.email} value={m.email}>
                              {m.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {t("testSendTo")}
                      </span>
                      <Input
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                        placeholder="you@example.com"
                        type="email"
                        className="h-7 text-xs"
                      />
                    </div>
                    {missingVars.length > 0 && (
                      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
                        {t("missingVarsWarn", {
                          vars: missingVars.join(", "),
                        })}
                      </p>
                    )}
                    <Button
                      size="sm"
                      onClick={handleTestSend}
                      disabled={!canTestSend || testSending}
                      className="mt-1 h-7"
                    >
                      <HugeiconsIcon
                        icon={testSending ? Loading03Icon : SentIcon}
                        strokeWidth={2}
                        className={cn("size-3.5", testSending && "animate-spin")}
                        data-icon="inline-start"
                      />
                      {t("testSend")}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* ── Preview ────────────────────────────────────────────── */}
            <div className="flex flex-1 flex-col bg-muted/10">
              <div className="flex items-center justify-between border-b bg-background px-4 py-2">
                <div className="flex items-center gap-2">
                  {activeLang && (
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {activeLang}
                    </Badge>
                  )}
                  {loading && (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="size-3.5 animate-spin text-muted-foreground"
                    />
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDark((d) => !d)}
                  title={dark ? t("lightMode") : t("darkMode")}
                >
                  <HugeiconsIcon
                    icon={dark ? Sun01Icon : Moon01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </Button>
              </div>
              <div className="flex-1 overflow-hidden p-3">
                {!previewHtml && loading ? (
                  <Skeleton className="h-full w-full rounded-lg" />
                ) : (
                  <iframe
                    ref={iframeRef}
                    title="Template preview"
                    className={cn(
                      "h-full w-full rounded-lg border shadow-sm",
                      dark ? "bg-neutral-950" : "bg-white",
                    )}
                    sandbox="allow-same-origin"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

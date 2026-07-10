"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Calendar03Icon,
  Attachment01Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons"
import { DateTimePicker } from "@workspace/ui/components/datetime-picker"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  EmailChipsInput,
  type ContactSuggestion,
} from "@workspace/ui/components/email-chips-input"
import {
  resolveLocalized,
  localizedLanguages,
  type LocalizedString,
} from "@sentroy-co/sdk"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"
import { confirm } from "@workspace/console/stores/confirm"
import {
  isDraftDirty,
  useComposeDrafts,
  type ComposeDraft,
} from "@/stores/compose-drafts"
import { ComposeAiPanel } from "@/components/inbox/compose-ai-panel"

const HugerteEditor = dynamic(() => import("@workspace/ui/components/hugerte-editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full rounded-lg" />,
})

// ── Types ───────────────────────────────────────────────────────────────────

interface Mailbox {
  email: string
  domainId?: string
}

interface CatchAllRule {
  /** Sentroy backend domain id */
  sentroyDomainId: string
  /** Domain adı (örn. "example.com") */
  domainName: string
  /** Anchor mailbox; gönderme için kullanılan default. */
  targetMailboxEmail: string
}

interface Template {
  id: string
  name: LocalizedString
  subject: LocalizedString
  mjmlBody: LocalizedString
  variables: string[]
  domainId?: string
}

interface AttachmentFile {
  file: File
  name: string
  size: number
  base64: string
  contentType: string
}

export interface ComposeDefaults {
  from?: string
  to?: string[]
  cc?: string[]
  replyTo?: string[]
  subject?: string
  /** HTML body — reply/forward icin alintilanmis orijinal icerik. */
  body?: string
  /** RFC 5322 In-Reply-To — reply gonderirken thread baglantisi icin */
  inReplyTo?: string
  /** RFC 5322 References — thread'in onceki Message-ID zinciri */
  references?: string[]
}

interface ComposeSheetProps {
  slug: string
  /** Acma butonu. Controlled mode'da opsiyonel. */
  trigger?: React.ReactNode
  /** Controlled open state. Verilirse trigger'a bakilmaz. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Acilirken form'a yazilacak default degerler. */
  defaults?: ComposeDefaults
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(",")[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Component ───────────────────────────────────────────────────────────────

export function ComposeSheet({
  slug,
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaults,
}: ComposeSheetProps) {
  const t = useTranslations("send")
  const { domains, fetchDomains } = useCompanyDataStore()

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  // Refs feed the close-intercept; effects below keep them current with
  // the latest form values so a user-driven close always sees the
  // up-to-date "is anything worth saving?" answer.
  const dirtyRef = useRef(false)
  const draftSnapshotRef = useRef<ComposeDraft | null>(null)
  const setOpen = useCallback(
    (next: boolean) => {
      // Only intercept user-driven closes. Sends and the explicit
      // reset flow mark the form clean before flipping the sheet, so
      // the confirm dialog never fires on the happy path.
      if (next === false && dirtyRef.current) {
        void (async () => {
          // Üç yollu dialog: Save draft (primary) / Discard (tertiary,
          // destructive) / Keep editing (cancel). Önceki sürümde sadece
          // save / cancel vardı; "discard" eksikti, kullanıcı taslağı
          // çöpe atmak isterse önce save edip sonra Drafts'tan silmek
          // zorundaydı. Tertiary butonu confirm helper'ında opsiyonel.
          const choice = await confirm({
            title: t("closeConfirmTitle"),
            description: t("closeConfirmDesc"),
            confirmText: t("closeSaveDraft"),
            cancelText: t("closeKeepEditing"),
            tertiaryText: t("closeDiscard"),
            tertiaryDestructive: true,
          })
          // Cancel / ESC / backdrop → keep editing, sheet açık kalır.
          if (choice === false) return

          if (choice === true && draftSnapshotRef.current) {
            const snapshot = draftSnapshotRef.current
            // 1. Local-first persistence — survives a network failure
            //    or a tab close while the upstream call is in flight.
            useComposeDrafts.getState().save(slug, snapshot)
            // 2. IMAP `\\Drafts` append via mail-server. The dashboard
            //    used to keep drafts only in localStorage; that meant a
            //    fresh browser, mobile app, or Apple Mail couldn't see
            //    them. The mail-server route writes a real RFC 822
            //    message into the canonical Drafts folder so every
            //    client surfaces it.
            try {
              const res = await fetch(
                `/api/companies/${slug}/inbox/drafts`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    mailbox: snapshot.from,
                    from: snapshot.from,
                    to: snapshot.to,
                    cc: snapshot.cc,
                    replyTo: snapshot.replyTo,
                    subject: snapshot.subject || "(no subject)",
                    html: snapshot.html,
                    inReplyTo: snapshot.inReplyTo,
                    references: snapshot.references,
                  }),
                },
              )
              if (res.ok) {
                toast.success(t("draftSaved"))
              } else {
                // IMAP append failed (mail-server unreachable, draft
                // path missing). Local copy is intact; let the user
                // know it didn't make it across devices.
                toast.warning(t("draftSavedLocally"))
              }
            } catch {
              toast.warning(t("draftSavedLocally"))
            }
          }
          // choice === "tertiary" → discard: draft hiç save etmeden
          // sheet kapanır, local + IMAP'e dokunmuyoruz. Çağırıcı için
          // dirty flag temizlenir, formdaki değerler sheet kapandıktan
          // sonra component reset'iyle gider.
          dirtyRef.current = false
          if (!isControlled) setInternalOpen(false)
          onOpenChange?.(false)
        })()
        return
      }
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange, slug, t],
  )

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [catchAllRules, setCatchAllRules] = useState<CatchAllRule[]>([])
  /** initial: ilk açılışta skeleton; sonraki açılışlarda silent refresh. */
  const [initialLoading, setInitialLoading] = useState(true)
  /** Catch-all domain için kullanıcı serbest local-part yazıyor. */
  const [customFromMode, setCustomFromMode] = useState(false)
  const [customLocalPart, setCustomLocalPart] = useState("")
  const [customDomainId, setCustomDomainId] = useState("")

  // Form state
  const [from, setFrom] = useState(defaults?.from ?? "")
  const [toEmails, setToEmails] = useState<string[]>(defaults?.to ?? [])
  const [ccEmails, setCcEmails] = useState<string[]>(defaults?.cc ?? [])
  const [replyTo, setReplyTo] = useState<string[]>(defaults?.replyTo ?? [])
  const [subject, setSubject] = useState(defaults?.subject ?? "")
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [templateLang, setTemplateLang] = useState("")
  const [html, setHtml] = useState(defaults?.body ?? "")
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduledAt, setScheduledAt] = useState("")
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])

  // Threading headers (reply/forward icin set edilir, UI'da gosterilmez)
  const [threadInReplyTo, setThreadInReplyTo] = useState<string | undefined>(
    defaults?.inReplyTo,
  )
  const [threadReferences, setThreadReferences] = useState<string[] | undefined>(
    defaults?.references,
  )

  // Toggle states
  const [showCc, setShowCc] = useState((defaults?.cc?.length ?? 0) > 0)
  const [showReplyTo, setShowReplyTo] = useState(false)

  // Template preview
  const [showPreview, setShowPreview] = useState(true)
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const apiBase = `/api/companies/${slug}`

  // Derive domainId from selected "from" address. Custom mode'da
  // catch-all rule'dan gelen domainId'yi tercih et — `domains` store
  // henüz hydrate olmamış olabilir.
  const selectedDomainId = useMemo(() => {
    if (customFromMode && customDomainId) return customDomainId
    if (!from) return ""
    const mailbox = mailboxes.find((m) => m.email === from)
    if (mailbox?.domainId) return mailbox.domainId
    const fromDomain = from.split("@")[1]
    const catchAll = catchAllRules.find(
      (r) => r.domainName.toLowerCase() === fromDomain?.toLowerCase(),
    )
    if (catchAll) return catchAll.sentroyDomainId
    const domain = domains.find((d) => d.name === fromDomain)
    return domain?.id ?? ""
  }, [customFromMode, customDomainId, from, mailboxes, domains, catchAllRules])

  // ── Data fetching ─────────────────────────────────────────────────────────

  /**
   * Sessiz refresh: skeleton sadece veri hiç yokken (initialLoading)
   * gösterilir. Sheet her açılışta arka planda mailbox/template/catch-all
   * fetch eder; mevcut form gözle görülür şekilde flicker etmez.
   */
  const fetchData = useCallback(async () => {
    try {
      const [mailboxesRes, templatesRes, catchAllRes] = await Promise.all([
        fetch(`${apiBase}/mailboxes`),
        fetch(`${apiBase}/templates`),
        fetch(`${apiBase}/mailboxes/catch-all`),
      ])

      const mailboxesJson = await mailboxesRes.json()
      const templatesJson = await templatesRes.json()
      const catchAllJson = await catchAllRes.json().catch(() => ({}))

      if (mailboxesRes.ok && mailboxesJson.data) {
        setMailboxes(
          (mailboxesJson.data as Array<Record<string, unknown>>).map((m) => ({
            email: m.email as string,
            domainId: m.domainId as string | undefined,
          }))
        )
      }

      if (templatesRes.ok && templatesJson.data) {
        setTemplates(
          (templatesJson.data as Array<Record<string, unknown>>).map((tpl) => ({
            id: tpl.id as string,
            name: (tpl.name as LocalizedString) ?? "",
            subject: (tpl.subject as LocalizedString) ?? "",
            mjmlBody: (tpl.mjmlBody as LocalizedString) ?? "",
            variables: (tpl.variables as string[]) ?? [],
            domainId: tpl.domainId as string | undefined,
          }))
        )
      }

      if (catchAllRes.ok && Array.isArray(catchAllJson.data)) {
        setCatchAllRules(
          (catchAllJson.data as Array<Record<string, unknown>>).map((r) => ({
            sentroyDomainId: r.sentroyDomainId as string,
            domainName: r.domainName as string,
            targetMailboxEmail: r.targetMailboxEmail as string,
          })),
        )
      }
    } catch {
      // silent
    } finally {
      setInitialLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    if (open) {
      fetchDomains(slug)
      fetchData()
    }
  }, [open, slug, fetchDomains, fetchData])

  // Auto-select first mailbox (custom mode aktifken atla)
  useEffect(() => {
    if (mailboxes.length > 0 && !from && !customFromMode) {
      setFrom(mailboxes[0].email)
    }
  }, [mailboxes, from, customFromMode])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const selectedTemplate = useMemo(
    () =>
      selectedTemplateId && selectedTemplateId !== "none"
        ? templates.find((t) => t.id === selectedTemplateId)
        : undefined,
    [selectedTemplateId, templates],
  )

  const templateLangs = useMemo(
    () => (selectedTemplate ? localizedLanguages(selectedTemplate.name) : []),
    [selectedTemplate],
  )

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId)
    setVariableValues({})

    if (templateId && templateId !== "none") {
      const tpl = templates.find((t) => t.id === templateId)
      if (tpl) {
        const langs = localizedLanguages(tpl.name)
        const lang = langs.includes("en") ? "en" : langs[0] || ""
        setTemplateLang(lang)
        setSubject(resolveLocalized(tpl.subject, lang))
        // Pre-populate variables with empty strings so UI renders inputs
        const vars: Record<string, string> = {}
        for (const name of tpl.variables || []) vars[name] = ""
        setVariableValues(vars)
      }
    } else {
      setTemplateLang("")
    }
  }

  function handleTemplateLangChange(lang: string) {
    setTemplateLang(lang)
    if (selectedTemplate) {
      setSubject(resolveLocalized(selectedTemplate.subject, lang))
    }
  }

  // Template seçiliyken HTML'i client-side render et
  const previewHtml = useMemo(() => {
    if (!selectedTemplate) return ""
    const rawBody = resolveLocalized(
      selectedTemplate.mjmlBody,
      templateLang,
    )
    // {var} ve {{var}} kalıplarını değişken değerleriyle değiştir
    let rendered = rawBody
    for (const [key, value] of Object.entries(variableValues)) {
      if (!value) continue
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      rendered = rendered.replace(
        new RegExp(`\\{\\{?${escaped}\\}?\\}`, "g"),
        value,
      )
    }
    return rendered
  }, [selectedTemplate, templateLang, variableValues])

  // Iframe'e önizleme içeriğini yaz — srcDoc'tan daha güvenilir
  useEffect(() => {
    const iframe = previewIframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return
    doc.open()
    doc.write(previewHtml || "")
    doc.close()
  }, [previewHtml, showPreview])

  async function handleAttachFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return

    const newAttachments: AttachmentFile[] = []
    for (const file of Array.from(files)) {
      const base64 = await fileToBase64(file)
      newAttachments.push({
        file,
        name: file.name,
        size: file.size,
        base64,
        contentType: file.type || "application/octet-stream",
      })
    }

    setAttachments((prev) => [...prev, ...newAttachments])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleRemoveAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const searchContacts = useCallback(
    async (query: string): Promise<ContactSuggestion[]> => {
      try {
        const res = await fetch(
          `${apiBase}/audience/contacts?q=${encodeURIComponent(query)}`
        )
        const json = await res.json()
        if (!res.ok || !json.data) return []
        return (json.data as Array<{ email: string; name?: string }>).map(
          (c) => ({ email: c.email, name: c.name })
        )
      } catch {
        return []
      }
    },
    [apiBase]
  )

  const resetForm = useCallback(() => {
    setToEmails(defaults?.to ?? [])
    setCcEmails(defaults?.cc ?? [])
    setReplyTo(defaults?.replyTo ?? [])
    setSubject(defaults?.subject ?? "")
    setSelectedTemplateId("")
    setTemplateLang("")
    setHtml(defaults?.body ?? "")
    setVariableValues({})
    setScheduleEnabled(false)
    setScheduledAt("")
    setAttachments([])
    setShowCc((defaults?.cc?.length ?? 0) > 0)
    setShowReplyTo((defaults?.replyTo?.length ?? 0) > 0)
    if (defaults?.from) setFrom(defaults.from)
    setThreadInReplyTo(defaults?.inReplyTo)
    setThreadReferences(defaults?.references)
  }, [defaults])

  // Keep the dirty/draft refs current so the close intercept always
  // sees the latest form snapshot. We refresh on every keystroke; the
  // refs are O(1) writes so this is cheaper than re-rendering anything.
  useEffect(() => {
    const snapshot: ComposeDraft = {
      savedAt: Date.now(),
      from,
      to: toEmails,
      cc: ccEmails,
      replyTo,
      subject,
      html,
      scheduleEnabled,
      scheduledAt,
      inReplyTo: threadInReplyTo,
      references: threadReferences,
    }
    draftSnapshotRef.current = snapshot
    dirtyRef.current = isDraftDirty(snapshot)
  }, [
    from,
    toEmails,
    ccEmails,
    replyTo,
    subject,
    html,
    scheduleEnabled,
    scheduledAt,
    threadInReplyTo,
    threadReferences,
  ])

  // First open with no defaults — try to restore the user's last
  // unfinished draft. Defaults beat the draft (reply/forward flow has
  // its own state); if we restored anyway we'd clobber the threading.
  const draftRestoredRef = useRef(false)
  useEffect(() => {
    if (!open) return
    if (draftRestoredRef.current) return
    if (defaults?.subject || defaults?.body || defaults?.to?.length) return
    const stored = useComposeDrafts.getState().load(slug)
    if (!stored || !isDraftDirty(stored)) return
    draftRestoredRef.current = true
    if (stored.from) setFrom(stored.from)
    if (stored.to) setToEmails(stored.to)
    if (stored.cc) {
      setCcEmails(stored.cc)
      if (stored.cc.length > 0) setShowCc(true)
    }
    if (stored.replyTo) {
      setReplyTo(stored.replyTo)
      if (stored.replyTo.length > 0) setShowReplyTo(true)
    }
    if (stored.subject) setSubject(stored.subject)
    if (stored.html) setHtml(stored.html)
    if (stored.scheduleEnabled) setScheduleEnabled(stored.scheduleEnabled)
    if (stored.scheduledAt) setScheduledAt(stored.scheduledAt)
    if (stored.inReplyTo) setThreadInReplyTo(stored.inReplyTo)
    if (stored.references) setThreadReferences(stored.references)
    toast.info(t("draftRestored"))
  }, [open, defaults, slug, t])

  // Controlled mode'da open degistiginde ve defaults varsa form'u yeniden kur
  const prevOpenRef = useRef(open)
  useEffect(() => {
    if (!prevOpenRef.current && open) {
      resetForm()
    }
    prevOpenRef.current = open
  }, [open, resetForm])

  async function handleSend() {
    if (!from) {
      toast.error(t("fromRequired"))
      return
    }
    if (toEmails.length === 0) {
      toast.error(t("toRequired"))
      return
    }
    if (!subject) {
      toast.error(t("subjectRequired"))
      return
    }
    if (!selectedDomainId) {
      toast.error(t("fromRequired"))
      return
    }

    setSending(true)
    try {
      const isBatch = toEmails.length > 1

      // Sadece dolu değişkenleri gönder
      const parsedVars: Record<string, string> = {}
      for (const [k, v] of Object.entries(variableValues)) {
        if (v && v.trim()) parsedVars[k] = v.trim()
      }

      const payload: Record<string, unknown> = {
        from,
        subject,
        domainId: selectedDomainId,
      }

      if (selectedTemplateId && selectedTemplateId !== "none") {
        payload.templateId = selectedTemplateId
        if (templateLang) payload.lang = templateLang
      } else if (html.trim()) {
        payload.html = html
      }

      if (ccEmails.length > 0) payload.cc = ccEmails.join(", ")
      if (replyTo.length > 0) payload.replyTo = replyTo[0]

      // RFC 5322 threading headers (reply/forward icin set edilmis ise)
      if (threadInReplyTo) payload.inReplyTo = threadInReplyTo
      if (threadReferences && threadReferences.length > 0) {
        payload.references = threadReferences
      }

      if (scheduleEnabled && scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString()
      }

      if (attachments.length > 0) {
        payload.attachments = attachments.map((att) => ({
          filename: att.name,
          content: att.base64,
          contentType: att.contentType,
        }))
      }

      const hasVars = Object.keys(parsedVars).length > 0

      if (isBatch) {
        payload.recipients = toEmails.map((email) => ({
          to: email,
          variables: hasVars ? parsedVars : undefined,
        }))
      } else {
        payload.to = toEmails[0]
        if (hasVars) payload.variables = parsedVars
      }

      // Gmail-style 5-second undo. The compose sheet closes immediately
      // so the user can move on, but the actual POST waits behind a
      // cancellable timer; an `Undo` action on the toast aborts the
      // timer cleanly. We persist the draft up-front so an undo (or a
      // page reload during the window) leaves the user's text intact —
      // a successful send drops the draft at the end.
      if (draftSnapshotRef.current) {
        useComposeDrafts.getState().save(slug, draftSnapshotRef.current)
      }
      dirtyRef.current = false
      const sheetWasOpen = open
      resetForm()
      setOpen(false)

      const UNDO_WINDOW_MS = 5_000
      let cancelled = false
      const timer = setTimeout(async () => {
        if (cancelled) return
        try {
          const res = await fetch(`${apiBase}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
          const json = await res.json()
          if (!res.ok) {
            throw new Error(json.error || "Failed to send email")
          }
          toast.success(isBatch ? t("batchSent") : t("sent"))
          // Success — discard the persisted draft. Failures keep it so
          // the user can reopen compose and retry without retyping.
          useComposeDrafts.getState().clear(slug)
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Failed to send email"
          toast.error(message)
        } finally {
          setSending(false)
        }
      }, UNDO_WINDOW_MS)

      toast(t("sendingWithUndo"), {
        duration: UNDO_WINDOW_MS,
        action: {
          label: t("undo"),
          onClick: () => {
            cancelled = true
            clearTimeout(timer)
            setSending(false)
            toast.success(t("sendCancelled"))
            // Draft is still on disk — if the user wants to keep
            // editing, reopening compose will restore it. We silently
            // skip auto-reopening to avoid yanking the focus context.
            void sheetWasOpen
          },
        },
      })
      return
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send email"
      toast.error(message)
    } finally {
      // Note: when the undo path returns above, `setSending(false)`
      // happens inside the timer callback so the button stays disabled
      // until either the send completes or the user undoes it.
      if (!sending) setSending(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isCustomBody =
    !selectedTemplateId || selectedTemplateId === "none"

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger && <SheetTrigger render={trigger as React.ReactElement} />}
      <SheetContent
        side="right"
        showCloseButton={false}
        className="!w-full !max-w-2xl p-0 bg-background"
      >
        {/* h-full + overflow-hidden zorunlu: SheetContent flex parent;
         *  outer wrapper kendi children'ını sheet boyu içinde tutmadan
         *  flex-1 + ScrollArea kombinasyonu scroll tetiklemez, içerik
         *  taşar. min-h-0 da ScrollArea'da aynı sebep — flex item içeriğe
         *  göre büyüyüp scroll'u devre dışı bırakmasın. */}
        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
              <h2 className="text-base font-semibold">{t("newMessage")}</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Toggle buttons for optional fields */}
              <Button
                variant={showCc ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowCc(!showCc)}
              >
                {t("cc")}
              </Button>
              <Button
                variant={showReplyTo ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowReplyTo(!showReplyTo)}
              >
                {t("replyTo")}
              </Button>

              <Button
                variant={scheduleEnabled ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                title={t("schedule")}
              >
                <HugeiconsIcon
                  icon={Calendar03Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </Button>
            </div>
          </div>

          {initialLoading ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
              <Skeleton className="h-[200px] w-full" />
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-0 px-5 pt-3 pb-5">
                {/* From */}
                <div className="flex items-center gap-3 border-b py-2">
                  <Label className="w-16 shrink-0 text-xs text-muted-foreground">
                    {t("from")}
                  </Label>
                  <div className="flex-1">
                    {customFromMode ? (
                      <CustomFromInput
                        localPart={customLocalPart}
                        onLocalPartChange={(value) => {
                          setCustomLocalPart(value)
                          const domain = catchAllRules.find(
                            (r) => r.sentroyDomainId === customDomainId,
                          )
                          if (domain && value) {
                            setFrom(`${value}@${domain.domainName}`)
                          } else {
                            setFrom("")
                          }
                        }}
                        domainId={customDomainId}
                        onDomainIdChange={(id) => {
                          if (!id) return
                          setCustomDomainId(id)
                          const domain = catchAllRules.find(
                            (r) => r.sentroyDomainId === id,
                          )
                          if (domain && customLocalPart) {
                            setFrom(`${customLocalPart}@${domain.domainName}`)
                          }
                        }}
                        catchAllRules={catchAllRules}
                        onClose={() => {
                          setCustomFromMode(false)
                          setCustomLocalPart("")
                          setCustomDomainId("")
                          if (mailboxes[0]) setFrom(mailboxes[0].email)
                          else setFrom("")
                        }}
                        t={t}
                      />
                    ) : mailboxes.length > 0 ? (
                      <Select
                        value={from}
                        onValueChange={(v) => {
                          if (v === "__custom__") {
                            const firstRule = catchAllRules[0]
                            if (firstRule) {
                              setCustomFromMode(true)
                              setCustomDomainId(firstRule.sentroyDomainId)
                              setCustomLocalPart("")
                              setFrom("")
                            }
                            return
                          }
                          setFrom(v || "")
                        }}
                      >
                        <SelectTrigger className="h-8 border-0 bg-muted/30 shadow-none focus:ring-0">
                          <span className="truncate text-sm">
                            {from || t("selectFrom")}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {mailboxes.map((m) => (
                            <SelectItem
                              key={m.email}
                              value={m.email}
                              label={m.email}
                            >
                              {m.email}
                            </SelectItem>
                          ))}
                          {catchAllRules.length > 0 && (
                            <SelectItem
                              value="__custom__"
                              label={t("customAddress")}
                              className="border-t"
                            >
                              <span className="text-primary">
                                {t("customAddress")}
                              </span>
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        placeholder="sender@example.com"
                        className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      />
                    )}
                  </div>
                </div>

                {/* To */}
                <div className="flex items-center gap-3 border-b py-2">
                  <Label className="w-16 shrink-0 self-start pt-1.5 text-xs text-muted-foreground">
                    {t("to")}
                  </Label>
                  <EmailChipsInput
                    value={toEmails}
                    onChange={setToEmails}
                    placeholder={t("toPlaceholder")}
                    onSearch={searchContacts}
                    className="flex-1"
                  />
                </div>

                {/* CC (conditional) */}
                {showCc && (
                  <div className="flex items-center gap-3 border-b py-2">
                    <Label className="w-16 shrink-0 self-start pt-1.5 text-xs text-muted-foreground">
                      {t("cc")}
                    </Label>
                    <EmailChipsInput
                      value={ccEmails}
                      onChange={setCcEmails}
                      placeholder={t("ccPlaceholder")}
                      onSearch={searchContacts}
                      className="flex-1"
                    />
                  </div>
                )}

                {/* Reply-To (conditional) */}
                {showReplyTo && (
                  <div className="flex items-center gap-3 border-b py-2">
                    <Label className="w-16 shrink-0 text-xs text-muted-foreground">
                      {t("replyTo")}
                    </Label>
                    <EmailChipsInput
                      value={replyTo}
                      onChange={setReplyTo}
                      placeholder={t("replyToPlaceholder")}
                      className="flex-1"
                    />
                  </div>
                )}

                {/* Subject */}
                <div className="flex items-center gap-3 border-b py-2">
                  <Label className="w-16 shrink-0 text-xs text-muted-foreground">
                    {t("subject")}
                  </Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t("subjectPlaceholder")}
                    disabled={!!selectedTemplate}
                    readOnly={!!selectedTemplate}
                    className="h-8 border-0 bg-muted/30 shadow-none focus-visible:ring-0 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Template selector */}
                <div className="flex items-center gap-3 border-b py-2">
                  <Label className="w-16 shrink-0 text-xs text-muted-foreground">
                    {t("template")}
                  </Label>
                  <div className="flex-1">
                    <Select
                      value={selectedTemplateId || "none"}
                      onValueChange={(v) => handleTemplateChange(v || "")}
                    >
                      <SelectTrigger className="h-8 border-0 bg-muted/30 shadow-none focus:ring-0">
                        <span className="truncate text-sm">
                          {selectedTemplate
                            ? resolveLocalized(selectedTemplate.name, templateLang)
                            : t("noTemplate")}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t("noTemplate")}
                        </SelectItem>
                        {templates.map((tpl) => (
                          <SelectItem key={tpl.id} value={tpl.id}>
                            {resolveLocalized(tpl.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Template language selector */}
                {selectedTemplate && templateLangs.length > 1 && (
                  <div className="flex items-center gap-3 border-b py-2">
                    <Label className="w-16 shrink-0 text-xs text-muted-foreground">
                      {t("template")} — Lang
                    </Label>
                    <div className="flex flex-wrap gap-1">
                      {templateLangs.map((lang) => (
                        <Button
                          key={lang}
                          type="button"
                          variant={templateLang === lang ? "secondary" : "ghost"}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleTemplateLangChange(lang)}
                        >
                          <span className="uppercase">{lang}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Body - HugerteEditor or Variables */}
                <div className="mt-3 space-y-2">
                  {isCustomBody ? (
                    <>
                      <ComposeAiPanel
                        slug={slug}
                        body={html}
                        subject={subject}
                        senderName={from || undefined}
                        onApply={(next) => {
                          if (next.subject !== undefined) setSubject(next.subject)
                          setHtml(next.bodyHtml)
                        }}
                      />
                      <HugerteEditor
                        initialValue={html}
                        onEditorChange={setHtml}
                        height={280}
                        showHtmlToggle
                        placeholder={t("body")}
                        toolbar="blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | link image | align lineheight | bullist numlist | removeformat undo redo"
                        plugins="advlist autolink lists link image charmap searchreplace visualblocks code fullscreen insertdatetime table wordcount"
                        menubar={false}
                        statusbar={false}
                      />
                    </>
                  ) : (
                    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Variables
                        </Label>
                        {selectedTemplate && (
                          <span className="text-[10px] text-muted-foreground">
                            {(selectedTemplate.variables || []).length} field
                            {(selectedTemplate.variables || []).length === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      {selectedTemplate && (selectedTemplate.variables || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          This template has no variables.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {(selectedTemplate?.variables || []).map((varName) => (
                            <div
                              key={varName}
                              className="flex items-center gap-2"
                            >
                              <code className="w-28 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                {`{${varName}}`}
                              </code>
                              <Input
                                value={variableValues[varName] || ""}
                                onChange={(e) =>
                                  setVariableValues((prev) => ({
                                    ...prev,
                                    [varName]: e.target.value,
                                  }))
                                }
                                placeholder={`Value for ${varName}`}
                                className="h-7 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Template preview */}
                {selectedTemplate && (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl border bg-muted/20 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("preview")}
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => setShowPreview((v) => !v)}
                      >
                        {showPreview ? t("hidePreview") : t("showPreview")}
                      </Button>
                    </div>
                    {showPreview && (
                      <div className="overflow-hidden rounded-lg border bg-white">
                        <iframe
                          ref={previewIframeRef}
                          title={t("preview")}
                          sandbox="allow-same-origin"
                          className="h-[320px] w-full bg-white"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {attachments.map((att, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-1.5"
                      >
                        <HugeiconsIcon
                          icon={Attachment01Icon}
                          strokeWidth={2}
                          className="size-3.5 text-muted-foreground"
                        />
                        <span className="max-w-[160px] truncate text-xs">
                          {att.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatFileSize(att.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(i)}
                          className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            strokeWidth={2}
                            className="size-3"
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Schedule */}
                {scheduleEnabled && (
                  <div className="mt-3">
                    <DateTimePicker
                      value={scheduledAt || undefined}
                      onChange={(val) => setScheduledAt(val ?? "")}
                      placeholder={t("pickDate")}
                      min={new Date()}
                    />
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Footer toolbar */}
          <div className="flex items-center gap-2 border-t px-5 py-3">
            <Button
              disabled={sending || initialLoading}
              onClick={handleSend}
              size="sm"
            >
              {sending && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {sending
                ? t("sending")
                : scheduleEnabled
                  ? t("sendScheduled")
                  : t("sendNow")}
            </Button>

            <div className="flex items-center gap-1 ml-auto">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleAttachFiles}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
                title={t("attachFiles")}
              >
                <HugeiconsIcon
                  icon={Attachment01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </Button>

             
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Catch-all aktif domain için serbest local-part girişi. Domain dropdown'u
 * yalnızca aktif catch-all kuralı olan domain'leri listeler. Local-part
 * basit RFC sanitize edilir (boşluk/@ atılır); validation backend'de
 * tekrar yapılır (mailbox + catch-all rule).
 */
function CustomFromInput({
  localPart,
  onLocalPartChange,
  domainId,
  onDomainIdChange,
  catchAllRules,
  onClose,
  t,
}: {
  localPart: string
  onLocalPartChange: (value: string) => void
  domainId: string
  onDomainIdChange: (id: string) => void
  catchAllRules: CatchAllRule[]
  onClose: () => void
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={localPart}
        onChange={(e) =>
          onLocalPartChange(e.target.value.replace(/[\s@]/g, "").toLowerCase())
        }
        placeholder={t("customLocalPartPlaceholder")}
        className="h-8 flex-1 border-0 bg-muted/30 px-2 shadow-none focus-visible:ring-0 min-w-[9.5rem]"
      />
      <span className="text-sm text-muted-foreground">@</span>
      {catchAllRules.length > 1 ? (
        <Select value={domainId} onValueChange={(v) => v && onDomainIdChange(v)}>
          <SelectTrigger className="h-8 min-w-[140px] border-0 bg-muted/30 shadow-none focus:ring-0">
            <span className="truncate text-sm">
              {catchAllRules.find((r) => r.sentroyDomainId === domainId)
                ?.domainName || ""}
            </span>
          </SelectTrigger>
          <SelectContent>
            {catchAllRules.map((r) => (
              <SelectItem
                key={r.sentroyDomainId}
                value={r.sentroyDomainId}
                label={r.domainName}
              >
                {r.domainName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-sm font-medium">
          {catchAllRules.find((r) => r.sentroyDomainId === domainId)
            ?.domainName || ""}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        title={t("cancelCustomAddress")}
        className="size-7"
      >
        <HugeiconsIcon
          icon={Cancel01Icon}
          strokeWidth={2}
          className="size-3.5"
        />
      </Button>
    </div>
  )
}

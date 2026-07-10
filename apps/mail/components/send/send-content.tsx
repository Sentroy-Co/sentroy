"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  Loading03Icon,
  Calendar03Icon,
  Attachment01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { DateTimePicker } from "@workspace/ui/components/datetime-picker"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  EmailChipsInput,
  type ContactSuggestion,
} from "@workspace/ui/components/email-chips-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { JobStatusCard } from "@/components/send/job-status-card"

const HugerteEditor = dynamic(() => import("@workspace/ui/components/hugerte-editor"), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full rounded-lg" />,
})

interface Mailbox {
  email: string
  domainId?: string
}

interface Template {
  id: string
  name: string
  subject: string
  domainId?: string
}

interface AttachmentFile {
  file: File
  name: string
  size: number
  base64: string
  contentType: string
}

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

export function SendContent() {
  const t = useTranslations("send")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const {
    domains,
    domainsLoading,
    fetchDomains: fetchStoreDomains,
  } = useCompanyDataStore()

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  const [from, setFrom] = useState("")
  const [toEmails, setToEmails] = useState<string[]>([])
  const [ccEmails, setCcEmails] = useState<string[]>([])
  const [replyTo, setReplyTo] = useState("")
  const [subject, setSubject] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [html, setHtml] = useState("")
  const [variables, setVariables] = useState("")
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduledAt, setScheduledAt] = useState("")
  const [sending, setSending] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<AttachmentFile[]>([])

  const [showCc, setShowCc] = useState(false)
  const [showReplyTo, setShowReplyTo] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const apiBase = `/api/companies/${slug}`

  // Derive domainId from selected "from" address
  const selectedDomainId = useMemo(() => {
    if (!from) return ""
    const mailbox = mailboxes.find((m) => m.email === from)
    if (mailbox?.domainId) return mailbox.domainId
    const fromDomain = from.split("@")[1]
    const domain = domains.find((d) => d.name === fromDomain)
    return domain?.id ?? ""
  }, [from, mailboxes, domains])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [mailboxesRes, templatesRes] = await Promise.all([
        fetch(`${apiBase}/mailboxes`),
        fetch(`${apiBase}/templates`),
      ])

      const mailboxesJson = await mailboxesRes.json()
      const templatesJson = await templatesRes.json()

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
          (templatesJson.data as Array<Record<string, unknown>>).map(
            (tpl) => ({
              id: tpl.id as string,
              name: tpl.name as string,
              subject: tpl.subject as string,
              domainId: tpl.domainId as string | undefined,
            })
          )
        )
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load data"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchStoreDomains(slug)
    fetchData()
  }, [fetchStoreDomains, slug, fetchData])

  useEffect(() => {
    if (mailboxes.length > 0 && !from) {
      setFrom(mailboxes[0].email)
    }
  }, [mailboxes, from])

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

  function handleTemplateChange(templateId: string) {
    setSelectedTemplateId(templateId)
    if (templateId && templateId !== "none") {
      const tpl = templates.find((t) => t.id === templateId)
      if (tpl) setSubject(tpl.subject)
    }
  }

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

      let parsedVars: Record<string, string> | undefined
      if (variables.trim()) {
        try {
          parsedVars = JSON.parse(variables)
        } catch {
          toast.error("Variables must be valid JSON")
          setSending(false)
          return
        }
      }

      const payload: Record<string, unknown> = {
        from,
        subject,
        domainId: selectedDomainId,
      }

      if (selectedTemplateId && selectedTemplateId !== "none") {
        payload.templateId = selectedTemplateId
      } else if (html.trim()) {
        payload.html = html
      }

      if (ccEmails.length > 0) payload.cc = ccEmails.join(", ")
      if (replyTo.trim()) payload.replyTo = replyTo.trim()

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

      if (isBatch) {
        payload.recipients = toEmails.map((email: string) => ({
          to: email,
          variables: parsedVars,
        }))
      } else {
        payload.to = toEmails[0]
        if (parsedVars) payload.variables = parsedVars
      }

      const res = await fetch(`${apiBase}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || "Failed to send email")
      }

      if (isBatch) {
        toast.success(t("batchSent"))
        const data = json.data as Record<string, unknown>
        if (data?.jobId) {
          setJobId(data.jobId as string)
        }
      } else {
        toast.success(t("sent"))
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send email"
      toast.error(message)
    } finally {
      setSending(false)
    }
  }

  if (loading || domainsLoading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </PageTransition>
    )
  }

  const isCustomBody = !selectedTemplateId || selectedTemplateId === "none"

  return (
    <PageTransition className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-3">
        <HugeiconsIcon
          icon={Mail01Icon}
          strokeWidth={1.5}
          className="size-7 text-muted-foreground"
        />
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-0 rounded-xl border">
          {/* From */}
          <div className="flex items-center gap-3 border-b px-4 py-2.5">
            <Label className="w-20 shrink-0 text-xs text-muted-foreground">
              {t("from")}
            </Label>
            <div className="flex-1">
              {mailboxes.length > 0 ? (
                <Select
                  value={from}
                  onValueChange={(v) => setFrom(v || "")}
                >
                  <SelectTrigger className="h-8 border-0 bg-transparent px-0 shadow-none focus:ring-0">
                    <span className="truncate text-sm">
                      {from || t("selectFrom")}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {mailboxes.map((m) => (
                      <SelectItem key={m.email} value={m.email}>
                        {m.email}
                      </SelectItem>
                    ))}
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
            {selectedDomainId && (
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {domains.find((d) => d.id === selectedDomainId)?.name}
              </Badge>
            )}
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant={showCc ? "secondary" : "ghost"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setShowCc(!showCc)}
              >
                {t("cc")}
              </Button>
              <Button
                variant={showReplyTo ? "secondary" : "ghost"}
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setShowReplyTo(!showReplyTo)}
              >
                {t("replyTo")}
              </Button>
            </div>
          </div>

          {/* To */}
          <div className="flex items-center gap-3 border-b px-4 py-2.5">
            <Label className="w-20 shrink-0 self-start pt-1.5 text-xs text-muted-foreground">
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

          {/* CC */}
          {showCc && (
            <div className="flex items-center gap-3 border-b px-4 py-2.5">
              <Label className="w-20 shrink-0 self-start pt-1.5 text-xs text-muted-foreground">
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

          {/* Reply-To */}
          {showReplyTo && (
            <div className="flex items-center gap-3 border-b px-4 py-2.5">
              <Label className="w-20 shrink-0 text-xs text-muted-foreground">
                {t("replyTo")}
              </Label>
              <Input
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder={t("replyToPlaceholder")}
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-3 border-b px-4 py-2.5">
            <Label className="w-20 shrink-0 text-xs text-muted-foreground">
              {t("subject")}
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>

          {/* Template selector */}
          <div className="flex items-center gap-3 border-b px-4 py-2.5">
            <Label className="w-20 shrink-0 text-xs text-muted-foreground">
              {t("template")}
            </Label>
            <div className="flex-1">
              <Select
                value={selectedTemplateId || "none"}
                onValueChange={(v) => handleTemplateChange(v || "")}
              >
                <SelectTrigger className="h-8 border-0 bg-transparent px-0 shadow-none focus:ring-0">
                  <span className="truncate text-sm">
                    {selectedTemplateId && selectedTemplateId !== "none"
                      ? templates.find(
                          (tpl) => tpl.id === selectedTemplateId
                        )?.name
                      : t("noTemplate")}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noTemplate")}</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Body */}
          <div className="p-4">
            {isCustomBody ? (
              <HugerteEditor
                initialValue={html}
                onEditorChange={setHtml}
                height={350}
                showHtmlToggle
                placeholder={t("body")}
                toolbar="blocks fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | link image | align lineheight | bullist numlist | removeformat undo redo"
                plugins="advlist autolink lists link image charmap searchreplace visualblocks code fullscreen insertdatetime table wordcount"
                menubar={false}
                statusbar={false}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">
                  Variables (JSON)
                </Label>
                <Textarea
                  value={variables}
                  onChange={(e) => setVariables(e.target.value)}
                  placeholder={'{"name": "John", "company": "Acme"}'}
                  rows={4}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t px-4 py-3">
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
            <div className="border-t px-4 py-3">
              <DateTimePicker
                value={scheduledAt || undefined}
                onChange={(val) => setScheduledAt(val ?? "")}
                placeholder={t("pickDate")}
                min={new Date()}
              />
            </div>
          )}

          {/* Footer toolbar */}
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <Button disabled={sending} onClick={handleSend} size="sm">
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
        </div>

        {/* Sidebar: job status */}
        <div className="flex flex-col gap-4">
          {jobId && <JobStatusCard jobId={jobId} />}
        </div>
      </div>
    </PageTransition>
  )
}

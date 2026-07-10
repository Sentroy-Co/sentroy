"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CloudUploadIcon,
  Loading03Icon,
  Cancel01Icon,
  Alert01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { cn } from "@workspace/ui/lib/utils"

type LocalizedMap = Record<string, string>

/** Input JSON tek bir kayit — gevsek tiplenir, normalize tarafinda dogrulanir. */
interface RawEntry {
  name?: unknown
  subject?: unknown
  content?: unknown
  mjmlBody?: unknown
  variables?: unknown
  description?: unknown
  isActive?: unknown
}

/** Normalize edilmis import adayi — match ve preview icin kullanilir. */
interface NormalizedTemplate {
  name: LocalizedMap | string
  subject: LocalizedMap
  mjmlBody: LocalizedMap
  variables: string[]
  issues: string[] // varsa normalize sirasinda bulunan problemler
}

/** string veya Record<string,string> donebilir. */
function normalizeLocalized(v: unknown): LocalizedMap | string | null {
  if (typeof v === "string") {
    const trimmed = v.trim()
    return trimmed || null
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const obj: LocalizedMap = {}
    for (const [lang, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string" && val.trim()) {
        obj[lang] = val
      }
    }
    return Object.keys(obj).length > 0 ? obj : null
  }
  return null
}

function toStrictLocalized(v: unknown): LocalizedMap | null {
  const n = normalizeLocalized(v)
  if (!n) return null
  if (typeof n === "string") return { en: n }
  return n
}

function normalizeEntry(raw: RawEntry): NormalizedTemplate | null {
  const issues: string[] = []
  const name = normalizeLocalized(raw.name)
  if (!name) return null

  const subject = toStrictLocalized(raw.subject)
  if (!subject) {
    issues.push("subject")
  }

  // JSON'da HTML `content` alani ile de gelebilir (Promptie ornegi).
  // Server MJML bekliyor; MJML compiler dogrudan HTML verdigimizde de genelde
  // tolera eder, onu mjmlBody olarak gonderiyoruz.
  const body =
    toStrictLocalized(raw.mjmlBody) || toStrictLocalized(raw.content)
  if (!body) {
    issues.push("body")
  }

  const variables: string[] = Array.isArray(raw.variables)
    ? raw.variables.filter((v): v is string => typeof v === "string")
    : []

  return {
    name,
    subject: subject || {},
    mjmlBody: body || {},
    variables,
    issues,
  }
}

function displayName(tpl: NormalizedTemplate): string {
  if (typeof tpl.name === "string") return tpl.name
  return tpl.name.en || Object.values(tpl.name)[0] || "(untitled)"
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  onImported: () => void
}

export function TemplateImportDialog({
  open,
  onOpenChange,
  slug,
  onImported,
}: Props) {
  const t = useTranslations("templates")
  const { domains, domainsLoading } = useCompanyDataStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<NormalizedTemplate[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [domainId, setDomainId] = useState("")
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  useEffect(() => {
    if (!open) {
      setFileName(null)
      setParsed([])
      setParseError(null)
      setSelected(new Set())
      setDomainId("")
      setImporting(false)
      setProgress({ done: 0, total: 0 })
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }, [open])

  // Tek aktif domain varsa otomatik sec
  useEffect(() => {
    if (open && !domainId && domains.length > 0) {
      const active = domains.find((d) => d.status === "active") ?? domains[0]
      setDomainId(active.id)
    }
  }, [open, domainId, domains])

  async function handleFile(file: File) {
    setParseError(null)
    setParsed([])
    setSelected(new Set())
    setFileName(file.name)

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const list = Array.isArray(data) ? data : [data]
      const normalized: NormalizedTemplate[] = []
      for (const entry of list) {
        const n = normalizeEntry(entry as RawEntry)
        if (n) normalized.push(n)
      }
      if (normalized.length === 0) {
        setParseError(t("importEmpty"))
        return
      }
      setParsed(normalized)
      // Sorunlu olmayan tum kayitlari varsayilan olarak sec
      const initial = new Set<number>()
      normalized.forEach((tpl, idx) => {
        if (tpl.issues.length === 0) initial.add(idx)
      })
      setSelected(initial)
    } catch (err) {
      setParseError(
        err instanceof Error
          ? `${t("importParseError")}: ${err.message}`
          : t("importParseError"),
      )
    }
  }

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      const importable = parsed
        .map((tpl, i) => (tpl.issues.length === 0 ? i : -1))
        .filter((i) => i !== -1)
      if (prev.size >= importable.length) return new Set()
      return new Set(importable)
    })
  }

  async function handleImport() {
    if (!domainId) {
      toast.error(t("importDomainRequired"))
      return
    }
    const picks = [...selected].sort((a, b) => a - b).map((i) => parsed[i])
    if (picks.length === 0) return

    setImporting(true)
    setProgress({ done: 0, total: picks.length })

    let successCount = 0
    let errorCount = 0

    for (const tpl of picks) {
      try {
        const res = await fetch(`/api/companies/${slug}/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:
              typeof tpl.name === "string" ? { en: tpl.name } : tpl.name,
            subject: tpl.subject,
            mjmlBody: tpl.mjmlBody,
            domainId,
          }),
        })
        if (!res.ok) throw new Error((await res.json()).error || "Failed")
        successCount++
      } catch {
        errorCount++
      } finally {
        setProgress((p) => ({ done: p.done + 1, total: p.total }))
      }
    }

    setImporting(false)
    if (errorCount === 0) {
      toast.success(t("importSuccess", { count: successCount }))
    } else if (successCount > 0) {
      toast.warning(
        t("importPartial", { ok: successCount, fail: errorCount }),
      )
    } else {
      toast.error(t("importFailedAll", { count: errorCount }))
    }

    onImported()
    onOpenChange(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const importableCount = parsed.filter((p) => p.issues.length === 0).length
  const allSelected =
    importableCount > 0 && selected.size >= importableCount

  return (
    <Dialog open={open} onOpenChange={(o) => (importing ? null : onOpenChange(o))}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importDescription")}</DialogDescription>
        </DialogHeader>

        {parsed.length === 0 ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HugeiconsIcon
                icon={CloudUploadIcon}
                strokeWidth={1.8}
                className="size-6"
              />
            </div>
            <div>
              <p className="font-medium">{t("importDrop")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("importDropHint")}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            {parseError && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
                <HugeiconsIcon
                  icon={Alert01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
                {parseError}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* File summary */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  strokeWidth={2}
                  className="size-4 text-emerald-500"
                />
                <span className="truncate text-sm font-medium">
                  {fileName}
                </span>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {t("importFound", { count: parsed.length })}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setParsed([])
                  setFileName(null)
                  setSelected(new Set())
                  if (fileInputRef.current) fileInputRef.current.value = ""
                }}
                disabled={importing}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </Button>
            </div>

            {/* Domain selector */}
            <div className="flex flex-col gap-1.5">
              <Label>{t("importDomain")}</Label>
              <Select
                value={domainId}
                onValueChange={(v) => setDomainId(v ?? "")}
                disabled={importing || domainsLoading}
              >
                <SelectTrigger>
                  {domainId ? domains.find((d) => d.id === domainId)?.name : t("importDomainPlaceholder")}
                </SelectTrigger>
                <SelectContent>
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.status !== "active" && (
                        <span className="ms-2 text-xs text-muted-foreground">
                          ({d.status})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Template list */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>{t("importSelect")}</Label>
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={importing}
                  className="text-xs text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                  {allSelected ? t("importDeselectAll") : t("importSelectAll")}
                </button>
              </div>
              <ScrollArea className="max-h-64 rounded-lg border">
                <div className="flex flex-col divide-y">
                  {parsed.map((tpl, idx) => {
                    const hasIssue = tpl.issues.length > 0
                    const isChecked = selected.has(idx)
                    const langs = Object.keys(tpl.subject)
                    return (
                      <label
                        key={idx}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm transition-colors",
                          hasIssue
                            ? "cursor-not-allowed opacity-60"
                            : "hover:bg-muted/40",
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => !hasIssue && toggle(idx)}
                          disabled={hasIssue || importing}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {displayName(tpl)}
                            </span>
                            {langs.map((l) => (
                              <Badge
                                key={l}
                                variant="outline"
                                className="text-[10px] uppercase"
                              >
                                {l}
                              </Badge>
                            ))}
                          </div>
                          {hasIssue ? (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                              <HugeiconsIcon
                                icon={Alert01Icon}
                                strokeWidth={2}
                                className="size-3"
                              />
                              {t("importMissingFields", {
                                fields: tpl.issues.join(", "),
                              })}
                            </p>
                          ) : (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {tpl.subject.en ||
                                Object.values(tpl.subject)[0] ||
                                ""}
                            </p>
                          )}
                          {tpl.variables.length > 0 && !hasIssue && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {tpl.variables.map((v) => (
                                <code
                                  key={v}
                                  className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground"
                                >
                                  {`{${v}}`}
                                </code>
                              ))}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>

            {importing && progress.total > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("importProgress", {
                  done: progress.done,
                  total: progress.total,
                })}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            {t("cancel")}
          </Button>
          {parsed.length > 0 && (
            <Button
              onClick={handleImport}
              disabled={importing || !domainId || selected.size === 0}
            >
              {importing && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("importRunCount", { count: selected.size })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

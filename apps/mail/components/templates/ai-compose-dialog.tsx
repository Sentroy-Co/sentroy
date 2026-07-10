"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  AiBrain01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { routing } from "@workspace/auth/i18n/routing"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"

type LocalizedMap = Record<string, string>

interface ExampleTemplate {
  id: string
  name: LocalizedMap | string
}

interface ComposedOutput {
  name: LocalizedMap
  subject: LocalizedMap
  body: LocalizedMap
  meta?: { attempts: number; usage?: { totalTokens?: number } }
}

interface AiComposeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** AI çıktısı geldiğinde çağrılır — editor state'ini doldurur. */
  onApply: (data: {
    name: LocalizedMap
    subject: LocalizedMap
    body: LocalizedMap
  }) => void
}

function pickName(n: LocalizedMap | string): string {
  if (typeof n === "string") return n
  return n.en || Object.values(n)[0] || "(untitled)"
}

export function AiComposeDialog({
  open,
  onOpenChange,
  onApply,
}: AiComposeDialogProps) {
  const t = useTranslations("aiCompose")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [examples, setExamples] = useState<ExampleTemplate[]>([])
  const [exampleId, setExampleId] = useState<string>("")
  const [subjectPrompt, setSubjectPrompt] = useState("")
  const [notes, setNotes] = useState("")
  const [selectedLocales, setSelectedLocales] = useState<string[]>(
    () => routing.locales.slice(),
  )
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<ComposedOutput | null>(null)

  // Mount'ta example template listesini çek — sadece dialog açılınca.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/companies/${slug}/templates`)
        const json = await res.json()
        if (cancelled || !res.ok) return
        const list = (json.data ?? []) as Array<{
          id: string
          name: LocalizedMap | string
        }>
        setExamples(list.map((tpl) => ({ id: tpl.id, name: tpl.name })))
      } catch {
        // sessiz — örnek listesi opsiyonel
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, slug])

  // Dialog kapandığında state sıfırlanır — bir sonraki açılışta temiz başla.
  useEffect(() => {
    if (!open) {
      setSubjectPrompt("")
      setNotes("")
      setExampleId("")
      setPreview(null)
      setSelectedLocales(routing.locales.slice())
    }
  }, [open])

  function toggleLocale(l: string) {
    setSelectedLocales((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    )
  }

  async function handleGenerate() {
    if (!subjectPrompt.trim()) return
    if (selectedLocales.length === 0) return
    setGenerating(true)
    setPreview(null)
    try {
      const res = await fetch(
        `/api/companies/${slug}/templates/ai-compose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectPrompt: subjectPrompt.trim(),
            locales: selectedLocales,
            exampleTemplateId: exampleId || undefined,
            notes: notes.trim() || undefined,
          }),
        },
      )
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || t("generateFailed"))
      }
      setPreview(json.data as ComposedOutput)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("generateFailed"))
    } finally {
      setGenerating(false)
    }
  }

  function handleApply() {
    if (!preview) return
    onApply({
      name: preview.name,
      subject: preview.subject,
      body: preview.body,
    })
    onOpenChange(false)
    toast.success(t("applied"))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={AiBrain01Icon} strokeWidth={2} />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("promptLabel")}</Label>
            <textarea
              value={subjectPrompt}
              onChange={(e) => setSubjectPrompt(e.target.value)}
              disabled={generating}
              rows={3}
              placeholder={t("promptPlaceholder")}
              className={cn(
                "min-h-[80px] resize-none rounded-md border bg-background px-3 py-2 text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("exampleLabel")}</Label>
            <Select
              value={exampleId || "none"}
              onValueChange={(v) =>
                setExampleId(!v || v === "none" ? "" : v)
              }
              disabled={generating}
            >
              <SelectTrigger>
                <span className="truncate">
                  {exampleId
                    ? pickName(
                        examples.find((e) => e.id === exampleId)?.name ?? "",
                      )
                    : t("exampleNone")}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("exampleNone")}</SelectItem>
                {examples.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {pickName(ex.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {t("exampleHint")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("localesLabel")}</Label>
            <div className="flex flex-wrap gap-1">
              {routing.locales.map((l) => {
                const active = selectedLocales.includes(l)
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggleLocale(l)}
                    disabled={generating}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs uppercase transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("notesLabel")}</Label>
            <Input
              value={notes}
              onChange={(e) =>
                setNotes((e.target as HTMLInputElement).value)
              }
              disabled={generating}
              placeholder={t("notesPlaceholder")}
            />
          </div>

          {preview && (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5 text-emerald-600" />
                {t("previewTitle")}
                {preview.meta?.usage?.totalTokens && (
                  <span className="ms-auto font-mono text-[10px] opacity-60">
                    {preview.meta.usage.totalTokens} tokens · {preview.meta.attempts}{" "}
                    {preview.meta.attempts === 1 ? "try" : "tries"}
                  </span>
                )}
              </div>
              {Object.keys(preview.subject).map((l) => (
                <div key={l} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground">
                    <span className="rounded bg-background px-1.5 py-0.5 font-medium">
                      {l}
                    </span>
                    <span className="truncate font-mono">
                      {preview.subject[l]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={generating}
          >
            {t("cancel")}
          </Button>
          {preview ? (
            <>
              <Button
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
              >
                {t("regenerate")}
              </Button>
              <Button onClick={handleApply}>
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("apply")}
              </Button>
            </>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={
                generating ||
                !subjectPrompt.trim() ||
                selectedLocales.length === 0
              }
            >
              {generating ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <HugeiconsIcon
                  icon={AiBrain01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
              )}
              {t("generate")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

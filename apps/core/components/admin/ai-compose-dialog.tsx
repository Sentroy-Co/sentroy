"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  AiBrain01Icon,
  Tick02Icon,
  ArrowDown01Icon,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { cn } from "@workspace/ui/lib/utils"

type LocalizedMap = Record<string, string>

interface SystemTemplateLite {
  id: string
  key: string
  name: LocalizedMap
}

interface ComposedOutput {
  name: LocalizedMap
  subject: LocalizedMap
  body: LocalizedMap
  meta?: { attempts: number; usage?: { totalTokens?: number } }
}

interface AiModel {
  id: string
  name: string
  provider: string
  description: string | null
  pricingPer1M: { input: number; output: number } | null
  badge: string | null
}

const DEFAULT_MODEL_FALLBACK = "google/gemini-2.0-flash"

function formatPrice(usd: number): string {
  if (usd >= 10) return `$${usd.toFixed(2)}`
  if (usd >= 1) return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(3)}`
}

interface AdminAiComposeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (data: {
    name: LocalizedMap
    subject: LocalizedMap
    body: LocalizedMap
  }) => void
}

function pickName(t: SystemTemplateLite): string {
  return t.name?.en || Object.values(t.name ?? {})[0] || t.key
}

/**
 * Admin template-library editor için AI compose dialog. User-side
 * mail/components/templates/ai-compose-dialog.tsx ile aynı UX —
 * fark sadece API yolu (admin scope) ve örnek kaynağı (system
 * koleksiyonu).
 */
export function AdminAiComposeDialog({
  open,
  onOpenChange,
  onApply,
}: AdminAiComposeDialogProps) {
  const t = useTranslations("aiCompose")

  const [examples, setExamples] = useState<SystemTemplateLite[]>([])
  const [exampleId, setExampleId] = useState("")
  const [subjectPrompt, setSubjectPrompt] = useState("")
  const [notes, setNotes] = useState("")
  // Default to a single locale (the routing default) so first-shot
  // generations stay cheap on token usage. Users can opt extra
  // locales in via the toggle row below — the cost only grows when
  // they actually need multilingual output.
  const [selectedLocales, setSelectedLocales] = useState<string[]>(() => [
    routing.defaultLocale,
  ])
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<ComposedOutput | null>(null)
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_FALLBACK)
  const [models, setModels] = useState<AiModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/template-library")
        const json = await res.json()
        if (cancelled || !res.ok) return
        const list = (json.data ?? []) as SystemTemplateLite[]
        setExamples(list)
      } catch {
        // sessiz — örnekler opsiyonel
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setSubjectPrompt("")
      setNotes("")
      setExampleId("")
      setPreview(null)
      setSelectedLocales([routing.defaultLocale])
    }
  }, [open])

  // Model katalogu — Vercel AI Gateway'den dinamik. Cache server-side
  // 1 saatlik; her dialog açılışında bir GET, çoğu zaman cache hit.
  useEffect(() => {
    if (!open || models.length > 0) return
    let cancelled = false
    setModelsLoading(true)
    ;(async () => {
      try {
        const res = await fetch("/api/admin/ai/models?type=language")
        const json = await res.json()
        if (cancelled || !res.ok) return
        const list = (json.data?.models ?? []) as AiModel[]
        setModels(list)
        // İlk açılışta default'u seç — gemini varsa onu, yoksa list[0].
        const preferred =
          list.find((m) => m.id === DEFAULT_MODEL_FALLBACK) ?? list[0]
        if (preferred) setModelId(preferred.id)
      } catch {
        // sessiz — modelId fallback default'ta kalır
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, models.length])

  const groupedModels = useMemo(() => {
    const groups = new Map<string, AiModel[]>()
    for (const m of models) {
      const arr = groups.get(m.provider) ?? []
      arr.push(m)
      groups.set(m.provider, arr)
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [models])

  const selectedModel = models.find((m) => m.id === modelId) ?? null

  function toggleLocale(l: string) {
    setSelectedLocales((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    )
  }

  async function handleGenerate() {
    if (!subjectPrompt.trim() || selectedLocales.length === 0) return
    setGenerating(true)
    setPreview(null)
    try {
      const res = await fetch("/api/admin/template-library/ai-compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectPrompt: subjectPrompt.trim(),
          locales: selectedLocales,
          exampleTemplateId: exampleId || undefined,
          notes: notes.trim() || undefined,
          model: modelId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("generateFailed"))
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
      {/* Overlay z-index bumped — this dialog opens nested inside the
          template editor dialog. Without an explicit z higher than the
          parent overlay (z-50) the backdrop ends up behind the parent
          and looks transparent. */}
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto z-[70]"
        overlayClassName="z-[60]"
      >
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
              onValueChange={(v) => setExampleId(!v || v === "none" ? "" : v)}
              disabled={generating}
            >
              <SelectTrigger>
                <span className="truncate">
                  {exampleId
                    ? pickName(
                        examples.find((e) => e.id === exampleId) ?? {
                          id: "",
                          key: "",
                          name: {},
                        },
                      )
                    : t("exampleNone")}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("exampleNone")}</SelectItem>
                {examples.map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {pickName(ex)}
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
            <Label className="text-xs">{t("modelLabel")}</Label>
            <Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={modelPickerOpen}
                    disabled={generating || modelsLoading}
                    className="h-auto w-full justify-between gap-2 px-3 py-2 text-start font-normal"
                  />
                }
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {selectedModel ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {selectedModel.name}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                          {selectedModel.provider}
                        </span>
                        {selectedModel.badge && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] capitalize text-primary">
                            {selectedModel.badge}
                          </span>
                        )}
                      </div>
                      {selectedModel.pricingPer1M && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          in {formatPrice(selectedModel.pricingPer1M.input)} ·
                          out {formatPrice(selectedModel.pricingPer1M.output)} /
                          1M tok
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {modelsLoading
                        ? t("modelsLoading")
                        : modelId || t("modelLabel")}
                    </span>
                  )}
                </div>
                <HugeiconsIcon
                  icon={modelsLoading ? Loading03Icon : ArrowDown01Icon}
                  strokeWidth={2}
                  className={cn(
                    "size-4 shrink-0 opacity-60",
                    modelsLoading && "animate-spin",
                  )}
                />
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[420px] p-0">
                <Command>
                  <CommandInput placeholder={t("modelSearchPlaceholder")} />
                  <CommandList className="max-h-[360px]">
                    <CommandEmpty>{t("modelEmpty")}</CommandEmpty>
                    {groupedModels.map(([provider, providerModels]) => (
                      <CommandGroup key={provider} heading={provider}>
                        {providerModels.map((m) => (
                          <CommandItem
                            key={m.id}
                            value={`${m.provider} ${m.name} ${m.id}`}
                            onSelect={() => {
                              setModelId(m.id)
                              setModelPickerOpen(false)
                            }}
                            className="flex flex-col items-start gap-1"
                          >
                            <div className="flex w-full items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {m.name}
                              </span>
                              {m.badge && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] capitalize text-muted-foreground">
                                  {m.badge}
                                </span>
                              )}
                              {m.id === modelId && (
                                <HugeiconsIcon
                                  icon={Tick02Icon}
                                  strokeWidth={2.5}
                                  className="ms-auto size-3.5 text-emerald-600"
                                />
                              )}
                            </div>
                            {m.pricingPer1M ? (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                in {formatPrice(m.pricingPer1M.input)} · out{" "}
                                {formatPrice(m.pricingPer1M.output)} / 1M tok
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                {t("modelPricingUnknown")}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground">
              {t("modelHint")}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("notesLabel")}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes((e.target as HTMLInputElement).value)}
              disabled={generating}
              placeholder={t("notesPlaceholder")}
            />
          </div>

          {preview && (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  className="size-3.5 text-emerald-600"
                />
                {t("previewTitle")}
                {preview.meta?.usage?.totalTokens && (
                  <span className="ms-auto font-mono text-[10px] opacity-60">
                    {preview.meta.usage.totalTokens} tokens ·{" "}
                    {preview.meta.attempts}{" "}
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

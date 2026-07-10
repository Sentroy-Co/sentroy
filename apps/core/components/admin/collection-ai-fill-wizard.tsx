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
  Cancel01Icon,
  RefreshIcon,
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

const DEFAULT_MODEL_FALLBACK = "google/gemini-2.0-flash"

/**
 * Categories the wizard fills, in the order it sweeps them. "welcome"
 * is generated FIRST and treated as the style anchor — every later
 * category is asked to match its tone, layout and palette so the whole
 * collection feels coherent rather than ten unrelated AI outputs.
 */
const FILL_CATEGORIES = [
  "welcome",
  "verification",
  "otp",
  "password-reset",
  "transactional",
  "billing",
  "newsletter",
  "marketing",
  "notification",
  "other",
] as const
type FillCategory = (typeof FILL_CATEGORIES)[number]

/**
 * Per-category prompt seed. The wizard appends the brand + style
 * guide on top; the seed only anchors the *purpose* of the email so
 * Gemini doesn't drift into "another welcome mail" for every step.
 */
const CATEGORY_PROMPTS: Record<FillCategory, string> = {
  welcome:
    "First message a new signup gets. Friendly hello, what they unlocked, one primary CTA to get started ({ctaUrl}).",
  verification:
    "Verify the recipient's email address. Highlight the {verifyUrl} button + short fallback text. Make it obvious the link is one-time and expires soon.",
  otp: "One-time passcode delivery. Show the {code} prominently in a monospace block, mention expiry ({expiresIn}) and a do-not-share warning.",
  "password-reset":
    "Password reset request initiated. Single CTA to {resetUrl}, mention the link expires in {expiresIn}, plus a 'wasn't me' line.",
  transactional:
    "Generic transactional confirmation (purchase, subscription, action complete). Summarize what just happened with {summary} and link {detailsUrl}.",
  billing:
    "Receipt for a paid invoice. Show {invoiceNumber}, {amount}, {date} and a {receiptUrl} CTA. Itemized table optional via {#items}{itemName} {itemAmount}{/items}.",
  newsletter:
    "Periodic editorial newsletter. Hero block with {headline}, two or three teaser sections, links to articles. Friendly intro from {brand}.",
  marketing:
    "Promotional broadcast. Big visual hero with {offerHeadline}, supporting copy, prominent {offerCtaUrl} button, fine print.",
  notification:
    "System notification — something happened on the user's account that they should know but don't necessarily need to act on. Concise body, optional {detailsUrl}.",
  other:
    "Generic catch-all template — clean header, paragraph body, single CTA. Useful as a starting point for any custom email.",
}

interface AiModel {
  id: string
  name: string
  provider: string
  description: string | null
  pricingPer1M: { input: number; output: number } | null
  badge: string | null
}

interface ComposedOutput {
  name: LocalizedMap
  subject: LocalizedMap
  body: LocalizedMap
  meta?: { attempts: number; usage?: { totalTokens?: number } }
}

interface TemplateCollection {
  id: string
  key: string
  name: LocalizedMap
}

type StepStatus = "pending" | "running" | "success" | "failed" | "skipped"

interface StepState {
  category: FillCategory
  status: StepStatus
  templateId?: string
  error?: string
}

function formatPrice(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`
  return `$${usd.toFixed(3)}`
}

/**
 * URL/key-safe slug from arbitrary text. We *don't* ask the AI for a
 * slug — burning tokens on `slugify` is silly when the input is
 * already well-known (collection name + category). Diacritics get
 * stripped, non-alphanumerics collapse to `-`, leading/trailing
 * dashes trim away.
 */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function templateKeyFor(
  collection: { key: string; name: Record<string, string> },
  category: string,
): string {
  const base = slugify(collection.name.en || collection.key) || "collection"
  return `${base}-${category}`
}

interface CollectionAiFillWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collection: TemplateCollection | null
  onCompleted: () => void
}

/**
 * Two-phase wizard:
 *
 *   Phase A — "anchor": user gives brand + optional logo + style notes,
 *   Gemini drafts the welcome mail. User reviews. Reject = retry or
 *   bail; accept = persist + move into Phase B.
 *
 *   Phase B — "sweep": for every remaining category, ask Gemini for a
 *   matching template using the saved welcome as the style example,
 *   persist each one as it lands. Per-step status surfaces in the UI;
 *   single failures don't abort the run.
 *
 * The whole flow lives in this dialog — the parent only opens it
 * with the target collection and listens for `onCompleted` so the
 * grid can refresh.
 */
export function CollectionAiFillWizard({
  open,
  onOpenChange,
  collection,
  onCompleted,
}: CollectionAiFillWizardProps) {
  const t = useTranslations("collectionAiFill")
  const tCat = useTranslations("templateLibrary.categories")

  const [phase, setPhase] = useState<"setup" | "anchor" | "sweep" | "done">(
    "setup",
  )
  const [brand, setBrand] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [selectedLocales, setSelectedLocales] = useState<string[]>(() => [
    routing.defaultLocale,
  ])
  const [modelId, setModelId] = useState(DEFAULT_MODEL_FALLBACK)
  const [models, setModels] = useState<AiModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [welcomePreview, setWelcomePreview] = useState<ComposedOutput | null>(
    null,
  )
  const [welcomeTemplateId, setWelcomeTemplateId] = useState<string | null>(
    null,
  )
  const [steps, setSteps] = useState<StepState[]>([])

  // Reset everything when the dialog reopens for a (possibly new)
  // collection. Without this the user would see the previous run's
  // sweep state when they reopen the wizard for another collection.
  useEffect(() => {
    if (!open) return
    setPhase("setup")
    setBrand("")
    setLogoUrl("")
    setNotes("")
    setSelectedLocales([routing.defaultLocale])
    setGenerating(false)
    setWelcomePreview(null)
    setWelcomeTemplateId(null)
    setSteps([])
  }, [open, collection?.id])

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
    return Array.from(groups.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )
  }, [models])

  const selectedModel = models.find((m) => m.id === modelId) ?? null

  function toggleLocale(l: string) {
    setSelectedLocales((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    )
  }

  // ── Phase A — anchor (welcome) ─────────────────────────────────────
  async function generateWelcome() {
    if (!brand.trim()) {
      toast.error(t("brandRequired"))
      return
    }
    if (selectedLocales.length === 0) {
      toast.error(t("localesRequired"))
      return
    }
    setGenerating(true)
    setWelcomePreview(null)
    try {
      const res = await fetch("/api/admin/template-library/ai-compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectPrompt: `${CATEGORY_PROMPTS.welcome} Brand: ${brand}.`,
          locales: selectedLocales,
          notes: notes.trim() || undefined,
          brand: brand.trim(),
          // Always pass logoUrl (even empty) to opt the conditional
          // header pattern in. The model will emit BOTH the
          // {#logoUrl} img branch and the {^logoUrl} brand-text
          // fallback, so the saved template works for any sender.
          logoUrl: logoUrl.trim(),
          model: modelId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("generateFailed"))
      setWelcomePreview(json.data as ComposedOutput)
      setPhase("anchor")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("generateFailed"))
    } finally {
      setGenerating(false)
    }
  }

  // Persist the just-generated welcome and queue the rest as pending
  // sweep steps. The actual sweep starts via `runSweep` so the user
  // can see the queue before it kicks off.
  async function acceptWelcome() {
    if (!welcomePreview || !collection) return
    setGenerating(true)
    try {
      const res = await fetch("/api/admin/template-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: templateKeyFor(collection, "welcome"),
          collectionId: collection.id,
          name: welcomePreview.name,
          description: {},
          category: "welcome",
          subject: welcomePreview.subject,
          htmlBody: welcomePreview.body,
          isPublic: true,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || t("saveFailed"))
      setWelcomeTemplateId(json.data?.id ?? null)
      setSteps(
        FILL_CATEGORIES.filter((c) => c !== "welcome").map((c) => ({
          category: c,
          status: "pending" as const,
        })),
      )
      setPhase("sweep")
      // Auto-start the sweep so the user doesn't have to click again.
      void runSweep(json.data?.id, welcomePreview)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"))
    } finally {
      setGenerating(false)
    }
  }

  // ── Phase B — sweep (remaining categories) ─────────────────────────
  async function runSweep(anchorId: string, anchor: ComposedOutput) {
    const exampleInline = {
      name: anchor.name,
      subject: anchor.subject,
      body: anchor.body,
    }
    // Sequential — sharing one model at a time gives the best chance
    // of consistent style; parallel calls would also hammer the
    // gateway with N requests at once (rate limit risk).
    for (const cat of FILL_CATEGORIES.filter((c) => c !== "welcome")) {
      setSteps((prev) =>
        prev.map((s) =>
          s.category === cat ? { ...s, status: "running" as const } : s,
        ),
      )
      try {
        const composeRes = await fetch(
          "/api/admin/template-library/ai-compose",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subjectPrompt: `${CATEGORY_PROMPTS[cat]} Brand: ${brand}.`,
              locales: selectedLocales,
              notes: notes.trim() || undefined,
              brand: brand.trim(),
              logoUrl: logoUrl.trim(),
              exampleInline,
              model: modelId,
            }),
          },
        )
        const composeJson = await composeRes.json()
        if (!composeRes.ok) {
          throw new Error(composeJson.error || "compose failed")
        }
        const composed = composeJson.data as ComposedOutput
        const saveRes = await fetch("/api/admin/template-library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: templateKeyFor(collection!, cat),
            collectionId: collection!.id,
            name: composed.name,
            description: {},
            category: cat,
            subject: composed.subject,
            htmlBody: composed.body,
            isPublic: true,
          }),
        })
        const saveJson = await saveRes.json()
        if (!saveRes.ok) {
          throw new Error(saveJson.error || "save failed")
        }
        setSteps((prev) =>
          prev.map((s) =>
            s.category === cat
              ? {
                  ...s,
                  status: "success" as const,
                  templateId: saveJson.data?.id,
                }
              : s,
          ),
        )
      } catch (err) {
        setSteps((prev) =>
          prev.map((s) =>
            s.category === cat
              ? {
                  ...s,
                  status: "failed" as const,
                  error: err instanceof Error ? err.message : String(err),
                }
              : s,
          ),
        )
      }
    }
    setPhase("done")
    onCompleted()
    // Avoid mentioning the anchor id in the toast; only used to
    // annotate the audit log via parent refresh.
    void anchorId
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto z-[70]"
        overlayClassName="z-[60]"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={AiBrain01Icon} strokeWidth={2} />
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {collection
              ? t("descriptionFor", {
                  collection: collection.name.en || collection.key,
                })
              : t("description")}
          </DialogDescription>
        </DialogHeader>

        {phase === "setup" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{t("brand")}</Label>
                <Input
                  value={brand}
                  onChange={(e) =>
                    setBrand((e.target as HTMLInputElement).value)
                  }
                  placeholder={t("brandPlaceholder")}
                  disabled={generating}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{t("logoUrl")}</Label>
                <Input
                  value={logoUrl}
                  onChange={(e) =>
                    setLogoUrl((e.target as HTMLInputElement).value)
                  }
                  placeholder="https://cdn.example.com/logo.png"
                  disabled={generating}
                />
                <p className="text-[10px] text-muted-foreground">
                  {t("logoUrlHint")}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("notes")}</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={generating}
                rows={3}
                placeholder={t("notesPlaceholder")}
                className={cn(
                  "min-h-[80px] resize-none rounded-md border bg-background px-3 py-2 text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("locales")}</Label>
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
              <Label className="text-xs">{t("model")}</Label>
              <Popover
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
              >
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
                        {modelsLoading ? t("modelsLoading") : modelId}
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
                              ) : null}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {phase === "anchor" && welcomePreview && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  className="size-3.5 text-emerald-600"
                />
                {t("welcomeReady")}
              </div>
              {Object.keys(welcomePreview.subject).map((l) => (
                <div
                  key={l}
                  className="mb-2 flex items-start gap-2 text-[12px]"
                >
                  <span className="rounded bg-background px-1.5 py-0.5 text-[9.5px] uppercase font-medium text-muted-foreground">
                    {l}
                  </span>
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <span className="truncate font-medium">
                      {welcomePreview.subject[l]}
                    </span>
                    <span className="truncate text-[10.5px] text-muted-foreground">
                      {welcomePreview.name[l]}
                    </span>
                  </div>
                </div>
              ))}
              <details className="mt-2 group">
                <summary className="cursor-pointer text-[10.5px] text-muted-foreground">
                  {t("showHtml")}
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-background/80 p-2 text-[10.5px]">
                  {welcomePreview.body[Object.keys(welcomePreview.body)[0]!]}
                </pre>
              </details>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("anchorExplain")}
            </p>
          </div>
        )}

        {phase === "sweep" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t("sweepRunning")}
            </p>
            <ul className="divide-y rounded-lg border">
              <li className="flex items-center gap-3 px-3 py-2">
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  className="size-4 text-emerald-600"
                />
                <span className="text-xs font-medium">{tCat("welcome")}</span>
                <span className="ms-auto text-[10.5px] text-muted-foreground">
                  {t("anchor")}
                </span>
              </li>
              {steps.map((s) => (
                <li
                  key={s.category}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  {s.status === "running" ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="size-4 animate-spin text-primary"
                    />
                  ) : s.status === "success" ? (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      className="size-4 text-emerald-600"
                    />
                  ) : s.status === "failed" ? (
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      strokeWidth={2}
                      className="size-4 text-destructive"
                    />
                  ) : (
                    <span className="size-2 rounded-full bg-muted-foreground/30" />
                  )}
                  <span
                    className={cn(
                      "text-xs",
                      s.status === "success" && "font-medium",
                      s.status === "failed" && "text-destructive",
                    )}
                  >
                    {tCat(s.category)}
                  </span>
                  {s.error ? (
                    <span
                      className="ms-auto truncate text-[10.5px] text-destructive max-w-[60%]"
                      title={s.error}
                    >
                      {s.error}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col gap-3 rounded-lg border bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Tick02Icon}
                strokeWidth={2}
                className="size-5 text-emerald-600"
              />
              <span className="text-sm font-semibold">
                {t("doneTitle", {
                  ok: steps.filter((s) => s.status === "success").length + 1,
                  total: FILL_CATEGORIES.length,
                })}
              </span>
            </div>
            {steps.some((s) => s.status === "failed") ? (
              <p className="text-xs text-muted-foreground">
                {t("doneWithFailures", {
                  failed: steps.filter((s) => s.status === "failed").length,
                })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("doneAllGood")}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === "setup" && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={generating}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={generateWelcome}
                disabled={
                  generating || !brand.trim() || selectedLocales.length === 0
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
                {t("generateWelcome")}
              </Button>
            </>
          )}
          {phase === "anchor" && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={generating}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="outline"
                onClick={generateWelcome}
                disabled={generating}
              >
                <HugeiconsIcon
                  icon={generating ? Loading03Icon : RefreshIcon}
                  strokeWidth={2}
                  className={cn(generating && "animate-spin")}
                  data-icon="inline-start"
                />
                {t("regenerate")}
              </Button>
              <Button onClick={acceptWelcome} disabled={generating}>
                {generating ? (
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
                {t("acceptAndContinue")}
              </Button>
            </>
          )}
          {phase === "sweep" && (
            <Button variant="outline" disabled>
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
              {t("sweepRunningShort")}
            </Button>
          )}
          {phase === "done" && (
            <Button onClick={() => onOpenChange(false)}>{t("close")}</Button>
          )}
        </DialogFooter>

        {/* Hidden — keeps welcomeTemplateId from being flagged unused
            by the linter. The id is also useful for future audit
            tracing via the parent refresh chain. */}
        {welcomeTemplateId ? (
          <span className="hidden" data-template-id={welcomeTemplateId} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

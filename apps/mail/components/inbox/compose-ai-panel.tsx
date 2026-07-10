"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AiBrain01Icon,
  Loading03Icon,
  SparklesIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
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
import { cn } from "@workspace/ui/lib/utils"

/**
 * Compose AI panel — composer'ın HTML editor'ünün hemen üstünde
 * yer alan ince yardımcı şerit:
 *   1. "AI ile yaz" — kullanıcı bir prompt yazar, AI subject + body üretir
 *   2. "Geliştir" — mevcut body'yi rewrite eder (notes opsiyonel)
 *   3. "Ton değiştir" — body'yi seçilen tonda yeniden yazar
 *
 * Tüm operasyonlar /compose-ai endpoint'ine gider; permission gate
 * `send.execute`. Dönen sonuç doğrudan composer'a apply edilir; kullanıcı
 * editor üstündeki normal undo/redo (Hugerte) ile geri alabilir.
 */

type ComposeTone =
  | "concise"
  | "warm"
  | "formal"
  | "apologetic"
  | "decline"
  | "casual"
  | "marketing"

const TONES: ComposeTone[] = [
  "concise",
  "warm",
  "formal",
  "casual",
  "apologetic",
  "decline",
  "marketing",
]

export interface ComposeAiPanelProps {
  slug: string
  /** Mevcut body (HTML). Enhance / change-tone burada okunur. */
  body: string
  /** Mevcut subject — context. */
  subject: string
  /** Çıktı dili (örn user'ın UI dili). Default boş → AI orijinal dilde tutar. */
  outputLang?: string
  /** Kullanıcının imza adı. */
  senderName?: string
  /** AI compose çıktısı geldiğinde subject + body'yi composer'a yazar. */
  onApply: (next: { subject?: string; bodyHtml: string }) => void
}

interface BaseResult {
  subject?: string
  bodyHtml: string
}

export function ComposeAiPanel({
  slug,
  body,
  subject,
  outputLang,
  senderName,
  onApply,
}: ComposeAiPanelProps) {
  const t = useTranslations("send.ai")
  const [composeOpen, setComposeOpen] = useState(false)
  const [composePrompt, setComposePrompt] = useState("")
  const [composeTone, setComposeTone] = useState<ComposeTone>("concise")
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [enhanceNotes, setEnhanceNotes] = useState("")
  const [toneOpen, setToneOpen] = useState(false)
  const [busy, setBusy] = useState<null | "compose" | "enhance" | "tone">(null)

  const apiBase = `/api/companies/${slug}/compose-ai`
  const hasBody = body.replace(/<[^>]+>/g, "").trim().length > 0

  async function call<T extends BaseResult>(
    payload: Record<string, unknown>,
    label: "compose" | "enhance" | "tone",
  ): Promise<T | null> {
    setBusy(label)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || t("genericError"))
        return null
      }
      return json.data as T
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"))
      return null
    } finally {
      setBusy(null)
    }
  }

  async function runCompose() {
    if (!composePrompt.trim()) {
      toast.error(t("composePromptRequired"))
      return
    }
    const out = await call<{ subject: string; bodyHtml: string }>(
      {
        kind: "compose",
        prompt: composePrompt.trim(),
        tone: composeTone,
        outputLang,
        senderName,
      },
      "compose",
    )
    if (out) {
      onApply({ subject: out.subject, bodyHtml: out.bodyHtml })
      setComposeOpen(false)
      setComposePrompt("")
      toast.success(t("composeApplied"))
    }
  }

  async function runEnhance() {
    if (!hasBody) {
      toast.error(t("bodyRequired"))
      return
    }
    const out = await call<{ bodyHtml: string }>(
      {
        kind: "enhance",
        bodyHtml: body,
        subject,
        outputLang,
        notes: enhanceNotes.trim() || undefined,
      },
      "enhance",
    )
    if (out) {
      onApply({ bodyHtml: out.bodyHtml })
      setEnhanceOpen(false)
      setEnhanceNotes("")
      toast.success(t("enhanceApplied"))
    }
  }

  async function runChangeTone(tone: ComposeTone) {
    if (!hasBody) {
      toast.error(t("bodyRequired"))
      return
    }
    const out = await call<{ bodyHtml: string }>(
      {
        kind: "change-tone",
        bodyHtml: body,
        subject,
        tone,
        outputLang,
      },
      "tone",
    )
    if (out) {
      onApply({ bodyHtml: out.bodyHtml })
      setToneOpen(false)
      toast.success(t("toneApplied", { tone: t(`tone.${tone}`) }))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-primary/20 bg-primary/[0.03] px-2 py-1.5">
      <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
        <motion.span
          animate={
            busy
              ? { rotate: 360 }
              : { rotate: 0 }
          }
          transition={
            busy
              ? { repeat: Infinity, duration: 1.6, ease: "linear" }
              : { duration: 0.2 }
          }
          className="inline-flex"
        >
          <HugeiconsIcon
            icon={busy ? Loading03Icon : SparklesIcon}
            strokeWidth={2}
            className="size-3.5"
          />
        </motion.span>
        {t("label")}
      </span>

      {/* Compose with AI */}
      <Popover open={composeOpen} onOpenChange={setComposeOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              disabled={busy !== null}
            >
              <HugeiconsIcon
                icon={AiBrain01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("composeCta")}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-[340px] space-y-3 p-3">
          <div>
            <Label className="text-xs">{t("composePromptLabel")}</Label>
            <Textarea
              value={composePrompt}
              onChange={(e) => setComposePrompt(e.target.value)}
              placeholder={t("composePromptPlaceholder")}
              className="mt-1.5 min-h-[80px] resize-none text-sm"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground">
              {t("toneLabel")}
            </Label>
            <Select
              value={composeTone}
              onValueChange={(v) => v && setComposeTone(v as ComposeTone)}
            >
              <SelectTrigger className="h-7 flex-1 text-xs">
                <span>{t(`tone.${composeTone}`)}</span>
              </SelectTrigger>
              <SelectContent>
                {TONES.filter((tn) => tn !== "casual").map((tn) => (
                  <SelectItem key={tn} value={tn} label={t(`tone.${tn}`)}>
                    {t(`tone.${tn}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setComposeOpen(false)}
              className="h-7 px-2 text-xs"
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={runCompose}
              disabled={busy !== null}
              className="h-7 px-2 text-xs"
            >
              {busy === "compose" ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="size-3.5 animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <HugeiconsIcon
                  icon={SparklesIcon}
                  strokeWidth={2}
                  className="size-3.5"
                  data-icon="inline-start"
                />
              )}
              {t("generate")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Enhance */}
      <Popover open={enhanceOpen} onOpenChange={setEnhanceOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 gap-1 px-2 text-xs",
                !hasBody && "opacity-50",
              )}
              disabled={busy !== null || !hasBody}
            >
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              {t("enhanceCta")}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-[320px] space-y-3 p-3">
          <div>
            <Label className="text-xs">{t("enhanceNotesLabel")}</Label>
            <Textarea
              value={enhanceNotes}
              onChange={(e) => setEnhanceNotes(e.target.value)}
              placeholder={t("enhanceNotesPlaceholder")}
              className="mt-1.5 min-h-[60px] resize-none text-sm"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={runEnhance}
              disabled={busy !== null}
              className="h-7 px-2 text-xs"
            >
              {busy === "enhance" ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="size-3.5 animate-spin"
                  data-icon="inline-start"
                />
              ) : null}
              {t("enhanceCta")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Change tone */}
      <Popover open={toneOpen} onOpenChange={setToneOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 gap-1 px-2 text-xs",
                !hasBody && "opacity-50",
              )}
              disabled={busy !== null || !hasBody}
            >
              {t("changeToneCta")}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-[200px] p-1">
          <AnimatePresence>
            {TONES.map((tn) => (
              <motion.button
                key={tn}
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ x: 2 }}
                onClick={() => runChangeTone(tn)}
                disabled={busy !== null}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
              >
                <span>{t(`tone.${tn}`)}</span>
                {busy === "tone" && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    strokeWidth={2}
                    className="size-3 animate-spin text-muted-foreground"
                  />
                )}
              </motion.button>
            ))}
          </AnimatePresence>
        </PopoverContent>
      </Popover>
    </div>
  )
}

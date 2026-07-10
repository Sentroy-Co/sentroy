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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Admin system-mail event template editör'üne özel AI yardım şeridi.
 * Composer panelinin "compose-from-prompt" modu burada yok — admin yeni
 * event uydurmuyor, sadece mevcut event'in copy'sini geliştiriyor.
 *
 * İki popover:
 *   - "Geliştir" (enhance) — opsiyonel direktif notu ile rewrite
 *   - "Ton değiştir" (change-tone) — concise/warm/formal/casual/...
 *
 * Endpoint: `/api/admin/system-mail/ai` (admin-only). Sonuç doğrudan
 * CodeEditor'a yazılır; kullanıcı CodeEditor undo (browser-level
 * undo, react-simple-code-editor history) ile geri alabilir.
 */

type Tone =
  | "concise"
  | "warm"
  | "formal"
  | "apologetic"
  | "decline"
  | "casual"
  | "marketing"

const TONES: Tone[] = [
  "concise",
  "warm",
  "formal",
  "casual",
  "apologetic",
  "decline",
  "marketing",
]

export interface SystemMailAiPanelProps {
  bodyHtml: string
  subject: string
  outputLang: string
  onApply: (nextBodyHtml: string) => void
}

export function SystemMailAiPanel({
  bodyHtml,
  subject,
  outputLang,
  onApply,
}: SystemMailAiPanelProps) {
  const t = useTranslations("systemMail.ai")
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [enhanceNotes, setEnhanceNotes] = useState("")
  const [toneOpen, setToneOpen] = useState(false)
  const [busy, setBusy] = useState<null | "enhance" | "tone">(null)

  const apiBase = "/api/admin/system-mail/ai"
  const hasBody = bodyHtml.replace(/<[^>]+>/g, "").trim().length > 0

  async function call(
    payload: Record<string, unknown>,
    label: "enhance" | "tone",
  ): Promise<{ bodyHtml: string } | null> {
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
      return json.data as { bodyHtml: string }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("genericError"))
      return null
    } finally {
      setBusy(null)
    }
  }

  async function runEnhance() {
    if (!hasBody) {
      toast.error(t("bodyRequired"))
      return
    }
    const out = await call(
      {
        kind: "enhance",
        bodyHtml,
        subject,
        outputLang,
        notes: enhanceNotes.trim() || undefined,
      },
      "enhance",
    )
    if (out) {
      onApply(out.bodyHtml)
      setEnhanceOpen(false)
      setEnhanceNotes("")
      toast.success(t("enhanceApplied"))
    }
  }

  async function runChangeTone(tone: Tone) {
    if (!hasBody) {
      toast.error(t("bodyRequired"))
      return
    }
    const out = await call(
      {
        kind: "change-tone",
        bodyHtml,
        subject,
        tone,
        outputLang,
      },
      "tone",
    )
    if (out) {
      onApply(out.bodyHtml)
      setToneOpen(false)
      toast.success(t("toneApplied", { tone: t(`tone.${tone}`) }))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-primary/20 bg-primary/[0.03] px-2 py-1.5">
      <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
        <motion.span
          animate={busy ? { rotate: 360 } : { rotate: 0 }}
          transition={
            busy
              ? { repeat: Infinity, duration: 1.6, ease: "linear" }
              : { duration: 0.2 }
          }
          className="inline-flex"
        >
          <HugeiconsIcon
            icon={busy ? Loading03Icon : AiBrain01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </motion.span>
        {t("label")}
      </span>

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
              variant="ghost"
              size="sm"
              onClick={() => setEnhanceOpen(false)}
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

"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { sanitizeHtml } from "@workspace/console/lib/sanitize-html"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AiBrain01Icon,
  GlobeIcon,
  TextIcon,
  MailReply01Icon,
  Loading03Icon,
  Cancel01Icon,
  Tick02Icon,
  CopyIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Sheet, SheetContent } from "@workspace/ui/components/sheet"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import type { ComposeDefaults } from "@/components/inbox/compose-sheet"

/**
 * Mesaj okuma sırasında açılan AI yardımcı paneli. Üç mod:
 *  - translate  → mesajı hedef dile çevir, iframe içinde gösterilen
 *                 HTML'i değiştirme; ayrı panelde göster + kopyala butonu
 *  - summarize  → 3-5 madde + TL;DR + action items + sentiment
 *  - reply      → kullanıcı niyetini girer, AI HTML reply taslağı üretir,
 *                 "compose'a aktar" butonu ile ComposeSheet açılır
 *
 * UX: sağdan açılan ince Sheet (max-w-md). Header'da tab switcher
 * (translate/summarize/reply). framer-motion içerik geçişlerinde
 * fade+slide. Loading sırasında spinning icon + "AI çalışıyor"
 * placeholder kart. Hata olursa toast.
 */

type AiKind = "translate" | "summarize" | "reply"
type ReplyTone = "concise" | "warm" | "formal" | "apologetic" | "decline"

interface TranslateOutput {
  subject: string
  bodyHtml: string
  detectedSourceLang: string
}

interface SummarizeOutput {
  tldr: string
  keyPoints: string[]
  actionItems: string[]
  sentiment: "positive" | "neutral" | "negative" | "urgent"
}

interface ReplyOutput {
  subject: string
  bodyHtml: string
}

export interface MessageAiAssistantProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  /** Mesaj subject'i */
  subject: string
  /** Mesajın HTML body'si (translate için) */
  bodyHtml: string
  /** Mesajın text body'si (summarize/reply için) */
  bodyText: string
  /** Gönderen — "Ahmet <ahmet@x.com>" gibi */
  senderLabel?: string
  /** Reply başarılı olunca compose'u tetikler */
  onStartCompose?: (defaults: ComposeDefaults) => void
  /** Reply için "kime" — orijinal sender'ın adresi. */
  replyToAddress?: string
  /** Currently signed-in user's display name for signature. */
  senderName?: string
}

export function MessageAiAssistant({
  open,
  onOpenChange,
  slug,
  subject,
  bodyHtml,
  bodyText,
  senderLabel,
  onStartCompose,
  replyToAddress,
  senderName,
}: MessageAiAssistantProps) {
  const t = useTranslations("inbox.ai")
  const [kind, setKind] = useState<AiKind>("summarize")
  const [busy, setBusy] = useState(false)
  const [translateLang, setTranslateLang] = useState("en")
  const [translateOutput, setTranslateOutput] = useState<TranslateOutput | null>(
    null,
  )
  const [summary, setSummary] = useState<SummarizeOutput | null>(null)
  const [replyTone, setReplyTone] = useState<ReplyTone>("concise")
  const [replyIntent, setReplyIntent] = useState("")
  const [replyOutput, setReplyOutput] = useState<ReplyOutput | null>(null)
  const [copied, setCopied] = useState<"translate" | "reply" | null>(null)

  const apiBase = `/api/companies/${slug}/inbox-ai`
  const abortRef = useRef<AbortController | null>(null)

  // Sheet kapanıp tekrar açıldığında geçici state'i sıfırla — kullanıcı
  // farklı bir mailden yeni iş istiyor olabilir.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      setTranslateOutput(null)
      setSummary(null)
      setReplyOutput(null)
      setReplyIntent("")
      setBusy(false)
    }
  }, [open])

  async function callAi<T>(payload: Record<string, unknown>): Promise<T | null> {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setBusy(true)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || t("genericError"))
        return null
      }
      return json.data as T
    } catch (err) {
      if ((err as Error).name === "AbortError") return null
      toast.error(err instanceof Error ? err.message : t("genericError"))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function runTranslate() {
    if (!translateLang.trim()) {
      toast.error(t("targetLangRequired"))
      return
    }
    const out = await callAi<TranslateOutput>({
      kind: "translate",
      subject,
      bodyHtml,
      targetLang: translateLang.trim(),
    })
    if (out) setTranslateOutput(out)
  }

  async function runSummarize() {
    const out = await callAi<SummarizeOutput>({
      kind: "summarize",
      subject,
      bodyText,
      senderLabel,
    })
    if (out) setSummary(out)
  }

  async function runReply() {
    if (!replyIntent.trim()) {
      toast.error(t("intentRequired"))
      return
    }
    const out = await callAi<ReplyOutput>({
      kind: "reply",
      originalSubject: subject,
      originalBody: bodyText,
      tone: replyTone,
      intent: replyIntent.trim(),
      senderName,
    })
    if (out) setReplyOutput(out)
  }

  async function copyText(value: string, slot: "translate" | "reply") {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(slot)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  function applyReplyToCompose() {
    if (!replyOutput || !onStartCompose) return
    onStartCompose({
      to: replyToAddress ? [replyToAddress] : [],
      subject: replyOutput.subject,
      body: replyOutput.bodyHtml,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="relative">
            <motion.div
              animate={
                busy
                  ? { rotate: 360, scale: [1, 1.1, 1] }
                  : { rotate: 0, scale: 1 }
              }
              transition={
                busy
                  ? { repeat: Infinity, duration: 2, ease: "linear" }
                  : { duration: 0.2 }
              }
              className="flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-primary/30 to-primary/10 text-primary"
            >
              <HugeiconsIcon
                icon={AiBrain01Icon}
                strokeWidth={2}
                className="size-4"
              />
            </motion.div>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">{t("title")}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("subtitle")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
          >
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </Button>
        </div>

        {/* Tabs */}
        <div className="border-b px-4 py-3">
          <Tabs value={kind} onValueChange={(v) => setKind(v as AiKind)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summarize" className="gap-1.5">
                <HugeiconsIcon
                  icon={TextIcon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                <span className="hidden sm:inline">{t("tabs.summarize")}</span>
              </TabsTrigger>
              <TabsTrigger value="translate" className="gap-1.5">
                <HugeiconsIcon
                  icon={GlobeIcon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                <span className="hidden sm:inline">{t("tabs.translate")}</span>
              </TabsTrigger>
              <TabsTrigger value="reply" className="gap-1.5">
                <HugeiconsIcon
                  icon={MailReply01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                <span className="hidden sm:inline">{t("tabs.reply")}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {kind === "summarize" && (
              <motion.div
                key="summarize"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4 p-4"
              >
                {!summary && !busy && (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      {t("summarize.intro")}
                    </p>
                    <Button onClick={runSummarize} size="sm">
                      {t("summarize.cta")}
                    </Button>
                  </div>
                )}
                {busy && <BusyCard label={t("busy")} />}
                {summary && !busy && (
                  <SummaryView summary={summary} t={t} onRetry={runSummarize} />
                )}
              </motion.div>
            )}

            {kind === "translate" && (
              <motion.div
                key="translate"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4 p-4"
              >
                <div className="space-y-2">
                  <Label className="text-xs">{t("translate.langLabel")}</Label>
                  <div className="flex gap-2">
                    <Select
                      value={translateLang}
                      onValueChange={(v) => v && setTranslateLang(v)}
                    >
                      <SelectTrigger className="h-9 flex-1">
                        <span>{translateLang.toUpperCase()}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          { code: "en", label: "English" },
                          { code: "tr", label: "Türkçe" },
                          { code: "de", label: "Deutsch" },
                          { code: "fr", label: "Français" },
                          { code: "es", label: "Español" },
                          { code: "it", label: "Italiano" },
                          { code: "ar", label: "العربية" },
                          { code: "ru", label: "Русский" },
                          { code: "ja", label: "日本語" },
                          { code: "zh", label: "中文" },
                        ].map((l) => (
                          <SelectItem
                            key={l.code}
                            value={l.code}
                            label={l.label}
                          >
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={runTranslate} size="sm" disabled={busy}>
                      {busy ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          strokeWidth={2}
                          className="size-4 animate-spin"
                        />
                      ) : (
                        t("translate.cta")
                      )}
                    </Button>
                  </div>
                </div>

                {busy && !translateOutput && <BusyCard label={t("busy")} />}

                {translateOutput && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3"
                  >
                    <Badge variant="outline" className="text-[10px]">
                      {t("translate.detected", {
                        lang: translateOutput.detectedSourceLang.toUpperCase(),
                      })}
                    </Badge>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {t("translate.subject")}
                      </Label>
                      <div className="rounded-md border bg-muted/20 p-2 text-sm">
                        {translateOutput.subject}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        {t("translate.body")}
                      </Label>
                      <div
                        className="prose prose-sm max-w-none rounded-md border bg-background p-3 text-sm dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(translateOutput.bodyHtml),
                        }}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyText(translateOutput.bodyHtml, "translate")
                        }
                      >
                        <HugeiconsIcon
                          icon={copied === "translate" ? Tick02Icon : CopyIcon}
                          strokeWidth={2}
                          className="size-3.5"
                          data-icon="inline-start"
                        />
                        {copied === "translate" ? t("copied") : t("copyHtml")}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {kind === "reply" && (
              <motion.div
                key="reply"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-4 p-4"
              >
                <div className="space-y-2">
                  <Label className="text-xs">{t("reply.toneLabel")}</Label>
                  <Select
                    value={replyTone}
                    onValueChange={(v) => v && setReplyTone(v as ReplyTone)}
                  >
                    <SelectTrigger className="h-9">
                      <span>{t(`reply.tone.${replyTone}`)}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        [
                          "concise",
                          "warm",
                          "formal",
                          "apologetic",
                          "decline",
                        ] as ReplyTone[]
                      ).map((tone) => (
                        <SelectItem
                          key={tone}
                          value={tone}
                          label={t(`reply.tone.${tone}`)}
                        >
                          {t(`reply.tone.${tone}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("reply.intentLabel")}</Label>
                  <Textarea
                    value={replyIntent}
                    onChange={(e) => setReplyIntent(e.target.value)}
                    placeholder={t("reply.intentPlaceholder")}
                    className="min-h-[80px] resize-none text-sm"
                  />
                </div>
                <Button
                  onClick={runReply}
                  size="sm"
                  className="w-full"
                  disabled={busy}
                >
                  {busy ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="size-4 animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={AiBrain01Icon}
                      strokeWidth={2}
                      className="size-4"
                      data-icon="inline-start"
                    />
                  )}
                  {t("reply.cta")}
                </Button>

                {busy && !replyOutput && <BusyCard label={t("busy")} />}

                {replyOutput && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-3 rounded-lg border bg-muted/30 p-3"
                  >
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        {t("reply.subjectLabel")}
                      </Label>
                      <Input
                        value={replyOutput.subject}
                        onChange={(e) =>
                          setReplyOutput({
                            ...replyOutput,
                            subject: e.target.value,
                          })
                        }
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">
                        {t("reply.preview")}
                      </Label>
                      <div
                        className="prose prose-sm max-w-none rounded-md border bg-background p-3 text-sm dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(replyOutput.bodyHtml),
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={applyReplyToCompose}>
                        <HugeiconsIcon
                          icon={MailReply01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                          data-icon="inline-start"
                        />
                        {t("reply.openCompose")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copyText(replyOutput.bodyHtml, "reply")
                        }
                      >
                        <HugeiconsIcon
                          icon={copied === "reply" ? Tick02Icon : CopyIcon}
                          strokeWidth={2}
                          className="size-3.5"
                          data-icon="inline-start"
                        />
                        {copied === "reply" ? t("copied") : t("copyHtml")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={runReply}
                        className="ms-auto"
                      >
                        {t("reply.regenerate")}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function BusyCard({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-4"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary"
      >
        <HugeiconsIcon icon={AiBrain01Icon} strokeWidth={2} className="size-4" />
      </motion.div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </motion.div>
  )
}

function sentimentClass(sentiment: SummarizeOutput["sentiment"]): string {
  switch (sentiment) {
    case "positive":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    case "negative":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    case "urgent":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function SummaryView({
  summary,
  t,
  onRetry,
}: {
  summary: SummarizeOutput
  t: ReturnType<typeof useTranslations>
  onRetry: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ staggerChildren: 0.04 }}
      className="space-y-4"
    >
      <Badge className={cn("rounded-full", sentimentClass(summary.sentiment))}>
        {t(`summarize.sentiment.${summary.sentiment}`)}
      </Badge>
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t("summarize.tldr")}
        </Label>
        <p className="mt-1 text-sm font-medium">{summary.tldr}</p>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t("summarize.keyPoints")}
        </Label>
        <ul className="mt-1 space-y-1.5 text-sm">
          {summary.keyPoints.map((kp, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex gap-2"
            >
              <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{kp}</span>
            </motion.li>
          ))}
        </ul>
      </div>
      {summary.actionItems.length > 0 && (
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("summarize.actionItems")}
          </Label>
          <ul className="mt-1 space-y-1 text-sm">
            {summary.actionItems.map((ai, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex gap-2 rounded-md border bg-background p-2"
              >
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2}
                  className="mt-0.5 size-3.5 shrink-0 text-primary"
                />
                <span>{ai}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRetry}>
          {t("summarize.regenerate")}
        </Button>
      </div>
    </motion.div>
  )
}

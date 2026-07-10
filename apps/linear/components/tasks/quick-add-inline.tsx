"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { useFetcher } from "@/lib/router-compat"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Add01FreeIcons } from "@hugeicons/core-free-icons"
import {
  normalizeActionResult,
  type ActionResult,
} from "./action-result"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

type Props = {
  /** Linear team — defaultTeamId payload'undan. */
  teamId?: string
  /** Kanban kolonu altındaysa o kolonun state id'si. List view'da boş. */
  stateId?: string
  /** Görsel preset: liste sonu (geniş, soft) vs kanban (kompakt). */
  variant?: "list" | "kanban"
  placeholder?: string
}

/**
 * Tek-satır hızlı talep ekleme — Dialog açmadan, sadece başlıkla.
 * Linear'da issue açar (panel marker'lı), Enter / "Ekle" → fetcher
 * /tasks/new action'ına post (shim `${apiBase}/issues`'a çevirir);
 * başarıda input temizlenir, optimistic yerine revalidate ile yeni
 * talep listede belirir.
 */
export function QuickAddInline({
  teamId,
  stateId,
  variant = "list",
  placeholder,
}: Props) {
  const t = useTranslations("linearLite.tasks.quick_add")
  const fetcher = useFetcher<unknown>()
  const [title, setTitle] = useState("")
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const submitting = fetcher.state !== "idle"

  // Success → temizle.
  useEffect(() => {
    if (fetcher.state !== "idle") return
    const data = normalizeActionResult<ActionResult>(fetcher.data)
    if (!data) return
    if (data.ok) {
      setTitle("")
      // Re-focus ki ardışık eklemeler kolay olsun.
      inputRef.current?.focus()
    } else if (data.error) {
      toast.error(data.error)
    }
  }, [fetcher.state, fetcher.data])

  const submit = () => {
    const trimmed = title.trim()
    if (trimmed.length < 3) {
      toast.error(t("min_length"))
      return
    }
    const form = new FormData()
    form.set("title", trimmed)
    form.set("description", "")
    form.set("priority", "0")
    if (teamId) form.set("teamId", teamId)
    if (stateId) form.set("stateId", stateId)
    void fetcher.submit(form, { method: "post", action: "/tasks/new" })
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setTitle("")
      inputRef.current?.blur()
    }
  }

  const compact = variant === "kanban"
  const idle = !focused && title.length === 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn(
        "group/qa flex items-center gap-2 rounded-lg border transition-colors",
        compact
          ? "border-dashed border-border/50 bg-card/30 px-2 py-1.5"
          : "border-border/60 bg-card/40 px-3 py-2",
        focused && "border-border bg-card",
        submitting && "opacity-70",
      )}
    >
      <HugeiconsIcon
        icon={Add01FreeIcons as IconSvgElement}
        size={compact ? 12 : 14}
        strokeWidth={2}
        className={cn(
          "shrink-0 transition-colors",
          idle ? "text-muted-foreground/50" : "text-foreground",
        )}
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={
          placeholder ??
          (compact ? t("placeholder_compact") : t("placeholder"))
        }
        disabled={submitting}
        className={cn(
          "flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60",
          compact ? "text-xs" : "text-sm",
        )}
        aria-label={t("aria")}
      />
      {title.trim().length >= 3 ? (
        <button
          type="submit"
          disabled={submitting}
          className={cn(
            "shrink-0 rounded-md bg-primary text-primary-foreground transition-opacity",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
            submitting && "opacity-50",
          )}
        >
          {submitting ? "…" : t("submit")}
        </button>
      ) : (
        <span
          className={cn(
            "shrink-0 font-mono text-muted-foreground/60",
            compact ? "text-[9px]" : "text-[10px]",
          )}
          aria-hidden
        >
          Enter
        </span>
      )}
    </form>
  )
}

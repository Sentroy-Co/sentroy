"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { motion, AnimatePresence } from "framer-motion"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import { useOsStore } from "./os-store"
import { LIVE_TOOLS, categoryMeta, toolLocale, type ToolEntry } from "./tools/catalog"
import { toolDescriptor } from "./tools/open-tool"

type IconType = AppDescriptor["icon"]
type Result =
  | { kind: "app"; key: string; id: string; name: string; icon: IconType; color: string; logoUrl?: string }
  | { kind: "tool"; key: string; tool: ToolEntry; name: string; icon: IconType; color: string; logoUrl?: string }

/**
 * Spotlight — ⌘K / Ctrl+K ile açılır; uygulamaları ve araçları filtreler.
 * ↑/↓ gez, Enter aç, Esc kapat. Tool seçilince pencerede açılır.
 */
export function Spotlight({
  open,
  onClose,
  apps,
  lang,
}: {
  open: boolean
  onClose: () => void
  apps: AppDescriptor[]
  lang: string
}) {
  const openApp = useOsStore((s) => s.openApp)
  const t = useTranslations("os")
  const [q, setQ] = useState("")
  const [sel, setSel] = useState(0)
  const query = q.trim().toLowerCase()

  const results = useMemo<Result[]>(() => {
    const appResults: Result[] = apps
      .filter((a) => !query || a.name.toLowerCase().includes(query))
      .map((a) => ({ kind: "app", key: `a:${a.id}`, id: a.id, name: a.name, icon: a.icon, color: a.color, logoUrl: a.logoUrl }))
    const toolResults: Result[] = LIVE_TOOLS.filter((t) => {
      const l = toolLocale(t, lang)
      return !query || l.title.toLowerCase().includes(query) || l.keyword.toLowerCase().includes(query) || t.en.title.toLowerCase().includes(query)
    }).map((t) => {
      const m = categoryMeta(t.category)
      return { kind: "tool", key: `t:${t.id}`, tool: t, name: toolLocale(t, lang).title, icon: m.icon, color: m.color }
    })
    return [...appResults, ...toolResults].slice(0, 30)
  }, [apps, lang, query])

  useEffect(() => {
    setSel(0)
  }, [query, open])

  useEffect(() => {
    if (!open) {
      setQ("")
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setSel((s) => Math.min(s + 1, results.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSel((s) => Math.max(s - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const r = results[sel]
        if (r) choose(r)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, sel])

  function choose(r: Result) {
    if (r.kind === "app") openApp(r.id)
    else {
      const d = toolDescriptor(r.tool, lang)
      openApp(d.id, d)
    }
    onClose()
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={onClose}
          className="fixed inset-0 z-[60] flex justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-fit w-full max-w-xl select-none overflow-hidden rounded-2xl bg-popover/90 shadow-2xl ring-1 ring-black/10 backdrop-blur-2xl dark:ring-white/10"
          >
            <div className="flex items-center gap-3 border-b border-border/60 px-4">
              <HugeiconsIcon icon={Search01Icon} className="size-5 text-muted-foreground" strokeWidth={2} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
                placeholder={t("searchAppsTools")}
                className="flex-1 bg-transparent py-4 text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
              ) : (
                results.map((r, i) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => choose(r)}
                    onMouseMove={() => setSel(i)}
                    className={"flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left " + (i === sel ? "bg-foreground/10" : "")}
                  >
                    <span
                      className="flex size-8 items-center justify-center overflow-hidden rounded-lg text-white"
                      style={r.logoUrl ? undefined : { background: `linear-gradient(150deg, ${r.color}, ${r.color}cc)` }}
                    >
                      {r.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.logoUrl} alt="" draggable={false} className="size-full object-cover select-none" />
                      ) : (
                        <HugeiconsIcon icon={r.icon} className="size-4" strokeWidth={2} />
                      )}
                    </span>
                    <span className="flex-1 truncate text-sm text-foreground">{r.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {r.kind === "tool" ? t("tool") : t("app")}
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

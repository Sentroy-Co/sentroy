"use client"

import { useEffect, useMemo, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { applyPlaceholders, applyPlaceholdersRaw, useDocsStore } from "../lib/store"
import { CopyButton } from "./copy-button"

export type CodeTab = {
  label: string
  lang: string
  raw: string
  html: string
}

const STORAGE_KEY = "sentroy-docs-language"

export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0)
  const token = useDocsStore((s) => s.token)
  const slug = useDocsStore((s) => s.companySlug)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    const idx = tabs.findIndex((t) => t.label === stored)
    if (idx >= 0) setActive(idx)
  }, [tabs])

  const handleSelect = (idx: number) => {
    setActive(idx)
    window.localStorage.setItem(STORAGE_KEY, tabs[idx]!.label)
  }

  const current = tabs[active]!
  const renderedHtml = useMemo(
    () => applyPlaceholders(current.html, token, slug),
    [current.html, token, slug],
  )
  const copyText = useMemo(
    () => applyPlaceholdersRaw(current.raw, token, slug),
    [current.raw, token, slug],
  )

  return (
    <div className="docs-code group my-5 overflow-hidden rounded-lg border border-border bg-[var(--shiki-bg)]">
      <div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2">
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => handleSelect(idx)}
            className={cn(
              "relative px-3 py-2 font-mono text-xs font-medium transition",
              idx === active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {idx === active ? (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="relative">
        <div
          key={current.label}
          className="docs-shiki overflow-x-auto p-4 text-[13px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
        <CopyButton text={copyText} />
      </div>
    </div>
  )
}

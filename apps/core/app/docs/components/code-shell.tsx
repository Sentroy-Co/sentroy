"use client"

import { useMemo } from "react"
import { applyPlaceholders, applyPlaceholdersRaw, useDocsStore } from "../lib/store"
import { CopyButton } from "./copy-button"

/**
 * Client wrapper that injects user-stored token and slug into a
 * pre-highlighted code block. The HTML and raw text are produced by the
 * server (shiki); we just substitute markers at render time so credential
 * changes update every block on the page without re-highlighting.
 */
export function CodeShell({
  html,
  raw,
  className,
}: {
  html: string
  raw: string
  className?: string
}) {
  const token = useDocsStore((s) => s.token)
  const slug = useDocsStore((s) => s.companySlug)

  const renderedHtml = useMemo(
    () => applyPlaceholders(html, token, slug),
    [html, token, slug],
  )
  const copyText = useMemo(
    () => applyPlaceholdersRaw(raw, token, slug),
    [raw, token, slug],
  )

  return (
    <div className={className}>
      <div
        className="docs-shiki overflow-x-auto p-4 text-[13px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
      <CopyButton text={copyText} />
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { createHighlighter, type Highlighter } from "shiki"

/**
 * Marketing landing'lerde kullanılan client-side syntax-highlighted code
 * block. Shiki bundle ağır olduğu için (~400KB) lazy + module-level singleton
 * promise cache ile yalnızca **ilk CodeBlock mount**'unda yüklenir; sonraki
 * tüm instance'lar aynı highlighter'ı paylaşır.
 *
 * Tema docs paketiyle aynı (`aurora-x`) — tüm marketing yüzeylerinde
 * tutarlı renk paleti. Dual-theme (light + dark) docs'a özel; landing'ler
 * koyu arka plana gömülü olduğu için tek dark tema yeterli.
 *
 * Highlight tamamlanana kadar plain `<pre>` fallback render olur (CLS yok,
 * yalnızca renk yokluğu gözle fark edilebilir).
 */

const SUPPORTED_LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "json",
  "bash",
  "go",
  "python",
  "php",
  "html",
  "http",
] as const

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["aurora-x"],
      langs: [...SUPPORTED_LANGS],
    })
  }
  return highlighterPromise
}

const LANG_ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  jsx: "tsx",
  py: "python",
  shell: "bash",
  sh: "bash",
  curl: "bash",
}

export interface CodeBlockProps {
  code: string
  language: string
  /** Optional. Görüntülenirse code üst kenarında küçük badge — örn.
   *  "upload.ts" / "GET /api/...". */
  filename?: string
  /** Container className override (default: minimal padding/scroll). */
  className?: string
}

export function CodeBlock({
  code,
  language,
  filename,
  className,
}: CodeBlockProps) {
  const [html, setHtml] = useState<string>("")

  useEffect(() => {
    const lang = LANG_ALIASES[language] ?? language
    let cancelled = false
    getHighlighter()
      .then((h) => {
        if (cancelled) return
        try {
          const result = h.codeToHtml(code, {
            lang,
            theme: "aurora-x",
          })
          setHtml(result)
        } catch {
          // Bilinmeyen dil → plain göstermeye devam et
        }
      })
      .catch(() => {
        // Highlighter init fail (network / CDN) — plain fallback kalır
      })
    return () => {
      cancelled = true
    }
  }, [code, language])

  const containerClass = className
    ? className
    : "rounded-xl border bg-[#0d1117] p-3"

  return (
    <div className={containerClass}>
      {filename && (
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="font-mono text-[11px] text-white/50">
            {filename}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/30">
            {language}
          </span>
        </div>
      )}
      {html ? (
        <div
          className="[&_pre]:!bg-transparent [&_pre]:overflow-x-auto [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_code]:!bg-transparent"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto font-mono text-[12px] leading-relaxed text-zinc-300">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}

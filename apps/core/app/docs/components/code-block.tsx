import { highlight, type SupportedLang } from "../lib/highlight"
import { CodeShell } from "./code-shell"

type CodeBlockProps = {
  code: string
  lang?: SupportedLang
  filename?: string
  hideCopy?: boolean
}

export async function CodeBlock({ code, lang = "ts", filename, hideCopy }: CodeBlockProps) {
  const html = await highlight(code, lang)
  return (
    <div className="docs-code group relative my-5 overflow-hidden rounded-lg border border-border bg-[var(--shiki-bg)]">
      {filename ? (
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <span className="font-mono">{filename}</span>
          <span className="font-mono uppercase tracking-wider">{lang}</span>
        </div>
      ) : null}
      {hideCopy ? (
        <div
          className="docs-shiki overflow-x-auto p-4 text-[13px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <CodeShell html={html} raw={code} className="relative" />
      )}
    </div>
  )
}

type InlineCodeProps = {
  children: React.ReactNode
}

export function InlineCode({ children }: InlineCodeProps) {
  return (
    <code className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  )
}

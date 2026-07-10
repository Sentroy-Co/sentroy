"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { Copy01FreeIcons, Tick02FreeIcons } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

type Props = {
  value: string | null | undefined
  className?: string
  emptyText?: string
}

/**
 * Read-only renderer for the markdown produced by RichTextEditor.
 * Reuses the `.rt-content` styles so editor and view look identical.
 */
export function RichTextView({ value, className, emptyText }: Props) {
  const text = value?.trim() ?? ""
  if (!text) {
    return emptyText ? (
      <p className="text-sm text-muted-foreground">{emptyText}</p>
    ) : null
  }
  return (
    <div className={cn("rt-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

function extractText(node: unknown): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractText).join("")
  if (typeof node === "object" && node !== null && "props" in node) {
    return extractText((node as { props: { children?: unknown } }).props.children)
  }
  return ""
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("linearLite")
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    const text = extractText(children)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      toast.error(t("richTextView.copyFailed"))
    }
  }

  return (
    <div className="group/code relative">
      <pre>{children}</pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={
          copied ? t("common.copied") : t("richTextView.copyCode")
        }
        className={cn(
          "absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1.5 py-1 text-[10px] font-medium text-muted-foreground opacity-0 backdrop-blur transition-all duration-150",
          "hover:border-border hover:bg-background hover:text-foreground",
          "group-hover/code:opacity-100 focus-visible:opacity-100",
          copied ? "opacity-100 text-foreground" : null,
        )}
      >
        <HugeiconsIcon
          icon={(copied ? Tick02FreeIcons : Copy01FreeIcons) as IconSvgElement}
          size={11}
          strokeWidth={2}
        />
        {copied ? t("common.copied") : t("common.copy")}
      </button>
    </div>
  )
}

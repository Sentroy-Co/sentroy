"use client"

import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

const CopyIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="5" y="5" width="9" height="9" rx="1.5" />
    <path d="M3 11V3.5C3 2.67157 3.67157 2 4.5 2H11" />
  </svg>
)

const LinkIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M6.5 9.5l3-3" />
    <path d="M9 5l1.5-1.5a3 3 0 1 1 4.24 4.24L13.24 9.24" />
    <path d="M7 11l-1.5 1.5a3 3 0 1 1-4.24-4.24L2.76 6.76" />
  </svg>
)

const CursorIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M2 2v10.5l3.5-2.5h7.5L2 2z" />
  </svg>
)

const ChatGPTIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M8 1a4 4 0 0 0-3.46 6.01A4 4 0 0 0 5.54 14a4 4 0 0 0 6.93-1A4 4 0 0 0 11.46 5 4 4 0 0 0 8 1z" />
    <path d="M8 5v6M5 8h6" strokeWidth="0.8" />
  </svg>
)

const ClaudeIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M8 2.2v11.6M3.6 3.9l8.8 8.2M12.4 3.9l-8.8 8.2M2.4 8h11.2" />
  </svg>
)

const LlmIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="3" y="2" width="10" height="12" rx="1.5" />
    <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
  </svg>
)

const ChevronIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <polyline points="4 6 8 10 12 6" />
  </svg>
)

const CheckIcon = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 8.5L6.5 12L13 4" />
  </svg>
)

const PROMPT_PREFIX =
  "Read this Sentroy documentation page and help me apply it to my project. Ask clarifying questions before generating code."

function pageMarkdown(): string {
  if (typeof document === "undefined") return ""
  const article = document.querySelector("article")
  if (!article) return ""
  // innerText preserves layout much better than textContent for our
  // section + code-block tree — tooltip + nav junk is excluded already
  // because the article only wraps the page body.
  return (article as HTMLElement).innerText.trim()
}

function pageUrl(): string {
  if (typeof window === "undefined") return ""
  return window.location.href.split("#")[0]!
}

export function PageActions() {
  const [copied, setCopied] = useState<"page" | "link" | null>(null)

  const flash = (kind: "page" | "link") => {
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  const copyPage = async () => {
    const md = pageMarkdown()
    if (!md) return
    await navigator.clipboard.writeText(md)
    flash("page")
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(pageUrl())
    flash("link")
  }

  const sendToCursor = () => {
    const md = pageMarkdown()
    const url = pageUrl()
    const prompt = `${PROMPT_PREFIX}\n\nSource: ${url}\n\n---\n\n${md}`
    // Cursor 0.40+ deep-link spec. If the protocol isn't registered the
    // browser silently no-ops, so we also stash the text on the
    // clipboard as a graceful fallback.
    void navigator.clipboard.writeText(prompt)
    const deepLink = `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(prompt)}`
    window.location.href = deepLink
  }

  const openInChatGPT = () => {
    const md = pageMarkdown()
    const url = pageUrl()
    const prompt = `${PROMPT_PREFIX}\n\nSource: ${url}\n\n${md}`
    // ChatGPT's web client accepts a `?q=` query param as the seed
    // prompt. We trim aggressively because URLs over ~8K start to break
    // in some browsers; the docs pages stay well under that.
    const trimmed = prompt.length > 7500 ? prompt.slice(0, 7500) + "\n\n[truncated]" : prompt
    window.open(
      `https://chat.openai.com/?q=${encodeURIComponent(trimmed)}`,
      "_blank",
      "noopener,noreferrer",
    )
  }

  const openInClaude = () => {
    const md = pageMarkdown()
    const url = pageUrl()
    const prompt = `${PROMPT_PREFIX}\n\nSource: ${url}\n\n${md}`
    // claude.ai seeds a new chat from `?q=`. Same ~8K URL ceiling as the
    // ChatGPT path, so trim identically.
    const trimmed = prompt.length > 7500 ? prompt.slice(0, 7500) + "\n\n[truncated]" : prompt
    window.open(
      `https://claude.ai/new?q=${encodeURIComponent(trimmed)}`,
      "_blank",
      "noopener,noreferrer",
    )
  }

  const openLlmText = () => {
    // The full plain-text, LLM-optimised mirror of the entire docs set —
    // served at the site root (apps/core/public/llms-full.txt). Ideal to
    // paste/upload into a model with a large context window.
    window.open("/llms-full.txt", "_blank", "noopener,noreferrer")
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={copyPage}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium text-muted-foreground transition hover:text-foreground",
          copied === "page" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
        )}
      >
        {copied === "page" ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        <span className="hidden sm:inline">{copied === "page" ? "Copied" : "Copy page"}</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
              aria-label="More actions"
            >
              <ChevronIcon className="size-3.5" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={copyLink}>
            {copied === "link" ? (
              <CheckIcon className="size-3.5 text-emerald-500" />
            ) : (
              <LinkIcon className="size-3.5" />
            )}
            <span>{copied === "link" ? "Link copied" : "Copy page link"}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={sendToCursor}>
            <CursorIcon className="size-3.5" />
            <span>Send to Cursor</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openInChatGPT}>
            <ChatGPTIcon className="size-3.5" />
            <span>Open in ChatGPT</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openInClaude}>
            <ClaudeIcon className="size-3.5" />
            <span>Open in Claude</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openLlmText}>
            <LlmIcon className="size-3.5" />
            <span>View as LLM text (llms-full.txt)</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

import "server-only"
import { createHighlighter, type Highlighter } from "shiki"
import { injectPlaceholderMarkers } from "./placeholders"

const SUPPORTED_LANGS = [
  "ts",
  "tsx",
  "js",
  "jsonc",
  "json",
  "bash",
  "go",
  "python",
  "php",
  "html",
  "http",
  "markdown",
] as const

export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "aurora-x"],
      langs: [...SUPPORTED_LANGS],
    })
  }
  return highlighterPromise
}

/**
 * Pre-process step rewrites `stk_...` and `my-company` literals to inert
 * markers so shiki tokenizes them as plain identifiers. The client-side
 * code-block wrapper then replaces the markers with the user's saved
 * credentials at render time — no need to re-highlight on change.
 */
export async function highlight(code: string, lang: SupportedLang): Promise<string> {
  const highlighter = await getHighlighter()
  const processed = injectPlaceholderMarkers(code.trim())
  return highlighter.codeToHtml(processed, {
    lang,
    themes: { light: "github-light", dark: "aurora-x" },
    defaultColor: false,
  })
}

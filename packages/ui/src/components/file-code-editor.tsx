"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Bağımsız, yeniden kullanılabilir metin/kod/markdown dosya editörü — web'in
 * `FilePreviewLightbox` içindeki `TextViewer`'ının paket seviyesine çıkarılmış
 * hali. `url`'den içeriği çeker (≤512 KB), uzantıya göre Monaco (kod) / MDEditor
 * (.md, canlı preview) / HTML sandbox-iframe önizleme sunar; `onSave` verilirse
 * kendi toolbar'ında Save + (HTML'de) Preview/Code toggle gösterir.
 *
 * Herhangi bir app (storage editor embed, mail, core, …) doğrudan tüketebilir —
 * backend bağı yok; kaydetme tamamen `onSave` callback'i üzerinden.
 */

const MonacoLazy = dynamic(
  () => import("./monaco-code-editor").then((m) => m.MonacoCodeEditor),
  { ssr: false, loading: () => <EditorFallback>…</EditorFallback> },
)
const MarkdownLazy = dynamic(
  () => import("./markdown-editor").then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <EditorFallback>…</EditorFallback> },
)

// Uzantı → Monaco dil id (monaco-code-editor EXT_LANG ile senkron; inline —
// o modülü statik import etmek Monaco'yu ana bundle'a sokardı).
const EXT_LANG: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", json: "json",
  html: "html", htm: "html", vue: "html", svelte: "html",
  css: "css", scss: "scss", less: "less", md: "markdown", markdown: "markdown",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin",
  c: "c", cc: "cpp", cpp: "cpp", h: "cpp", hpp: "cpp", cs: "csharp",
  php: "php", swift: "swift", sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql", yml: "yaml", yaml: "yaml", xml: "xml", toml: "ini", ini: "ini",
  env: "ini", conf: "ini", graphql: "graphql", gql: "graphql",
  csv: "plaintext", tsv: "plaintext", txt: "plaintext", log: "plaintext",
}
function monacoLang(name: string): string {
  if (name.toLowerCase() === "dockerfile") return "dockerfile"
  const ext = name.split(".").pop()?.toLowerCase() || ""
  return EXT_LANG[ext] || "plaintext"
}
function isHtmlName(name: string, mime?: string): boolean {
  if ((mime || "").toLowerCase().includes("html")) return true
  return /\.(html?|svelte|vue)$/i.test(name)
}
function isMarkdownName(name: string, mime?: string): boolean {
  if ((mime || "").toLowerCase().includes("markdown")) return true
  return /\.(md|markdown|mdx)$/i.test(name)
}

function EditorFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
      {children}
    </div>
  )
}

export interface FileCodeEditorProps {
  /** İçerik kaynağı URL'i (fetch edilir). Public `/f/:id` veya private download route. */
  url: string
  /** Dosya adı — dil/tip çıkarımı (monaco lang, html/md tespiti). */
  fileName: string
  /** İçerik MIME'ı (html/markdown tespitine yardımcı; opsiyonel). */
  mimeType?: string
  /** İçeriği kaydet (verilmezse editör salt-okunur). */
  onSave?: (content: string) => Promise<void>
  /** Salt-okunur zorla (onSave olsa bile). */
  readOnly?: boolean
  /** `dark` | `light` — verilmezse `<html class="dark">`'tan çıkarılır. */
  theme?: "dark" | "light"
  /** Save başarılı olunca. */
  onSaved?: () => void
  className?: string
}

export function FileCodeEditor({
  url,
  fileName,
  mimeType,
  onSave,
  readOnly,
  theme,
  onSaved,
  className,
}: FileCodeEditorProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  // handleSave stabil kalsın diye draft/content ref'lerden okunur.
  const draftRef = useRef(draft)
  draftRef.current = draft
  const contentRef = useRef(content)
  contentRef.current = content

  const html = isHtmlName(fileName, mimeType)
  const md = isMarkdownName(fileName, mimeType)
  const isDark =
    theme != null
      ? theme === "dark"
      : typeof document !== "undefined"
        ? document.documentElement.classList.contains("dark")
        : true
  const editorTheme: "dark" | "light" = isDark ? "dark" : "light"

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)
    setTruncated(false)
    setShowPreview(false)
    // Per-mount cache-buster → dosyayı olabildiğince taze çek.
    const sep = url.includes("?") ? "&" : "?"
    fetch(`${url}${sep}_t=${Date.now()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        // ≤512 KB → büyük log dosyası tarayıcıyı kilitlemesin.
        const MAX = 512 * 1024
        const slice = blob.size > MAX ? blob.slice(0, MAX) : blob
        const text = await slice.text()
        if (!cancelled) {
          setContent(text)
          setDraft(text)
          setTruncated(blob.size > MAX)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch")
      })
    return () => {
      cancelled = true
    }
  }, [url])

  // Truncated dosyada edit KAPALI (ilk 512KB'ı yazıp gerisini silerdi).
  const editable = !!onSave && !readOnly && !truncated
  const dirty = editable && content !== null && draft !== content

  const handleSave = useCallback(async () => {
    if (!onSave) return
    const d = draftRef.current
    if (d === contentRef.current) return
    setSaving(true)
    try {
      await onSave(d)
      // Kaydedilen içerik authoritative — refetch YAPMA (CF stale cache).
      setContent(d)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }, [onSave, onSaved])

  // Cmd/Ctrl+S ile kaydet.
  useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (dirty && !saving) void handleSave()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editable, dirty, saving, handleSave])

  if (error) return <EditorFallback>{error}</EditorFallback>
  if (content === null) return <EditorFallback>…</EditorFallback>

  const showToolbar = editable || html
  const previewSrc = html ? draft : ""

  return (
    <div className={cn("flex h-full w-full flex-col bg-background", className)}>
      {showToolbar && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-background/95 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
            {fileName}
          </span>
          {html && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {showPreview ? "Code" : "Preview"}
            </button>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                dirty && !saving
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      )}
      {truncated && (
        <div className="shrink-0 border-b bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-700 dark:text-amber-400">
          File truncated to first 512 KB — read-only
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {md ? (
          <MarkdownLazy
            value={editable ? draft : content}
            theme={editorTheme}
            readOnly={!editable}
            onChange={editable ? setDraft : undefined}
          />
        ) : html && showPreview ? (
          <iframe
            title="HTML preview"
            // JS + modal/popup/form çalışsın; allow-same-origin YOK → preview
            // opaque-origin'de kalır (parent session/cookie'lerine erişemez).
            sandbox="allow-scripts allow-modals allow-popups allow-forms allow-pointer-lock"
            srcDoc={previewSrc}
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <MonacoLazy
            value={editable ? draft : content}
            language={monacoLang(fileName)}
            theme={editorTheme}
            readOnly={!editable}
            onChange={editable ? setDraft : undefined}
          />
        )}
      </div>
    </div>
  )
}

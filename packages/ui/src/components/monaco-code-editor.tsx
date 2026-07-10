"use client"

import Editor, { type BeforeMount } from "@monaco-editor/react"

/**
 * Monaco tabanlı kod/metin editörü (dosya görüntüleyici/düzenleyici).
 * `@monaco-editor/react` default loader'ı monaco'yu getirir. github-light /
 * github-dark temaları `beforeMount`'ta tanımlanır. Lazy import
 * (next/dynamic ssr:false) ile tüketilmeli — monaco ana bundle'a girmesin.
 *
 * NOT (open-source follow-up): default loader monaco'yu jsdelivr CDN'den
 * çeker (CSP-report-only'de izinli). Tam offline/self-host için
 * `loader.config({ paths: { vs: "/monaco/vs" }})` + monaco `vs` dizinini
 * app public'ine kopyalamak gerekir.
 */

// GitHub renk paleti (monaco defineTheme). Token adları monaco standardı.
const GITHUB_DARK = {
  base: "vs-dark" as const,
  inherit: true,
  rules: [
    { token: "comment", foreground: "8b949e", fontStyle: "italic" },
    { token: "string", foreground: "a5d6ff" },
    { token: "keyword", foreground: "ff7b72" },
    { token: "number", foreground: "79c0ff" },
    { token: "type", foreground: "ffa657" },
    { token: "function", foreground: "d2a8ff" },
    { token: "variable", foreground: "ffa657" },
    { token: "tag", foreground: "7ee787" },
    { token: "attribute.name", foreground: "79c0ff" },
    { token: "delimiter", foreground: "e6edf3" },
  ],
  colors: {
    "editor.background": "#0d1117",
    "editor.foreground": "#e6edf3",
    "editorLineNumber.foreground": "#6e7681",
    "editorLineNumber.activeForeground": "#e6edf3",
    "editor.selectionBackground": "#264f7855",
    "editor.lineHighlightBackground": "#161b2288",
    "editorCursor.foreground": "#e6edf3",
    "editorWidget.background": "#161b22",
    "editorGutter.background": "#0d1117",
  },
}

const GITHUB_LIGHT = {
  base: "vs" as const,
  inherit: true,
  rules: [
    { token: "comment", foreground: "6e7781", fontStyle: "italic" },
    { token: "string", foreground: "0a3069" },
    { token: "keyword", foreground: "cf222e" },
    { token: "number", foreground: "0550ae" },
    { token: "type", foreground: "953800" },
    { token: "function", foreground: "8250df" },
    { token: "variable", foreground: "953800" },
    { token: "tag", foreground: "116329" },
    { token: "attribute.name", foreground: "0550ae" },
    { token: "delimiter", foreground: "1f2328" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#1f2328",
    "editorLineNumber.foreground": "#8c959f",
    "editorLineNumber.activeForeground": "#1f2328",
    "editor.selectionBackground": "#0969da22",
    "editor.lineHighlightBackground": "#f6f8fa",
    "editorCursor.foreground": "#1f2328",
    "editorGutter.background": "#ffffff",
  },
}

const EXT_LANG: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", json: "json",
  html: "html", htm: "html", vue: "html", svelte: "html",
  css: "css", scss: "scss", less: "less",
  md: "markdown", markdown: "markdown",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin",
  c: "c", cc: "cpp", cpp: "cpp", h: "cpp", hpp: "cpp", cs: "csharp",
  php: "php", swift: "swift",
  sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql", yml: "yaml", yaml: "yaml", xml: "xml",
  toml: "ini", ini: "ini", env: "ini", conf: "ini",
  graphql: "graphql", gql: "graphql",
  csv: "plaintext", tsv: "plaintext", txt: "plaintext", log: "plaintext",
}

/** Dosya adından monaco dil id'si çıkar. */
export function languageForName(name: string): string {
  if (name.toLowerCase() === "dockerfile") return "dockerfile"
  const ext = name.split(".").pop()?.toLowerCase() || ""
  return EXT_LANG[ext] || "plaintext"
}

export interface MonacoCodeEditorProps {
  value: string
  language: string
  theme?: "light" | "dark"
  readOnly?: boolean
  onChange?: (value: string) => void
}

export function MonacoCodeEditor({
  value,
  language,
  theme = "dark",
  readOnly,
  onChange,
}: MonacoCodeEditorProps) {
  const beforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("github-light", GITHUB_LIGHT)
    monaco.editor.defineTheme("github-dark", GITHUB_DARK)
  }

  return (
    <Editor
      value={value}
      language={language}
      theme={theme === "light" ? "github-light" : "github-dark"}
      beforeMount={beforeMount}
      onChange={(v) => onChange?.(v ?? "")}
      loading={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading editor…
        </div>
      }
      options={{
        readOnly: !!readOnly,
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: "selection",
        smoothScrolling: true,
        padding: { top: 12, bottom: 12 },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
      height="100%"
    />
  )
}

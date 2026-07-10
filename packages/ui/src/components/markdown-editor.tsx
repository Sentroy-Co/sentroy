"use client"

import MDEditor from "@uiw/react-md-editor"
import "@uiw/react-md-editor/markdown-editor.css"

/**
 * Markdown editör — `@uiw/react-md-editor` (toolbar: kalın/italik/başlık/liste/
 * link/kod/tablo… + canlı yan-yana preview). OS not-defteri hissi. Lazy import
 * (next/dynamic ssr:false) ile tüketilmeli; `window` kullanır. Dark/light
 * `data-color-mode` ile.
 */
export interface MarkdownEditorProps {
  value: string
  theme?: "light" | "dark"
  readOnly?: boolean
  onChange?: (v: string) => void
}

export function MarkdownEditor({
  value,
  theme = "dark",
  readOnly,
  onChange,
}: MarkdownEditorProps) {
  return (
    <div
      data-color-mode={theme}
      className="flex h-full w-full flex-col overflow-hidden bg-background"
    >
      {readOnly ? (
        <div className="h-full overflow-auto p-5">
          <MDEditor.Markdown source={value} style={{ background: "transparent" }} />
        </div>
      ) : (
        <MDEditor
          value={value}
          onChange={(v) => onChange?.(v ?? "")}
          height="100%"
          preview="live"
          visibleDragbar={false}
        />
      )}
    </div>
  )
}

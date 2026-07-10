"use client"

import { useMemo } from "react"
import Editor from "react-simple-code-editor"
import Prism from "prismjs"
import "prismjs/components/prism-markup"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Syntax highlighted textarea — `react-simple-code-editor` + Prism.
 * HTML / MJML / XML gibi markup dillerini `language` prop'u ile destekler.
 * Tema tokenleri app'in light/dark varyantlarina uyum saglar.
 */

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: "markup" | "html" | "xml"
  disabled?: boolean
  placeholder?: string
  /** Piksel veya CSS uzunlugu. Alanin minimum yuksekligini belirler. */
  minHeight?: number | string
  /** Verilirse alani sabit tavanda kapatir; uzun icerik wrapper icinde
   *  kaydirilir, dis layout'u ezmez. Sayisal piksel ya da CSS string. */
  maxHeight?: number | string
  className?: string
  /** Tab tusuyla girinti. Default: 2. */
  tabSize?: number
}

export function CodeEditor({
  value,
  onChange,
  language = "markup",
  disabled,
  placeholder,
  minHeight = 400,
  maxHeight,
  className,
  tabSize = 2,
}: CodeEditorProps) {
  const minH = typeof minHeight === "number" ? `${minHeight}px` : minHeight
  const maxH =
    maxHeight === undefined
      ? undefined
      : typeof maxHeight === "number"
        ? `${maxHeight}px`
        : maxHeight

  const highlightFn = useMemo(() => {
    const grammar = Prism.languages[language] ?? Prism.languages.markup
    return (code: string) => Prism.highlight(code, grammar, language)
  }, [language])

  return (
    <div
      className={cn(
        "code-editor relative overflow-auto rounded-xl border border-transparent bg-input/50 font-mono text-xs leading-relaxed transition-[color,box-shadow,background-color] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
      style={{ minHeight: minH, maxHeight: maxH }}
    >
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={highlightFn}
        padding={16}
        tabSize={tabSize}
        insertSpaces
        disabled={disabled}
        placeholder={placeholder}
        textareaClassName="code-editor-textarea outline-none"
        preClassName="code-editor-pre"
        style={{
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          minHeight: minH,
        }}
      />
    </div>
  )
}

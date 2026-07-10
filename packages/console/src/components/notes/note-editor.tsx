"use client"

import { useState, useRef } from "react"
import { useTranslations } from "next-intl"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Mention from "@tiptap/extension-mention"
import Underline from "@tiptap/extension-underline"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  TextStrikethroughIcon,
  TextFontIcon,
  ListViewIcon,
  LeftToRightListNumberIcon,
  QuoteDownIcon,
} from "@hugeicons/core-free-icons"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

export interface MentionHit {
  id: string
  name: string
  image: string | null
  kind: "user" | "app"
}

export interface NoteEditorValue {
  html: string
  text: string
  mentions: string[]
}

/**
 * Sentroy OS Notlar için ADANMIŞ editör (post `RichEditor`'dan ayrı — posts'a
 * dokunmaz). Apple Notes paritesi:
 *  - StarterKit heading 1-3 AÇIK → Title/Heading/Subheading + Body(p) + Monostyled(codeBlock)
 *  - Toolbar: "Aa" DropdownMenu (format seviyeleri + listeler + quote) + B/I/U/S
 *  - Boş not `<h1></h1>` ile açılır → ilk satır Title, Enter → Body (StarterKit default)
 *  - Tüm alanı doldurur (composer `max-h-64` YOK)
 *  - @kullanıcı/@uygulama mention (popup mantığı RichEditor'dan uyarlandı)
 *
 * Not değişince `key={noteId}` ile remount (initialHtml yeniden okunur).
 */
export function NoteEditor({
  mentionSearchUrl,
  initialHtml,
  placeholder,
  onChange,
}: {
  mentionSearchUrl: string
  initialHtml?: string
  placeholder?: string
  onChange: (value: NoteEditorValue) => void
}) {
  const t = useTranslations("os")
  const [popup, setPopup] = useState<{
    items: MentionHit[]
    rect: { left: number; top: number; bottom: number } | null
  } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const commandRef = useRef<((item: { id: string; label: string }) => void) | null>(null)
  const itemsRef = useRef<MentionHit[]>([])
  const indexRef = useRef(0)
  indexRef.current = activeIndex
  const wrapperRef = useRef<HTMLDivElement>(null)

  const emit = (editor: Editor) => {
    const text = editor.getText()
    const mentions: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === "mention") {
        const id = node.attrs.id as string | undefined
        if (id) mentions.push(id)
      }
    })
    onChange({
      html: editor.isEmpty ? "" : editor.getHTML(),
      text,
      mentions: Array.from(new Set(mentions)),
    })
  }

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: "end",
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? placeholder ?? ""
            : "",
      }),
      Mention.configure({
        HTMLAttributes: { class: "rounded bg-primary/10 px-1 font-medium text-primary" },
        suggestion: {
          char: "@",
          items: async ({ query }: { query: string }) => {
            try {
              const res = await fetch(`${mentionSearchUrl}?q=${encodeURIComponent(query)}`)
              if (!res.ok) return []
              const json = await res.json()
              return (json?.data ?? []) as MentionHit[]
            } catch {
              return []
            }
          },
          render: () => ({
            onStart: (props: {
              items: MentionHit[]
              command: (a: { id: string; label: string }) => void
              clientRect?: (() => DOMRect | null) | null
            }) => {
              commandRef.current = props.command
              itemsRef.current = props.items
              setActiveIndex(0)
              const r = props.clientRect?.()
              setPopup({ items: props.items, rect: r ? { left: r.left, top: r.top, bottom: r.bottom } : null })
            },
            onUpdate: (props: {
              items: MentionHit[]
              command: (a: { id: string; label: string }) => void
              clientRect?: (() => DOMRect | null) | null
            }) => {
              commandRef.current = props.command
              itemsRef.current = props.items
              const r = props.clientRect?.()
              setPopup({ items: props.items, rect: r ? { left: r.left, top: r.top, bottom: r.bottom } : null })
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              const items = itemsRef.current
              if (props.event.key === "ArrowDown") {
                setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0))
                return true
              }
              if (props.event.key === "ArrowUp") {
                setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
                return true
              }
              if (props.event.key === "Enter") {
                const item = items[indexRef.current]
                if (item) {
                  commandRef.current?.({ id: item.id, label: item.name })
                  return true
                }
              }
              if (props.event.key === "Escape") {
                setPopup(null)
                return true
              }
              return false
            },
            onExit: () => {
              setPopup(null)
              itemsRef.current = []
            },
          }),
        },
      }),
    ],
    content: initialHtml && initialHtml.trim() ? initialHtml : "<h1></h1>",
    onUpdate: ({ editor }) => emit(editor),
  })

  if (!editor) return null

  const wrapperRect = wrapperRef.current?.getBoundingClientRect()
  const popupPos =
    popup?.rect && wrapperRect
      ? { left: popup.rect.left - wrapperRect.left, top: popup.rect.bottom - wrapperRect.top + 4 }
      : null

  const ibtn = (active: boolean) =>
    cn(
      "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
      active && "bg-foreground/10 text-foreground",
    )

  const LEVELS: { key: string; label: string; active: () => boolean; run: () => void; cls: string }[] = [
    { key: "title", label: t("notes.fmtTitle"), active: () => editor.isActive("heading", { level: 1 }), run: () => editor.chain().focus().setHeading({ level: 1 }).run(), cls: "text-lg font-bold" },
    { key: "heading", label: t("notes.fmtHeading"), active: () => editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().setHeading({ level: 2 }).run(), cls: "text-base font-bold" },
    { key: "subheading", label: t("notes.fmtSubheading"), active: () => editor.isActive("heading", { level: 3 }), run: () => editor.chain().focus().setHeading({ level: 3 }).run(), cls: "text-sm font-semibold" },
    { key: "body", label: t("notes.fmtBody"), active: () => editor.isActive("paragraph"), run: () => editor.chain().focus().setParagraph().run(), cls: "text-sm" },
    { key: "mono", label: t("notes.fmtMono"), active: () => editor.isActive("codeBlock"), run: () => editor.chain().focus().toggleCodeBlock().run(), cls: "text-sm font-mono" },
  ]
  const LISTS: { key: string; label: string; icon: typeof ListViewIcon; active: () => boolean; run: () => void }[] = [
    { key: "bullet", label: t("notes.fmtBulleted"), icon: ListViewIcon, active: () => editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { key: "ordered", label: t("notes.fmtNumbered"), icon: LeftToRightListNumberIcon, active: () => editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { key: "quote", label: t("notes.fmtQuote"), icon: QuoteDownIcon, active: () => editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col" ref={wrapperRef}>
      {/* Toolbar — Aa format menü + inline stiller */}
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-7 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            aria-label={t("notes.format")}
            title={t("notes.format")}
          >
            <HugeiconsIcon icon={TextFontIcon} strokeWidth={2} className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {LEVELS.map((l) => (
              <DropdownMenuItem
                key={l.key}
                onClick={l.run}
                className={cn(l.cls, l.active() && "bg-accent")}
              >
                {l.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {LISTS.map((l) => (
              <DropdownMenuItem
                key={l.key}
                onClick={l.run}
                className={cn("gap-2 text-sm", l.active() && "bg-accent")}
              >
                <HugeiconsIcon icon={l.icon} strokeWidth={2} className="size-4" />
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="mx-1 h-4 w-px bg-border" />

        <button type="button" className={ibtn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">
          <HugeiconsIcon icon={TextBoldIcon} strokeWidth={2} className="size-4" />
        </button>
        <button type="button" className={ibtn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">
          <HugeiconsIcon icon={TextItalicIcon} strokeWidth={2} className="size-4" />
        </button>
        <button type="button" className={ibtn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="Underline">
          <HugeiconsIcon icon={TextUnderlineIcon} strokeWidth={2} className="size-4" />
        </button>
        <button type="button" className={ibtn(editor.isActive("strike"))} onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="Strikethrough">
          <HugeiconsIcon icon={TextStrikethroughIcon} strokeWidth={2} className="size-4" />
        </button>
      </div>

      {/* İçerik — tüm alanı doldurur */}
      <EditorContent
        editor={editor}
        className="tiptap-note min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-relaxed outline-none [&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h2]:mb-1.5 [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:bg-muted [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-sm [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-primary/40 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_p.is-empty:first-child::before]:pointer-events-none [&_.ProseMirror_.is-empty::before]:pointer-events-none [&_.ProseMirror_.is-empty::before]:float-left [&_.ProseMirror_.is-empty::before]:h-0 [&_.ProseMirror_.is-empty::before]:text-muted-foreground/50 [&_.ProseMirror_.is-empty::before]:content-[attr(data-placeholder)]"
      />

      {popup && popup.items.length > 0 && popupPos ? (
        <ul
          className="absolute z-[200] max-h-56 w-60 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
          style={{ left: popupPos.left, top: popupPos.top }}
        >
          {popup.items.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  commandRef.current?.({ id: it.id, label: it.name })
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                  i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span className="truncate">{it.name}</span>
                {it.kind === "app" ? (
                  <span className="ml-auto rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
                    app
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

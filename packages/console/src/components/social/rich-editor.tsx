"use client"

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Mention from "@tiptap/extension-mention"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  TextBoldIcon,
  TextItalicIcon,
  ListViewIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

export interface MentionHit {
  /** user → userId; app → `app:<key>`. */
  id: string
  name: string
  image: string | null
  kind: "user" | "app"
}

export interface RichEditorValue {
  /** Sanitize EDİLMEMİŞ HTML (server-side sanitize edilir). Boş içerikte "". */
  html: string
  /** Düz metin (fallback/preview/limit kontrolü). */
  text: string
  /** Mention edilen kullanıcı id'leri. */
  mentions: string[]
}

export interface RichEditorHandle {
  clear: () => void
  focus: () => void
}

/**
 * Twitter-tarzı zengin post editörü (TipTap). StarterKit (kalın/italik/liste/
 * kod/link) + `@mention` autocomplete (şirket üyeleri). `onChange` her
 * değişimde {html,text,mentions} verir; HTML server-side sanitize edilir.
 */
export const RichEditor = forwardRef<RichEditorHandle, {
  placeholder?: string
  /** Mention arama endpoint'i — `?q=` ile çağrılır. */
  mentionSearchUrl: string
  onChange: (value: RichEditorValue) => void
  disabled?: boolean
  /** Başlangıç HTML içeriği (yalnız mount'ta okunur). Mevcut bir kaydı
   *  düzenlerken (örn. Notlar) doldurmak için — içerik değişince editörü
   *  `key` ile remount et. Boş → composer davranışı (varsayılan). */
  initialHtml?: string
}>(function RichEditor({ placeholder, mentionSearchUrl, onChange, disabled, initialHtml }, ref) {
  // Mention popup state — suggestion render'ı buraya köprüler.
  const [popup, setPopup] = useState<{
    items: MentionHit[]
    rect: { left: number; top: number; bottom: number } | null
  } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  // Link ekleme dialog'u (window.prompt yerine).
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  // Suggestion closure'ları stale state görmesin diye ref'ler.
  const commandRef = useRef<((item: { id: string; label: string }) => void) | null>(null)
  const itemsRef = useRef<MentionHit[]>([])
  const indexRef = useRef(0)
  indexRef.current = activeIndex
  // Popup, editor'ün `relative` wrapper'ına göre absolute konumlanır —
  // caret'in viewport rect'inden wrapper rect'i çıkarılır. Böylece
  // transform'lu ata (framer-motion / vaul drawer) `position: fixed`'i
  // bozmaz ve popup drawer DOM'u içinde kalır (dışarı-tıkla-kapat yok).
  const wrapperRef = useRef<HTMLDivElement>(null)

  const select = (item: MentionHit) => {
    commandRef.current?.({ id: item.id, label: item.name })
  }

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
    editable: !disabled,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Mention.configure({
        HTMLAttributes: {
          class:
            "rounded bg-primary/10 px-1 font-medium text-primary",
        },
        suggestion: {
          char: "@",
          items: async ({ query }: { query: string }) => {
            try {
              const res = await fetch(
                `${mentionSearchUrl}?q=${encodeURIComponent(query)}`,
              )
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
              setPopup({
                items: props.items,
                rect: r ? { left: r.left, top: r.top, bottom: r.bottom } : null,
              })
            },
            onUpdate: (props: {
              items: MentionHit[]
              command: (a: { id: string; label: string }) => void
              clientRect?: (() => DOMRect | null) | null
            }) => {
              commandRef.current = props.command
              itemsRef.current = props.items
              const r = props.clientRect?.()
              setPopup({
                items: props.items,
                rect: r ? { left: r.left, top: r.top, bottom: r.bottom } : null,
              })
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              const items = itemsRef.current
              if (props.event.key === "ArrowDown") {
                setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0))
                return true
              }
              if (props.event.key === "ArrowUp") {
                setActiveIndex((i) =>
                  items.length ? (i - 1 + items.length) % items.length : 0,
                )
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
    content: initialHtml ?? "",
    onUpdate: ({ editor }) => emit(editor),
  })

  useImperativeHandle(ref, () => ({
    clear: () => editor?.commands.clearContent(true),
    focus: () => editor?.commands.focus(),
  }))

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  if (!editor) return null

  const tbtn = (active: boolean) =>
    cn(
      "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground",
      active && "bg-foreground/10 text-foreground",
    )

  const applyLink = () => {
    const url = linkUrl.trim()
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
    else editor.chain().focus().unsetLink().run()
    setLinkOpen(false)
  }

  // Caret viewport rect → wrapper-relative absolute konum.
  const wrapperRect = wrapperRef.current?.getBoundingClientRect()
  const popupPos =
    popup?.rect && wrapperRect
      ? {
          left: popup.rect.left - wrapperRect.left,
          top: popup.rect.bottom - wrapperRect.top + 4,
        }
      : null

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Metin seçilince çıkan tooltip-tarzı biçim çubuğu (her zaman görünmez) */}
      <BubbleMenu editor={editor}>
        <div className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
          <button type="button" className={tbtn(editor.isActive("bold"))} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">
            <HugeiconsIcon icon={TextBoldIcon} className="size-4" strokeWidth={2} />
          </button>
          <button type="button" className={tbtn(editor.isActive("italic"))} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">
            <HugeiconsIcon icon={TextItalicIcon} className="size-4" strokeWidth={2} />
          </button>
          <button type="button" className={tbtn(editor.isActive("bulletList"))} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="List">
            <HugeiconsIcon icon={ListViewIcon} className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            className={tbtn(editor.isActive("link"))}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setLinkUrl((editor.getAttributes("link").href as string) ?? "")
              setLinkOpen(true)
            }}
            aria-label="Link"
          >
            <HugeiconsIcon icon={Link01Icon} className="size-4" strokeWidth={2} />
          </button>
        </div>
      </BubbleMenu>

      <EditorContent
        editor={editor}
        className="prose-sm tiptap-post max-h-64 min-h-[44px] overflow-y-auto rounded-lg border bg-background px-3 py-2 text-[15px] leading-relaxed outline-none focus-within:ring-2 focus-within:ring-ring [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
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
                  select(it)
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                  i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center overflow-hidden text-[10px] font-semibold",
                    it.kind === "app"
                      ? "rounded-md bg-foreground/10 text-foreground"
                      : "rounded-full bg-primary/10 text-primary",
                  )}
                >
                  {it.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image} alt="" className="size-full object-cover" />
                  ) : (
                    (it.name[0] ?? "?").toUpperCase()
                  )}
                </span>
                <span className="flex-1 truncate">{it.name}</span>
                {it.kind === "app" ? (
                  <span className="shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    app
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Link</DialogTitle>
          </DialogHeader>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                applyLink()
              }
            }}
          />
          <DialogFooter>
            {editor.isActive("link") ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  editor.chain().focus().unsetLink().run()
                  setLinkOpen(false)
                }}
              >
                Remove
              </Button>
            ) : null}
            <Button type="button" onClick={applyLink}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})

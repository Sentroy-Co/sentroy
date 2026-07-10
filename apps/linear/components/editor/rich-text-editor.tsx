"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import { Markdown } from "tiptap-markdown"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  TextBoldFreeIcons,
  TextItalicFreeIcons,
  TextStrikethroughFreeIcons,
  CodeFreeIcons,
  CodeSquareFreeIcons,
  Link01FreeIcons,
  LeftToRightListBulletFreeIcons,
  LeftToRightListNumberFreeIcons,
  Image02FreeIcons,
} from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { useDashPaths } from "@/lib/router-compat"

type WithMarkdown = Editor & {
  storage: { markdown: { getMarkdown: () => string } }
}
const getMd = (editor: Editor): string =>
  (editor as WithMarkdown).storage.markdown.getMarkdown()

export type RichTextEditorHandle = {
  /**
   * `content` markdown string olabilir veya ProseMirror JSON doc
   * (Linear template'lerinden gelen descriptionData gibi). JSON
   * doc verildiğinde `mode` ne olursa olsun replace gibi davranır.
   */
  applyContent: (
    content: string | object,
    mode: "replace" | "append",
  ) => void
  focus: () => void
}

type Props = {
  value: string
  onChange: (markdown: string) => void
  onSubmit?: () => void
  onEmptyBackspace?: () => void
  onBlur?: (markdown: string) => void
  placeholder?: string
  autoFocus?: boolean
  minHeight?: number
  maxHeight?: number
  className?: string
  contentClassName?: string
  ariaLabel?: string
  /**
   * Mount-time override — verilirse `value` yerine bu doc/string'le
   * init edilir, sonra onUpdate ile markdown çıkarılıp `onChange`'e
   * akıtılır. Linear template'lerinden gelen ProseMirror JSON için
   * (markdown extension'ın inline setContent intercept'ini bypass
   * eder; sadece taze mount'ta uygulanır).
   */
  initialContent?: string | object
}

/**
 * Bir DataTransfer'dan (paste/drop) görsel dosyalarını toplar. `files`'a EK
 * olarak `items`'taki blob'ları da alır — bu kritik: bir web sayfasından
 * (veya Linear'dan) KOPYALANAN görsel pano'ya `files` yerine genelde
 * `items` içinde image blob'u + ayrıca `text/html` (`<img src="…">`) olarak
 * düşer. Yalnız `files`'a bakılırsa blob kaçırılır ve TipTap varsayılanı
 * harici (ör. Linear) URL'li `<img>`'i olduğu gibi gömer — yükleme yapılmaz.
 * Blob'u burada yakalayıp upload endpoint'i (Sentroy) üzerinden yükleriz.
 */
function imageFilesFromTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return []
  const out: File[] = []
  const seen = new Set<string>()
  const add = (f: File | null | undefined) => {
    if (!f || !f.type.startsWith("image/")) return
    const key = `${f.name}:${f.size}:${f.lastModified}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(f)
  }
  for (const f of Array.from(dt.files ?? [])) add(f)
  for (const it of Array.from(dt.items ?? [])) {
    if (it.kind === "file") add(it.getAsFile())
  }
  return out
}

type UploadPayload = { url: string; previewUrl?: string; imageAlt?: string }

/**
 * Upload response normalizasyonu — hem triage'ın `{ok:true, url, ...}` şekli
 * hem repo idiomu `jsonSuccess` (`{data:{url, ...}}`) / `jsonError`
 * (`{error}`) kabul edilir; endpoint hangisini dönerse dönsün çalışır.
 */
function parseUploadResponse(json: unknown): {
  payload: UploadPayload | null
  error: string | null
} {
  if (!json || typeof json !== "object") return { payload: null, error: null }
  const obj = json as Record<string, unknown>
  if (obj.ok === true && typeof obj.url === "string") {
    return { payload: obj as unknown as UploadPayload, error: null }
  }
  if (obj.data && typeof obj.data === "object") {
    const data = obj.data as Record<string, unknown>
    if (typeof data.url === "string") {
      return { payload: data as unknown as UploadPayload, error: null }
    }
  }
  const error =
    typeof obj.error === "string"
      ? obj.error
      : null
  return { payload: null, error }
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
  function RichTextEditor(
    {
      value,
      onChange,
      onSubmit,
      onEmptyBackspace,
      onBlur,
      placeholder,
      autoFocus,
      minHeight = 96,
      maxHeight = 480,
      className,
      contentClassName,
      ariaLabel,
      initialContent,
    },
    ref,
  ) {
    const t = useTranslations("linearLite.editor")
    const { resolveAction } = useDashPaths()

    // SSR guard — TipTap's view layer needs window. We render a non-editable
    // textarea fallback during SSR then upgrade once mounted.
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    // Late-binding editor reference for handlers defined inside useEditor's
    // own config (the `editor` const isn't visible from there).
    const editorInstanceRef = useRef<Editor | null>(null)

    // Pending upload counter — shown as a small "Yükleniyor" pill so the
    // user has feedback while paste/drop/bubble-menu images are uploading.
    const [pendingUploads, setPendingUploads] = useState(0)
    // Dosya editör kutusunun üzerine sürükleniyor mu (drop ipucu için).
    const [dragActive, setDragActive] = useState(false)

    const uploadInlineImage = async (
      file: File,
    ): Promise<{ src: string; alt?: string } | null> => {
      try {
        const form = new FormData()
        form.set("file", file)
        const res = await fetch(resolveAction("/api/upload"), {
          method: "POST",
          body: form,
          credentials: "same-origin",
        })
        const json = (await res.json().catch(() => null)) as unknown
        const { payload, error } = parseUploadResponse(json)
        if (!payload) {
          toast.error(error || t("uploadFailed"))
          return null
        }
        // src: optimize (sıkıştırılmış) variant — önizleme performansı için
        //      (Sentroy görseller için ~960px CDN variant'ı, yoksa orijinal).
        // alt: token — Linear re-host'unda korunur; render'da Sentroy URL'ine
        //      geri çevirmemizi sağlar (image-assets).
        return { src: payload.previewUrl ?? payload.url, alt: payload.imageAlt }
      } catch (err) {
        toast.error((err as Error).message || t("uploadFailed"))
        return null
      }
    }

    const insertImageWithLoader = (file: File) => {
      setPendingUploads((n) => n + 1)
      void uploadInlineImage(file)
        .then((result) => {
          const ed = editorInstanceRef.current
          if (result && ed)
            ed
              .chain()
              .focus()
              .setImage({ src: result.src, alt: result.alt })
              .run()
        })
        .finally(() => {
          setPendingUploads((n) => Math.max(0, n - 1))
        })
    }

    const editor = useEditor(
      {
        editable: true,
        extensions: [
          StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            codeBlock: { HTMLAttributes: { class: "rt-codeblock" } },
            // v3'te Link extension StarterKit içinde dahil; ayrı bir
            // @tiptap/extension-link import etmek "Duplicate extension
            // names" uyarısı + schema kararsızlığına yol açıyordu.
            link: {
              openOnClick: false,
              autolink: true,
              HTMLAttributes: { rel: "noopener noreferrer" },
            },
          }),
          Image.configure({
            inline: false,
            allowBase64: false,
            HTMLAttributes: { class: "rt-image" },
          }),
          Markdown.configure({
            html: false,
            tightLists: true,
            bulletListMarker: "-",
            linkify: true,
            breaks: true,
          }),
        ],
        // tiptap-markdown extension yalnız runtime setContent çağrılarını
        // parse eder; config-time content'e müdahale etmez. Mount'u boş
        // başlat, onCreate'te initialContent (varsa) veya value'yu setContent
        // ile yedir — böylece markdown doğru parse edilir.
        content: "",
        onCreate: ({ editor: e }) => {
          const initial = initialContent ?? value ?? ""
          if (
            (typeof initial === "string" && initial.length > 0) ||
            (typeof initial === "object" && initial !== null)
          ) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            e.commands.setContent(initial as any, { emitUpdate: true })
          }
        },
        autofocus: autoFocus,
        immediatelyRender: false,
        editorProps: {
          attributes: {
            class: cn(
              "rt-content prose prose-sm max-w-none focus:outline-none dark:prose-invert",
              contentClassName,
            ),
            "aria-label": ariaLabel ?? t("ariaLabel"),
          },
          handlePaste: (_view, event) => {
            const files = imageFilesFromTransfer(event.clipboardData)
            if (files.length === 0) return false
            // Görsel blob'u yakaladık → harici URL'li <img>'in gömülmesini
            // engelle, bunun yerine Sentroy'a yükle.
            event.preventDefault()
            for (const file of files) insertImageWithLoader(file)
            return true
          },
          handleDrop: (_view, event, _slice, moved) => {
            if (moved) return false
            const files = imageFilesFromTransfer(
              (event as DragEvent).dataTransfer,
            )
            if (files.length === 0) return false
            event.preventDefault()
            for (const file of files) insertImageWithLoader(file)
            return true
          },
          handleKeyDown: (_view, event) => {
            if (
              onSubmit &&
              (event.metaKey || event.ctrlKey) &&
              event.key === "Enter"
            ) {
              event.preventDefault()
              onSubmit()
              return true
            }
            if (
              onEmptyBackspace &&
              event.key === "Backspace" &&
              !event.shiftKey &&
              !event.metaKey &&
              !event.ctrlKey
            ) {
              // Detect truly empty doc (only an empty paragraph)
              const doc = _view.state.doc
              if (doc.childCount <= 1 && doc.textContent.length === 0) {
                event.preventDefault()
                onEmptyBackspace()
                return true
              }
            }
            return false
          },
        },
        onUpdate: ({ editor }) => {
          const md = getMd(editor) as string
          onChange(md)
        },
      },
      [],
    )

    // Wire late-binding ref so paste/drop handlers can call into the editor.
    useEffect(() => {
      editorInstanceRef.current = editor ?? null
      return () => {
        editorInstanceRef.current = null
      }
    }, [editor])

    // Sync external value → editor without infinite loop
    useEffect(() => {
      if (!editor) return
      const current = getMd(editor) as string
      if (current === value) return
      editor.commands.setContent(value || "", { emitUpdate: false })
    }, [value, editor])

    useImperativeHandle(
      ref,
      (): RichTextEditorHandle => ({
        applyContent: (content, mode) => {
          if (!editor) return
          // ProseMirror JSON (object) → always replace via setContent doc.
          // Markdown extension intercepts string setContent; JSON setContent
          // goes through the default ProseMirror path.
          if (typeof content !== "string" || mode === "replace") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            editor.commands.setContent(content as any, { emitUpdate: true })
          } else {
            const cur = getMd(editor) as string
            const next = (cur.trimEnd() + "\n\n" + content).trim()
            editor.commands.setContent(next, { emitUpdate: true })
          }
          editor.commands.focus("end")
        },
        focus: () => editor?.commands.focus("end"),
      }),
      [editor],
    )

    const isEmpty = !value && (!editor || editor.isEmpty)

    if (!mounted) {
      return (
        <div
          className={cn("relative w-full", className)}
          style={{ minHeight }}
        />
      )
    }

    return (
      <div
        className={cn(
          "group/editor relative w-full",
          dragActive &&
            "rounded-lg ring-2 ring-primary/40 ring-offset-1 ring-offset-background",
          className,
        )}
        style={{
          minHeight,
          maxHeight,
          overflowY: "auto",
        }}
        // DOM-seviyesi drop: ProseMirror handleDrop yalnız editable içeriğin
        // üzerinde tetikleniyor; kutunun boş alanına ya da dragover hiç
        // engellenmediğinde drop kaçıyordu. Burada tüm kutuyu droppable yapıyoruz.
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return
          e.preventDefault()
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
          if (!dragActive) setDragActive(true)
        }}
        onDragLeave={(e) => {
          // Yalnız kutudan tamamen çıkınca kapat (içerikler arası geçişte değil).
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setDragActive(false)
        }}
        onDrop={(e) => {
          setDragActive(false)
          // ProseMirror handleDrop zaten aldıysa (içerik üzerine bırakma)
          // native event'te preventDefault çağrılmıştır → çift eklemeyi önle.
          if (e.nativeEvent.defaultPrevented) return
          const files = imageFilesFromTransfer(e.dataTransfer)
          if (files.length === 0) return
          e.preventDefault()
          for (const file of files) insertImageWithLoader(file)
        }}
      >
        {editor && isEmpty && placeholder ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 text-sm text-muted-foreground/60"
          >
            {placeholder}
          </span>
        ) : null}
        <AnimatePresence>
          {pendingUploads > 0 ? (
            <motion.div
              key="upload-pill"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute -top-1 right-0 z-10 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur"
              aria-live="polite"
            >
              <span
                aria-hidden
                className="size-2.5 animate-spin rounded-full border border-border border-t-foreground/70"
              />
              {t("uploading", { count: pendingUploads })}
            </motion.div>
          ) : null}
        </AnimatePresence>
        {editor ? (
          <>
            <BubbleMenu
              editor={editor}
              options={{
                placement: "top",
                offset: 6,
              }}
            >
              <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10">
                <ToolbarBtn
                  icon={TextBoldFreeIcons as IconSvgElement}
                  active={editor.isActive("bold")}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  label={t("bold")}
                  shortcut="⌘B"
                />
                <ToolbarBtn
                  icon={TextItalicFreeIcons as IconSvgElement}
                  active={editor.isActive("italic")}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  label={t("italic")}
                  shortcut="⌘I"
                />
                <ToolbarBtn
                  icon={TextStrikethroughFreeIcons as IconSvgElement}
                  active={editor.isActive("strike")}
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  label={t("strikethrough")}
                />
                <ToolbarBtn
                  icon={CodeFreeIcons as IconSvgElement}
                  active={editor.isActive("code")}
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  label={t("inlineCode")}
                  shortcut="⌘E"
                />
                <ToolbarBtn
                  icon={CodeSquareFreeIcons as IconSvgElement}
                  active={editor.isActive("codeBlock")}
                  onClick={() =>
                    editor.chain().focus().toggleCodeBlock().run()
                  }
                  label={t("codeBlock")}
                  shortcut="⌘⌥C"
                />
                <span className="mx-0.5 h-4 w-px bg-border/60" aria-hidden />
                <ToolbarBtn
                  icon={LeftToRightListBulletFreeIcons as IconSvgElement}
                  active={editor.isActive("bulletList")}
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                  label={t("bulletList")}
                />
                <ToolbarBtn
                  icon={LeftToRightListNumberFreeIcons as IconSvgElement}
                  active={editor.isActive("orderedList")}
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                  label={t("orderedList")}
                />
                <span className="mx-0.5 h-4 w-px bg-border/60" aria-hidden />
                <ToolbarBtn
                  icon={Link01FreeIcons as IconSvgElement}
                  active={editor.isActive("link")}
                  onClick={() => {
                    const existing = editor.getAttributes("link").href as
                      | string
                      | undefined
                    const url = window.prompt(
                      t("linkPrompt"),
                      existing ?? "https://",
                    )
                    if (url === null) return
                    if (url === "") {
                      editor.chain().focus().unsetLink().run()
                      return
                    }
                    editor
                      .chain()
                      .focus()
                      .extendMarkRange("link")
                      .setLink({ href: url })
                      .run()
                  }}
                  label={t("link")}
                />
                <ToolbarBtn
                  icon={Image02FreeIcons as IconSvgElement}
                  active={false}
                  onClick={() => {
                    const input = document.createElement("input")
                    input.type = "file"
                    input.accept = "image/*"
                    input.onchange = () => {
                      const file = input.files?.[0]
                      if (!file) return
                      insertImageWithLoader(file)
                    }
                    input.click()
                  }}
                  label={t("image")}
                />
              </div>
            </BubbleMenu>
            <EditorContent editor={editor} />
          </>
        ) : null}
      </div>
    )
  },
)

function ToolbarBtn({
  icon,
  active,
  onClick,
  label,
  shortcut,
}: {
  icon: IconSvgElement
  active: boolean
  onClick: () => void
  label: string
  shortcut?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} strokeWidth={2} />
    </button>
  )
}

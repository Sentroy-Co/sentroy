"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Search01Icon,
  Delete02Icon,
  PinIcon,
  StickyNote01Icon,
  Folder01Icon,
  FolderAddIcon,
  PaintBoardIcon,
  FolderTransferIcon,
  Edit02Icon,
} from "@hugeicons/core-free-icons"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@workspace/ui/components/context-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { NoteEditor } from "@workspace/console/components/notes/note-editor"
import type { NoteColor, NoteVisibility } from "@workspace/db/types"
import { useNoteStore, type NoteData } from "./note-store"
import { NOTE_COLOR_DOT, NOTE_COLOR_SWATCHES, NOTE_VISIBILITY_ORDER } from "./note-theme"

/**
 * Sentroy OS — Notlar uygulaması (Apple Notes tarzı 3-pane): klasör sidebar |
 * not listesi (context menü) | editör (tarih başlığı + toolbar + adanmış
 * NoteEditor). Debounced autosave (store PATCH). Paylaşılan store → widget'lar
 * canlı senkron.
 */
export function NotesApp({ lang, slug }: { lang: string; slug: string }) {
  const t = useTranslations("os")
  const notes = useNoteStore((s) => s.notes)
  const folders = useNoteStore((s) => s.folders)
  const placements = useNoteStore((s) => s.placements)
  const selectedFolderId = useNoteStore((s) => s.selectedFolderId)
  const loaded = useNoteStore((s) => s.loaded)
  const loading = useNoteStore((s) => s.loading)
  const requestedOpenId = useNoteStore((s) => s.requestedOpenId)
  const load = useNoteStore((s) => s.load)
  const setFolder = useNoteStore((s) => s.setFolder)
  const createNote = useNoteStore((s) => s.createNote)
  const updateNote = useNoteStore((s) => s.updateNote)
  const deleteNote = useNoteStore((s) => s.deleteNote)
  const moveNote = useNoteStore((s) => s.moveNote)
  const createFolder = useNoteStore((s) => s.createFolder)
  const renameFolder = useNoteStore((s) => s.renameFolder)
  const deleteFolder = useNoteStore((s) => s.deleteFolder)
  const pin = useNoteStore((s) => s.pin)
  const unpin = useNoteStore((s) => s.unpin)
  const consumeOpen = useNoteStore((s) => s.consumeOpen)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  // Klasör oluştur/yeniden adlandır dialog'u (window.prompt yerine).
  const [folderDialog, setFolderDialog] = useState<
    { mode: "create" | "rename"; id?: string; value: string } | null
  >(null)

  const mentionSearchUrl = `/api/companies/${slug}/mention-search`

  useEffect(() => {
    if (slug) void load(slug)
  }, [slug, load])

  // Seçili klasördeki notlar (null = hepsi) + arama.
  const visibleNotes = useMemo(() => {
    let list = notes
    if (selectedFolderId) list = list.filter((n) => n.folderId === selectedFolderId)
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (n) => n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q),
      )
    }
    return list
  }, [notes, selectedFolderId, query])

  // İlk yüklemede ilk görünen notu seç.
  useEffect(() => {
    if (loaded && selectedId === null && visibleNotes.length > 0) {
      setSelectedId(visibleNotes[0]!.id)
    }
  }, [loaded, visibleNotes, selectedId])

  useEffect(() => {
    if (requestedOpenId) {
      setSelectedId(requestedOpenId)
      consumeOpen()
    }
  }, [requestedOpenId, consumeOpen])

  const selected = useMemo(
    () => notes.find((n) => n.id === selectedId) ?? null,
    [notes, selectedId],
  )

  const handleNew = useCallback(async () => {
    const id = await createNote()
    if (id) {
      setSelectedId(id)
      setQuery("")
    }
  }, [createNote])

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteNote(id)
      setSelectedId((cur) => (cur === id ? null : cur))
    },
    [deleteNote],
  )

  const folderCount = useCallback(
    (fid: string) => notes.filter((n) => n.folderId === fid).length,
    [notes],
  )

  const submitFolderDialog = useCallback(async () => {
    if (!folderDialog) return
    const name = folderDialog.value.trim()
    if (!name) return
    if (folderDialog.mode === "create") {
      const id = await createFolder(name)
      if (id) setFolder(id)
    } else if (folderDialog.id) {
      await renameFolder(folderDialog.id, name)
    }
    setFolderDialog(null)
  }, [folderDialog, createFolder, renameFolder, setFolder])

  return (
    <div className="flex h-full min-h-0 bg-background">
      {/* Sol — klasör sidebar */}
      <div className="flex w-48 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("notes.folders")}
          </span>
          <button
            type="button"
            onClick={() => setFolderDialog({ mode: "create", value: "" })}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            aria-label={t("notes.newFolder")}
            title={t("notes.newFolder")}
          >
            <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <FolderRow
            icon={StickyNote01Icon}
            label={t("notes.allNotes")}
            count={notes.length}
            active={selectedFolderId === null}
            onClick={() => setFolder(null)}
          />
          {folders.map((f) => (
            <ContextMenu key={f.id}>
              <ContextMenuTrigger>
                <FolderRow
                  icon={Folder01Icon}
                  label={f.name}
                  count={folderCount(f.id)}
                  active={selectedFolderId === f.id}
                  onClick={() => setFolder(f.id)}
                />
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onClick={() => setFolderDialog({ mode: "rename", id: f.id, value: f.name })}
                >
                  <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} className="size-4" />
                  {t("notes.renameFolder")}
                </ContextMenuItem>
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(t("notes.deleteFolderConfirm"))) void deleteFolder(f.id)
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
                  {t("notes.deleteFolder")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </div>

      {/* Orta — not listesi */}
      <div className="flex w-64 shrink-0 flex-col border-r bg-muted/10">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="line-clamp-1 text-sm font-semibold">
            {selectedFolderId
              ? folders.find((f) => f.id === selectedFolderId)?.name ?? t("notes.allNotes")
              : t("notes.allNotes")}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={handleNew}
            aria-label={t("notes.newNote")}
            title={t("notes.newNote")}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          </Button>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("notes.search")}
              className="w-full rounded-lg border border-input bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {loading && notes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">…</p>
          ) : visibleNotes.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {t("notes.emptyList")}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {visibleNotes.map((n) => (
                <li key={n.id}>
                  <ContextMenu>
                    <ContextMenuTrigger>
                      <button
                        type="button"
                        onClick={() => setSelectedId(n.id)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          selectedId === n.id ? "bg-primary/10" : "hover:bg-foreground/5",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={cn("size-2 shrink-0 rounded-full", NOTE_COLOR_DOT[n.color])} />
                          <span className="line-clamp-1 flex-1 text-[13px] font-medium">
                            {n.title || t("notes.untitled")}
                          </span>
                          {placements[n.id] ? (
                            <HugeiconsIcon icon={PinIcon} strokeWidth={2} className="size-3 shrink-0 text-primary" />
                          ) : null}
                        </span>
                        <span className="line-clamp-1 pl-3.5 text-[11px] text-muted-foreground">
                          {snippet(n) || t("notes.untitled")}
                        </span>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-52">
                      <ContextMenuItem onClick={() => (placements[n.id] ? void unpin(n.id) : void pin(n.id))}>
                        <HugeiconsIcon icon={PinIcon} strokeWidth={2} className="size-4" />
                        {placements[n.id] ? t("notes.unpin") : t("notes.pin")}
                      </ContextMenuItem>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <HugeiconsIcon icon={PaintBoardIcon} strokeWidth={2} className="size-4" />
                          {t("notes.colorLabel")}
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent>
                          <div className="flex items-center gap-1.5 p-1.5">
                            {NOTE_COLOR_SWATCHES.map(({ key, dot }) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => updateNote(n.id, { color: key })}
                                aria-label={key}
                                className={cn(
                                  "size-5 rounded-full ring-offset-2 ring-offset-popover transition",
                                  dot,
                                  n.color === key ? "ring-2 ring-foreground/50" : "opacity-70 hover:opacity-100",
                                )}
                              />
                            ))}
                          </div>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={2} className="size-4" />
                          {t("notes.moveToFolder")}
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="max-h-64 overflow-y-auto">
                          <ContextMenuItem
                            onClick={() => void moveNote(n.id, null)}
                            className={cn(n.folderId === null && "bg-accent")}
                          >
                            {t("notes.noFolder")}
                          </ContextMenuItem>
                          {folders.length > 0 ? <ContextMenuSeparator /> : null}
                          {folders.map((f) => (
                            <ContextMenuItem
                              key={f.id}
                              onClick={() => void moveNote(n.id, f.id)}
                              className={cn(n.folderId === f.id && "bg-accent")}
                            >
                              <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} className="size-4" />
                              {f.name}
                            </ContextMenuItem>
                          ))}
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      <ContextMenuSeparator />
                      <ContextMenuItem variant="destructive" onClick={() => void handleDelete(n.id)}>
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
                        {t("notes.delete")}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Sağ — editör */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected ? (
          <NoteEditorPane
            key={selected.id}
            note={selected}
            lang={lang}
            mentionSearchUrl={mentionSearchUrl}
            pinned={Boolean(placements[selected.id])}
            onChange={(v) =>
              updateNote(selected.id, { text: v.text, bodyHtml: v.html, mentions: v.mentions })
            }
            onVisibility={(visibility) => updateNote(selected.id, { visibility })}
            onColor={(color) => updateNote(selected.id, { color })}
            onTogglePin={() =>
              placements[selected.id] ? void unpin(selected.id) : void pin(selected.id)
            }
            onDelete={() => void handleDelete(selected.id)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <HugeiconsIcon icon={StickyNote01Icon} strokeWidth={1.5} className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t("notes.noSelection")}</p>
            <Button type="button" size="sm" onClick={handleNew} className="rounded-full">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" data-icon="inline-start" />
              {t("notes.newNote")}
            </Button>
          </div>
        )}
      </div>

      {/* Klasör oluştur / yeniden adlandır dialog'u (window.prompt yerine) */}
      <Dialog
        open={folderDialog !== null}
        onOpenChange={(o) => {
          if (!o) setFolderDialog(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {folderDialog?.mode === "rename" ? t("notes.renameFolder") : t("notes.newFolder")}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={folderDialog?.value ?? ""}
            onChange={(e) =>
              setFolderDialog((d) => (d ? { ...d, value: e.target.value } : d))
            }
            placeholder={t("notes.folderNamePrompt")}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void submitFolderDialog()
              }
            }}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setFolderDialog(null)}>
              {t("notes.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void submitFolderDialog()}
              disabled={!folderDialog?.value.trim()}
            >
              {folderDialog?.mode === "rename" ? t("notes.renameFolder") : t("notes.newFolder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FolderRow({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof Folder01Icon
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
        active ? "bg-primary/10 font-medium text-foreground" : "text-foreground/80 hover:bg-foreground/5",
      )}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
      <span className="line-clamp-1 flex-1">{label}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
    </button>
  )
}

function snippet(n: NoteData): string {
  const lines = n.text.split("\n").map((s) => s.trim()).filter(Boolean)
  return (lines[1] ?? "").slice(0, 80)
}

function NoteEditorPane({
  note,
  lang,
  mentionSearchUrl,
  pinned,
  onChange,
  onVisibility,
  onColor,
  onTogglePin,
  onDelete,
}: {
  note: NoteData
  lang: string
  mentionSearchUrl: string
  pinned: boolean
  onChange: (v: { html: string; text: string; mentions: string[] }) => void
  onVisibility: (v: NoteVisibility) => void
  onColor: (c: NoteColor) => void
  onTogglePin: () => void
  onDelete: () => void
}) {
  const t = useTranslations("os")
  const visibilityLabel: Record<NoteVisibility, string> = {
    author: t("notes.visibilityAuthor"),
    members: t("notes.visibilityMembers"),
    admins: t("notes.visibilityAdmins"),
    public: t("notes.visibilityPublic"),
  }
  const dateStr = useMemo(() => {
    const d = new Date(note.updatedAt)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleString(lang, { dateStyle: "long", timeStyle: "short" })
  }, [note.updatedAt, lang])

  return (
    <>
      {/* Üst araç çubuğu */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Select value={note.visibility} onValueChange={(v) => onVisibility(v as NoteVisibility)}>
          <SelectTrigger className="h-8 w-auto gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground">
            <span>{visibilityLabel[note.visibility]}</span>
          </SelectTrigger>
          <SelectContent>
            {NOTE_VISIBILITY_ORDER.map((v) => (
              <SelectItem key={v} value={v}>
                {visibilityLabel[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Renk — Popover (toolbar'da dımdızlak swatch yerine) */}
        <Popover>
          <PopoverTrigger
            className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/10"
            aria-label={t("notes.colorLabel")}
            title={t("notes.colorLabel")}
          >
            <span className={cn("size-3.5 rounded-full ring-1 ring-border", NOTE_COLOR_DOT[note.color])} />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex items-center gap-1.5">
              {NOTE_COLOR_SWATCHES.map(({ key, dot }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onColor(key)}
                  aria-label={key}
                  className={cn(
                    "size-6 rounded-full ring-offset-2 ring-offset-popover transition",
                    dot,
                    note.color === key ? "ring-2 ring-foreground/50" : "opacity-70 hover:opacity-100",
                  )}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={pinned ? "default" : "ghost"}
            onClick={onTogglePin}
            className="rounded-full"
            title={pinned ? t("notes.unpin") : t("notes.pin")}
          >
            <HugeiconsIcon icon={PinIcon} strokeWidth={2} className="size-3.5" data-icon="inline-start" />
            {pinned ? t("notes.unpin") : t("notes.pin")}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm(t("notes.deleteConfirm"))) onDelete()
            }}
            aria-label={t("notes.delete")}
            title={t("notes.delete")}
            className="text-muted-foreground hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
          </Button>
        </div>
      </div>

      {/* Tarih başlığı (Apple Notes tarzı, ortalı) */}
      {dateStr ? (
        <div className="shrink-0 pt-2 text-center text-[11px] text-muted-foreground">{dateStr}</div>
      ) : null}

      {/* Adanmış editör — tüm alanı doldurur */}
      <NoteEditor
        mentionSearchUrl={mentionSearchUrl}
        initialHtml={note.bodyHtml ?? ""}
        placeholder={t("notes.titlePlaceholder")}
        onChange={onChange}
      />
    </>
  )
}

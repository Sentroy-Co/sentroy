"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { useDashPaths, useFetcher, useNavigate } from "@/lib/router-compat"
import {
  RichTextEditor,
  type RichTextEditorHandle,
} from "@/components/editor/rich-text-editor"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  AlertCircleFreeIcons,
  ArrowUp02FreeIcons,
  Menu02FreeIcons,
  ArrowDown02FreeIcons,
  ArrowRight02FreeIcons,
  MinusSignFreeIcons,
  CircleFreeIcons,
  UserFreeIcons,
  Tag01FreeIcons,
  UserGroupFreeIcons,
  File01FreeIcons,
  Cancel01FreeIcons,
  Attachment01FreeIcons,
  LicenseDraftFreeIcons,
} from "@hugeicons/core-free-icons"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { MorphButton } from "@/components/motion/morph-button"
import { TaskFormChip, type ChipItem } from "./task-form-chip"
import {
  normalizeActionResult,
  type ActionResult,
} from "./action-result"
import { useTasksStore } from "@/stores/tasks-store"
import { useUiFlags } from "@/lib/ui-flags-context"
import { useConfirm } from "@/components/common/confirm-dialog"
import { proseMirrorJsonToMarkdown } from "@/lib/prose-mirror"
import { cn } from "@workspace/ui/lib/utils"
import type {
  IssueLabel,
  IssuePriority,
  IssueState,
  IssueTeam,
  IssueTemplate,
  IssueUser,
} from "@/lib/linear/types"
import { toast } from "sonner"

type Props = {
  teams: IssueTeam[]
  defaultTeamId: string
  defaultStateId: string | null
  /** Varsayılan durum adı — takım değişince başlangıç durumunu isimle çözmek için. */
  defaultStateName?: string | null
  /** Takım id → state'ler. Seçili takıma göre durum seçenekleri gösterilir. */
  statesByTeam: Record<string, IssueState[]>
  /** Takım id → etiketler. Seçili takıma göre etiket seçenekleri gösterilir. */
  labelsByTeam: Record<string, IssueLabel[]>
  /** Takım id → issue şablonları. Seçili takıma göre şablonlar sunulur. */
  templatesByTeam?: Record<string, IssueTemplate[]>
  users: IssueUser[]
  showStatus?: boolean
  showAssignee?: boolean
  showLabels?: boolean
  parentId?: string | null
  /**
   * "page" → content-sized card (default).
   * "dialog" → fills parent height, only the description scrolls;
   * şablon satırı + başlık + chip row + pending files + footer sabit.
   */
  layout?: "page" | "dialog"
  /**
   * Caller may close a wrapping dialog after success — passed
   * the new issue id. If absent we navigate to /tasks/{id} as before.
   */
  onCreated?: (issueId: string) => void
}

const PRIORITY_META: Record<
  IssuePriority,
  { labelKey: string; icon: IconSvgElement; swatch: string }
> = {
  0: {
    labelKey: "priority.no_priority",
    icon: MinusSignFreeIcons as IconSvgElement,
    swatch: "#a3a3a3",
  },
  1: {
    labelKey: "priority.urgent",
    icon: AlertCircleFreeIcons as IconSvgElement,
    swatch: "#ef4444",
  },
  2: {
    labelKey: "priority.high",
    icon: ArrowUp02FreeIcons as IconSvgElement,
    swatch: "#f97316",
  },
  3: {
    labelKey: "priority.medium",
    icon: Menu02FreeIcons as IconSvgElement,
    swatch: "#eab308",
  },
  4: {
    labelKey: "priority.low",
    icon: ArrowDown02FreeIcons as IconSvgElement,
    swatch: "#9ca3af",
  },
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Bir takımın "başlangıç" state'i: önce unstarted, yoksa backlog, yoksa
 * ilk state. Takım değişince durum chip'ini o takımın mantıklı default'una
 * ayarlamak için. Eşleşme yoksa boş (Linear, teamId default'unu uygular).
 */
function startStateFor(
  states: IssueState[],
  preferredName?: string | null,
): string {
  if (preferredName) {
    const want = preferredName.trim().toLowerCase()
    const named = states.find((s) => s.name.trim().toLowerCase() === want)
    if (named) return named.id
  }
  return (
    states.find((s) => s.type === "unstarted") ??
    states.find((s) => s.type === "backlog") ??
    states[0]
  )?.id ?? ""
}

function userInitials(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email && email.split("@")[0]) || "?"
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
}

export function TaskForm({
  teams,
  defaultTeamId,
  defaultStateId,
  defaultStateName,
  statesByTeam,
  labelsByTeam,
  templatesByTeam = {},
  users,
  showStatus = true,
  showAssignee = true,
  showLabels = true,
  parentId = null,
  layout = "page",
  onCreated,
}: Props) {
  const t = useTranslations("linearLite.tasks")
  const fetcher = useFetcher<unknown>()
  const navigate = useNavigate()
  const { resolveAction } = useDashPaths()
  const { showTeamPicker } = useUiFlags()
  const confirm = useConfirm()
  const draft = useTasksStore((s) => s.draftForm)
  const setDraft = useTasksStore((s) => s.setDraft)
  const clearDraft = useTasksStore((s) => s.clearDraft)
  const submitting = fetcher.state !== "idle"

  // Seçili takım — picker görünürse kullanıcı değiştirebilir. State/label/
  // şablon setleri Linear'da takıma özel olduğundan tümü buna göre türetilir.
  const effectiveTeamId = draft.teamId || defaultTeamId
  const states = statesByTeam[effectiveTeamId] ?? []
  const labels = labelsByTeam[effectiveTeamId] ?? []
  const templates = templatesByTeam[effectiveTeamId] ?? []

  const titleRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<RichTextEditorHandle>(null)
  // Pending file attachments — uploaded only after issue is created
  // (Linear's attachmentCreate needs an issueId). Tutulurken kullanıcı
  // ekleyip çıkarabilir, submit anında issue oluşturulup ardından
  // issue action endpoint'i (intent=attach) ile sırayla bağlanır.
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Selected template id (UI-only — apply mantığı title/desc/priority
  // alanlarına bir defalık kopyalama yapar). Aktif satır kalır ki
  // kullanıcı hangi şablona göre yazıyorum görsün.
  const [templateId, setTemplateId] = useState<string | null>(null)
  // Editor remount sayacı + mount-time override içeriği. Template
  // seçildiğinde inline setContent'i markdown extension intercept ettiği
  // için ProseMirror JSON güvenli geçmiyor → editor'ü key ile remount
  // edip initialContent'i mount'ta verirsek doğru render edilir.
  const [editorMountId, setEditorMountId] = useState(0)
  const [editorInitial, setEditorInitial] = useState<string | object | null>(
    null,
  )
  const [editorRemounting, setEditorRemounting] = useState(false)

  useEffect(() => {
    const patch: Partial<typeof draft> = {}
    if (!draft.teamId && defaultTeamId) patch.teamId = defaultTeamId
    if (!draft.stateId && defaultStateId) patch.stateId = defaultStateId
    if (Object.keys(patch).length > 0) setDraft(patch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTeamId, defaultStateId])

  useEffect(() => {
    // Title autoFocus HTML attr'ı RichTextEditor'ün hydrate-sonrası
    // upgrade'i sırasında kaybolabiliyor. Bir frame bekleyip programatik
    // fokus + cursor sonu — TipTap mount edildiyse bile title kazanır.
    const id = requestAnimationFrame(() => {
      const t = titleRef.current
      if (!t) return
      if (document.activeElement === t) return
      t.focus()
      const len = t.value.length
      t.setSelectionRange(len, len)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (fetcher.state !== "idle") return
    const data = normalizeActionResult<ActionResult>(fetcher.data)
    if (!data) return
    if (data.ok) {
      const issueId = data.issueId
      const filesToUpload = pendingFiles
      const finalize = () => {
        toast.success(t("new.sent"))
        clearDraft()
        editorRef.current?.applyContent("", "replace")
        setPendingFiles([])
        setTemplateId(null)
        if (onCreated) onCreated(issueId)
        else navigate(`/tasks/${issueId}`)
      }

      if (filesToUpload.length === 0) {
        finalize()
        return
      }

      setUploadingAttachments(true)
      ;(async () => {
        for (const file of filesToUpload) {
          try {
            const form = new FormData()
            form.set("intent", "attach")
            form.set("file", file)
            // `/tasks/${id}` → shim `${apiBase}/issues/${id}/actions`
            const res = await fetch(resolveAction(`/tasks/${issueId}`), {
              method: "POST",
              body: form,
              credentials: "same-origin",
            })
            if (!res.ok) {
              toast.error(t("new.attachments.upload_failed", { name: file.name }))
            }
          } catch (err) {
            toast.error(
              (err as Error).message ||
                t("new.attachments.upload_failed", { name: file.name }),
            )
          }
        }
        setUploadingAttachments(false)
        finalize()
      })()
    } else if (data.error) {
      toast.error(data.error)
    }
    // pendingFiles intentionally excluded: success snapshot is taken
    // once per fetcher.data tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data, t, clearDraft, navigate, onCreated])

  const applyTemplate = async (id: string | null) => {
    // Önceki seçim varsa, kullanıcının doldurduğu içerik değil önceki
    // şablonun set ettiği içerik vardır → yeni şablon her durumda
    // override etsin. İlk seçimde ise yalnızca boş alanları doldur.
    const prevTemplateId = templateId
    const overrideExisting = prevTemplateId !== null
    // Şablonu değiştirmek bütün formu yenisine göre tazeleyeceği için
    // (başlık, açıklama, etiketler vs.) kullanıcıdan açık onay isteyelim;
    // vazgeçerse seçim değişmez.
    if (overrideExisting && id !== null && id !== prevTemplateId) {
      const ok = await confirm({
        title: t("new.template.confirm_title"),
        description: t("new.template.confirm_description"),
        confirmLabel: t("new.template.confirm_confirm"),
        cancelLabel: t("new.template.confirm_cancel"),
      })
      if (!ok) return
    }
    setTemplateId(id)
    if (!id) return
    const tpl = templates.find((tp) => tp.id === id)
    if (!tpl) return
    const data = tpl.data ?? {}

    const patch: Partial<typeof draft> = {}
    if (data.title && (overrideExisting || !draft.title.trim())) {
      patch.title = data.title
    }
    if (typeof data.priority === "number") {
      patch.priority = Math.min(4, Math.max(0, data.priority)) as IssuePriority
    }
    if (showLabels) {
      const valid = (data.labelIds ?? []).filter((lid) =>
        labels.some((l) => l.id === lid),
      )
      if (overrideExisting) {
        // Şablondan şablona geçişte sadece şablon label'larını kullan
        // (öncekinin ekledikleri kaybolsun).
        patch.labelIds = valid
      } else if (valid.length) {
        // İlk şablon — kullanıcının elle eklediklerine ek olarak.
        patch.labelIds = Array.from(
          new Set([...draft.labelIds, ...valid]),
        )
      }
    }
    if (showStatus) {
      if (
        data.stateId &&
        states.some((s) => s.id === data.stateId) &&
        (overrideExisting || !draft.stateId)
      ) {
        patch.stateId = data.stateId
      }
    }
    if (showAssignee) {
      if (data.assigneeId && users.some((u) => u.id === data.assigneeId)) {
        if (overrideExisting || !draft.assigneeId) {
          patch.assigneeId = data.assigneeId
        }
      } else if (overrideExisting) {
        // Yeni şablonda assignee yoksa öncekini temizle.
        patch.assigneeId = ""
      }
    }
    if (Object.keys(patch).length > 0) setDraft(patch)

    // Description: önce markdown string, yoksa ProseMirror JSON doc.
    // Override koşulu: ya draft boş ya da önceden bir şablon vardı.
    const shouldReplaceDescription =
      overrideExisting || !draft.description.trim()
    if (shouldReplaceDescription) {
      let markdown: string | null = null
      if (typeof data.description === "string" && data.description.trim()) {
        markdown = data.description
      } else if (
        data.descriptionData &&
        typeof data.descriptionData === "object"
      ) {
        markdown = proseMirrorJsonToMarkdown(data.descriptionData)
      }

      // Her şablon değişiminde editor remount — sadece içerik değiştiğinde
      // değil, boş şablon olsa da öncekini temizleyebilmek için.
      setEditorRemounting(true)
      setEditorInitial(markdown ?? "")
      // Draft'ı şimdiden boşalt ki value sync useEffect editor'ün boş
      // hali ile değer çakışmasını yapmasın; markdown sonra editor'ün
      // onUpdate'inden yine setDraft ile yazılacak.
      if (markdown !== draft.description) setDraft({ description: "" })
      window.setTimeout(() => {
        setEditorMountId((n) => n + 1)
        setEditorRemounting(false)
      }, 500)
    }

    toast.success(t("new.template.applied", { name: tpl.name }))
  }

  const onPickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return
    const next: File[] = []
    for (let i = 0; i < list.length; i++) {
      const f = list.item(i)
      if (f) next.push(f)
    }
    setPendingFiles((prev) => [...prev, ...next])
  }

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const focusTitleAtEnd = () => {
    const el = titleRef.current
    if (!el) return
    el.focus()
    const len = el.value.length
    requestAnimationFrame(() => el.setSelectionRange(len, len))
  }

  const priorityItems: ChipItem[] = ([0, 1, 2, 3, 4] as IssuePriority[]).map(
    (p) => {
      const meta = PRIORITY_META[p]
      return {
        id: String(p),
        label: t(meta.labelKey),
        swatch: meta.swatch,
        icon: <HugeiconsIcon icon={meta.icon} size={12} strokeWidth={2} />,
      }
    },
  )

  const stateItems: ChipItem[] = states.map((s) => ({
    id: s.id,
    label: s.name,
    swatch: s.color,
    description: stateTypeLabel(s.type, t),
  }))

  const userItems: ChipItem[] = users.map((u) => ({
    id: u.id,
    label: u.name || u.email,
    description: u.email,
    icon: (
      <Avatar className="size-4">
        {u.avatarUrl ? <AvatarImage src={u.avatarUrl} alt={u.name} /> : null}
        <AvatarFallback className="text-[8px]">
          {userInitials(u.name, u.email)}
        </AvatarFallback>
      </Avatar>
    ),
  }))

  const labelItems: ChipItem[] = labels.map((l) => ({
    id: l.id,
    label: l.name,
    swatch: l.color,
    parentId: l.parentId ?? null,
    isGroup: l.isGroup ?? false,
  }))

  const teamItems: ChipItem[] = teams.map((tm) => ({
    id: tm.id,
    label: tm.name,
    description: tm.key,
  }))

  const isDialog = layout === "dialog"

  return (
    <fetcher.Form
      method="post"
      action="/tasks/new"
      className={cn(isDialog && "flex h-full min-h-0 flex-col")}
    >
      {/* hidden fields → form submission */}
      <input type="hidden" name="title" value={draft.title} />
      <input type="hidden" name="description" value={draft.description} />
      <input type="hidden" name="priority" value={String(draft.priority)} />
      <input type="hidden" name="teamId" value={effectiveTeamId} />
      <input type="hidden" name="stateId" value={draft.stateId} />
      <input type="hidden" name="assigneeId" value={draft.assigneeId} />
      {parentId ? (
        <input type="hidden" name="parentId" value={parentId} />
      ) : null}
      {draft.labelIds.map((id) => (
        <input key={id} type="hidden" name="labelIds" value={id} />
      ))}

      <div
        className={cn(
          "overflow-hidden bg-card",
          isDialog
            ? "flex h-full min-h-0 flex-1 flex-col"
            : "rounded-2xl border border-border/60 shadow-sm",
        )}
      >
        {templates.length > 0 ? (
          <div className="flex items-center gap-2 border-b border-border/40 bg-muted/10 px-5 py-2">
            <HugeiconsIcon
              icon={LicenseDraftFreeIcons as IconSvgElement}
              size={12}
              strokeWidth={2}
              className="text-muted-foreground"
            />
            <span className="text-[11px] text-muted-foreground">
              {t("new.template.label")}
            </span>
            <TaskFormChip
              triggerIcon={
                <HugeiconsIcon
                  icon={LicenseDraftFreeIcons as IconSvgElement}
                  size={12}
                  strokeWidth={2}
                />
              }
              placeholder={t("new.template.placeholder")}
              items={templates.map((tp) => ({
                id: tp.id,
                label: tp.name,
                description: tp.description ?? undefined,
              }))}
              valueId={templateId}
              onChange={applyTemplate}
              allowClear
              clearLabel={t("new.template.clear")}
            />
          </div>
        ) : null}

        {/* Title */}
        <input
          ref={titleRef}
          type="text"
          required
          minLength={3}
          value={draft.title}
          onChange={(e) => setDraft({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              editorRef.current?.focus()
            }
          }}
          placeholder={t("new.fields.title_placeholder")}
          aria-label={t("new.fields.title")}
          className="block w-full border-0 bg-transparent px-5 pt-5 pb-3 text-[18px] leading-snug font-medium tracking-tight text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        />

        <div className="mx-5 border-t border-border/40" />

        {/* Description */}
        <div
          className={cn(
            "px-5 pt-3 pb-5",
            isDialog && "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {editorRemounting ? (
            <div
              className="flex items-center justify-center gap-2 rounded-md border border-border/40 bg-muted/30 text-xs text-muted-foreground"
              style={{ minHeight: 96 }}
              aria-live="polite"
            >
              <span
                aria-hidden
                className="size-3 animate-spin rounded-full border border-border border-t-foreground/70"
              />
              {t("new.template.applying")}
            </div>
          ) : (
            <RichTextEditor
              key={editorMountId}
              ref={editorRef}
              value={draft.description}
              initialContent={editorInitial ?? undefined}
              onChange={(md) => setDraft({ description: md })}
              onEmptyBackspace={focusTitleAtEnd}
              placeholder={t("new.fields.description_placeholder")}
              ariaLabel={t("new.fields.description")}
              minHeight={96}
              maxHeight={isDialog ? 9999 : 480}
              contentClassName="text-sm"
            />
          )}
        </div>

        <div className="border-t border-border/40 bg-muted/20" />

        {/* Chip row */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
          {showStatus ? (
            <TaskFormChip
              triggerIcon={
                <HugeiconsIcon
                  icon={CircleFreeIcons as IconSvgElement}
                  size={12}
                  strokeWidth={2}
                />
              }
              placeholder={t("new.fields.state")}
              items={stateItems}
              valueId={draft.stateId || null}
              onChange={(id) => setDraft({ stateId: id ?? "" })}
            />
          ) : null}
          <TaskFormChip
            triggerIcon={
              <HugeiconsIcon
                icon={MinusSignFreeIcons as IconSvgElement}
                size={12}
                strokeWidth={2}
              />
            }
            placeholder={t("new.fields.priority")}
            items={priorityItems}
            valueId={String(draft.priority)}
            onChange={(id) =>
              setDraft({ priority: (Number(id) ?? 0) as IssuePriority })
            }
          />
          {showAssignee ? (
            <TaskFormChip
              triggerIcon={
                <HugeiconsIcon
                  icon={UserFreeIcons as IconSvgElement}
                  size={12}
                  strokeWidth={2}
                />
              }
              placeholder={t("new.fields.assignee")}
              items={userItems}
              valueId={draft.assigneeId || null}
              onChange={(id) => setDraft({ assigneeId: id ?? "" })}
              allowClear
              clearLabel={t("new.fields.assignee_clear")}
            />
          ) : null}
          {showLabels ? (
            <TaskFormChip
              triggerIcon={
                <HugeiconsIcon
                  icon={Tag01FreeIcons as IconSvgElement}
                  size={12}
                  strokeWidth={2}
                />
              }
              placeholder={t("new.fields.labels")}
              items={labelItems}
              multi
              valueIds={draft.labelIds}
              onChange={(ids) => setDraft({ labelIds: ids })}
              emptyText={t("new.fields.labels_empty")}
            />
          ) : null}
          {showTeamPicker && teams.length > 1 ? (
            <TaskFormChip
              triggerIcon={
                <HugeiconsIcon
                  icon={UserGroupFreeIcons as IconSvgElement}
                  size={12}
                  strokeWidth={2}
                />
              }
              placeholder={t("new.fields.team")}
              items={teamItems}
              valueId={effectiveTeamId}
              onChange={(id) => {
                const tid = id ?? ""
                // Takım değişince durum/etiket o takıma özel olduğundan
                // sıfırla; durumu yeni takımın başlangıç state'ine ayarla.
                setDraft({
                  teamId: tid,
                  stateId: tid
                    ? startStateFor(statesByTeam[tid] ?? [], defaultStateName)
                    : "",
                  labelIds: [],
                })
              }}
            />
          ) : null}
        </div>

        {pendingFiles.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-border/40 bg-muted/10 px-4 py-2.5">
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/80 uppercase">
              {t("new.attachments.title", { count: pendingFiles.length })}
            </p>
            <ul className="flex flex-col gap-1">
              {pendingFiles.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-2 rounded-md border border-border/40 bg-card px-2 py-1.5 text-xs"
                >
                  <HugeiconsIcon
                    icon={File01FreeIcons as IconSvgElement}
                    size={12}
                    strokeWidth={2}
                    className="text-muted-foreground"
                  />
                  <span className="truncate font-medium">{file.name}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePendingFile(i)}
                    aria-label={t("new.attachments.remove", {
                      name: file.name,
                    })}
                    className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={Cancel01FreeIcons as IconSvgElement}
                      size={11}
                      strokeWidth={2}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="border-t border-border/40" />

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                onPickFiles(e.target.files)
                e.target.value = ""
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              <HugeiconsIcon
                icon={Attachment01FreeIcons as IconSvgElement}
                size={12}
                strokeWidth={2}
              />
              {t("new.attachments.add")}
            </button>
          </div>
          <MorphButton
            submitting={submitting || uploadingAttachments}
            type="submit"
            layoutId="task-form-cta"
            size="sm"
            hoverIcon={
              <HugeiconsIcon
                icon={ArrowRight02FreeIcons as IconSvgElement}
                size={12}
                strokeWidth={2}
              />
            }
          >
            {uploadingAttachments
              ? t("new.attachments.uploading")
              : t("new.submit")}
          </MorphButton>
        </div>
      </div>
    </fetcher.Form>
  )
}

function stateTypeLabel(
  type: IssueState["type"],
  t: (key: string) => string,
): string | undefined {
  const map: Record<IssueState["type"], string> = {
    triage: "status.backlog",
    backlog: "status.backlog",
    unstarted: "status.todo",
    started: "status.in_progress",
    completed: "status.done",
    canceled: "status.cancelled",
  }
  const key = map[type]
  return key ? t(key) : undefined
}

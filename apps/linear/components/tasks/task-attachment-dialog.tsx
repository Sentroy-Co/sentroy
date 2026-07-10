"use client"

// Triage app/components/tasks/task-attachment-dialog.tsx portu (PLAN §6).
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  Attachment02FreeIcons,
  CloudUploadFreeIcons,
  Link01FreeIcons,
  Cancel01FreeIcons,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { useFetcher } from "@/lib/router-compat"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { MorphButton } from "@/components/motion/morph-button"
import { cn } from "@workspace/ui/lib/utils"
import { normalizeActionResult, type FetcherResult } from "./action-result"

type Props = {
  issueId: string
}

type Mode = "file" | "link"

const MAX_FILE_BYTES = 25 * 1024 * 1024

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function TaskAttachmentDialog({ issueId }: Props) {
  const fetcher = useFetcher<FetcherResult>()
  const t = useTranslations("linearLite")
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("file")
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const submitting = fetcher.state !== "idle"

  useEffect(() => {
    const data = normalizeActionResult<FetcherResult>(fetcher.data)
    if (!data) return
    if (data.ok) {
      toast.success(t("tasks.detail.attached"))
      setOpen(false)
      setFile(null)
      setUrl("")
      setTitle("")
    } else if (data.error) {
      toast.error(data.error)
    }
  }, [fetcher.data, t])

  const pickFile = (f: File | null) => {
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      toast.error(
        t("tasks.detail.attach.tooLarge", { size: formatBytes(f.size) }),
      )
      return
    }
    setFile(f)
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return
    const form = new FormData()
    form.set("intent", "attach")
    form.set("issueId", issueId)
    if (title) form.set("title", title)
    if (mode === "file") {
      if (!file) {
        toast.error(t("tasks.detail.attach.pickFirst"))
        return
      }
      form.set("file", file)
    } else {
      const trimmed = url.trim()
      if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
        toast.error(t("tasks.detail.attach.invalidUrl"))
        return
      }
      form.set("url", trimmed)
    }
    // FormData içinde File olduğu için fetch body'si otomatik multipart olur.
    void fetcher.submit(form, {
      method: "post",
      action: `/tasks/${issueId}`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon
          icon={Attachment02FreeIcons as IconSvgElement}
          size={14}
          strokeWidth={2}
        />
        {t("tasks.detail.attach.button")}
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tasks.detail.attach.title")}</DialogTitle>
          <DialogDescription>
            {t("tasks.detail.attach.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/60 p-0.5">
          <TabBtn
            active={mode === "file"}
            onClick={() => setMode("file")}
            icon={CloudUploadFreeIcons as IconSvgElement}
            label={t("tasks.detail.attach.tabFile")}
          />
          <TabBtn
            active={mode === "link"}
            onClick={() => setMode("link")}
            icon={Link01FreeIcons as IconSvgElement}
            label={t("tasks.detail.attach.tabLink")}
          />
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "file" ? (
            <div className="flex flex-col gap-2">
              {file ? (
                <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5">
                  <HugeiconsIcon
                    icon={Attachment02FreeIcons as IconSvgElement}
                    size={14}
                    strokeWidth={2}
                    className="text-muted-foreground"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0">
                    <span className="truncate text-sm font-medium text-foreground">
                      {file.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatBytes(file.size)}
                      {file.type ? ` · ${file.type}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ""
                    }}
                    aria-label={t("tasks.detail.attach.remove")}
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={Cancel01FreeIcons as IconSvgElement}
                      size={12}
                      strokeWidth={2}
                    />
                  </button>
                </div>
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    pickFile(e.dataTransfer.files[0] ?? null)
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                    dragOver
                      ? "border-foreground/40 bg-accent/40"
                      : "border-border/60 bg-background/40 hover:border-border hover:bg-accent/30",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                  <HugeiconsIcon
                    icon={CloudUploadFreeIcons as IconSvgElement}
                    size={20}
                    strokeWidth={2}
                    className="text-muted-foreground"
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">
                      {t("tasks.detail.attach.dropTitle")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("tasks.detail.attach.maxSize")}
                    </span>
                  </div>
                </label>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="att-url">URL</Label>
              <Input
                id="att-url"
                type="url"
                required={mode === "link"}
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="att-title">
              {t("tasks.detail.attach.label")}
            </Label>
            <Input
              id="att-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("tasks.detail.attach.labelPlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <MorphButton submitting={submitting} type="submit" size="sm">
              {t("tasks.detail.attach.submit")}
            </MorphButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: IconSvgElement
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} size={12} strokeWidth={2} />
      {label}
    </button>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail01Icon,
  Link01Icon,
  Download01Icon,
  Tick02Icon,
  Search01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

interface Person {
  userId: string
  name: string | null
  email: string | null
  image: string | null
}

/**
 * Instagram-tarzı paylaşım sheet'i: üstte şirket-içi kişi paylaşımı (erişim
 * otomatik verilir + "X seninle paylaştı" bildirimi), ortada link, altta
 * WhatsApp/Telegram/Mail/İndir. Link + dış-app yalnız public dosyada.
 */
export function ShareDialog({
  open,
  onOpenChange,
  mediaId,
  fileName,
  companySlug,
  bucketSlug,
  isPublic,
  viewerUrl,
  downloadUrl,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaId: string
  fileName: string
  companySlug: string
  bucketSlug: string
  isPublic: boolean
  viewerUrl: string
  downloadUrl: string
}) {
  const t = useTranslations("buckets")
  const [people, setPeople] = useState<Person[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setQuery("")
    setCopied(false)
    fetch(`/api/companies/${companySlug}/people`)
      .then((r) => r.json())
      .then((j) => setPeople((j?.data?.people as Person[]) ?? []))
      .catch(() => {})
  }, [open, companySlug])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q),
    )
  }, [people, query])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function doInternalShare() {
    if (selected.size === 0 || sharing) return
    setSharing(true)
    try {
      const res = await fetch(
        `/api/companies/${companySlug}/buckets/${bucketSlug}/media/${mediaId}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: [...selected] }),
        },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || t("share.failed"))
      toast.success(
        t("share.sent", { count: json.data?.shared ?? selected.size }),
      )
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("share.failed"))
    } finally {
      setSharing(false)
    }
  }

  function copyLink() {
    if (!navigator.clipboard?.writeText) return
    navigator.clipboard.writeText(viewerUrl).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      toast.success(t("share.linkCopied"))
    })
  }

  const encodedUrl = encodeURIComponent(viewerUrl)
  const shareText = encodeURIComponent(`${fileName} — ${viewerUrl}`)
  const externals: Array<{
    key: string
    label: string
    href: string
    brand?: "whatsapp" | "telegram"
    icon?: typeof Mail01Icon
    tint: string
  }> = [
    {
      key: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${shareText}`,
      brand: "whatsapp",
      tint: "bg-[#25D366]/15 text-[#128C7E] dark:text-[#25D366]",
    },
    {
      key: "telegram",
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(fileName)}`,
      brand: "telegram",
      tint: "bg-[#229ED9]/15 text-[#229ED9]",
    },
    {
      key: "mail",
      label: t("share.email"),
      href: `mailto:?subject=${encodeURIComponent(fileName)}&body=${shareText}`,
      icon: Mail01Icon,
      tint: "bg-muted text-foreground/80",
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="truncate pe-6">{t("share.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 p-4">
          {/* ── Şirket içi ── */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-3.5" />
              {t("share.company")}
            </div>
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={2}
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("share.searchPeople")}
                className="h-9 pl-9"
              />
            </div>
            <div className="mt-2 max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-1 py-4 text-center text-sm text-muted-foreground">
                  {t("share.noPeople")}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {filtered.map((p) => {
                    const on = selected.has(p.userId)
                    const label = p.name || p.email || "?"
                    return (
                      <li key={p.userId}>
                        <button
                          type="button"
                          onClick={() => toggle(p.userId)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted",
                            on && "bg-primary/5",
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-foreground/70">
                            {p.image ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={p.image} alt="" className="size-full object-cover" />
                            ) : (
                              label.slice(0, 1).toUpperCase()
                            )}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">{label}</span>
                            {p.name && p.email ? (
                              <span className="truncate text-xs text-muted-foreground">{p.email}</span>
                            ) : null}
                          </span>
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border",
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {on && (
                              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2.5} className="size-3.5" />
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            {selected.size > 0 && (
              <Button
                onClick={doInternalShare}
                disabled={sharing}
                className="mt-2 w-full"
              >
                {sharing
                  ? t("share.sharing")
                  : t("share.shareWith", { count: selected.size })}
              </Button>
            )}
          </div>

          {/* ── Link + dış uygulamalar (yalnız public) ── */}
          {isPublic ? (
            <div className="border-t pt-4">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <HugeiconsIcon icon={Link01Icon} strokeWidth={2} className="size-3.5" />
                {t("share.link")}
              </div>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {viewerUrl}
                </div>
                <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0">
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Link01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                  {copied ? t("share.copied") : t("share.copy")}
                </Button>
              </div>
              <div className="mt-3 flex items-center justify-around">
                {externals.map((x) => (
                  <a
                    key={x.key}
                    href={x.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1.5"
                  >
                    <span className={cn("flex size-12 items-center justify-center rounded-full", x.tint)}>
                      {x.brand === "whatsapp" ? (
                        <WhatsAppGlyph />
                      ) : x.brand === "telegram" ? (
                        <TelegramGlyph />
                      ) : (
                        <HugeiconsIcon icon={x.icon!} strokeWidth={2} className="size-5" />
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{x.label}</span>
                  </a>
                ))}
                <a href={downloadUrl} className="flex flex-col items-center gap-1.5">
                  <span className="flex size-12 items-center justify-center rounded-full bg-muted text-foreground/80">
                    <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="size-5" />
                  </span>
                  <span className="text-[11px] text-muted-foreground">{t("share.save")}</span>
                </a>
              </div>
            </div>
          ) : (
            <p className="border-t pt-4 text-xs text-muted-foreground">
              {t("share.privateHint")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.2-.6.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.6-.8-2.7-1.4-3.7-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5-.1-.1-.6-1.5-.9-2-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 5 4.3 1.9.7 2.6.8 3.5.7.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z"/>
      <path d="M12 2a10 10 0 00-8.5 15.2L2 22l4.9-1.4A10 10 0 1012 2zm0 18.3c-1.5 0-3-.4-4.3-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.3 8.3 0 1112 20.3z"/>
    </svg>
  )
}

function TelegramGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3l-3 14.2c-.2 1-.8 1.2-1.7.8l-4.6-3.4-2.2 2.1c-.3.3-.5.4-.9.4l.3-4.6 8.4-7.6c.4-.3-.1-.5-.6-.2L7.5 13 3 11.5c-1-.3-1-.9.2-1.4l17.2-6.6c.8-.3 1.5.2 1.5 1.3z"/>
    </svg>
  )
}

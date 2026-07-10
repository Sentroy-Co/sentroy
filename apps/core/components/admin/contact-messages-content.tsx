"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Location01Icon, Globe02Icon, ComputerIcon, Mail01Icon, SentIcon, ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@workspace/ui/components/select"
import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { CONTACT_CATEGORIES } from "@/lib/contact"

type Status = "new" | "open" | "replied" | "closed"
const STATUSES: Status[] = ["new", "open", "replied", "closed"]

interface Reply {
  id: string
  authorName: string
  body: string
  createdAt: string
}
interface Msg {
  id: string
  name: string
  email: string | null
  category: string
  subject: string | null
  message: string
  status: Status
  assignedToUserId: string | null
  ipAddress: string | null
  userAgent: string | null
  ipInfo: { as_name?: string; country?: string; country_code?: string } | null
  replies: Reply[]
  createdAt: string
}
interface Assignee { id: string; name: string; email: string }

const STATUS_STYLE: Record<Status, string> = {
  new: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  open: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  replied: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
}

function browserOf(ua: string | null): string {
  if (!ua) return "—"
  if (ua.includes("Edg/")) return "Edge"
  if (ua.includes("OPR/") || ua.includes("Opera")) return "Opera"
  if (ua.includes("Chrome")) return "Chrome"
  if (ua.includes("Firefox")) return "Firefox"
  if (ua.includes("Safari")) return "Safari"
  return ua.slice(0, 32)
}
function fmtDate(s: string): string {
  try { return new Date(s).toLocaleString() } catch { return s }
}

export function ContactMessagesContent() {
  const t = useTranslations("admin")
  const tCat = useTranslations("contact")
  const [messages, setMessages] = useState<Msg[]>([])
  const [assignees, setAssignees] = useState<Assignee[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [status, setStatus] = useState<Status | "all">("all")
  const [selected, setSelected] = useState<Msg | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(id)
  }, [search])

  // Filtre değişince sayfayı başa al (aralık dışı sayfada takılma).
  useEffect(() => { setPage(1) }, [debounced, status])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ limit: "50", page: String(page) })
      if (debounced) qs.set("search", debounced)
      if (status !== "all") qs.set("status", status)
      const res = await fetch(`/api/admin/contact-messages?${qs}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed")
      setMessages((j.data?.messages as Msg[]) ?? [])
      setAssignees((j.data?.assignees as Assignee[]) ?? [])
      setTotalPages((j.data?.totalPages as number) ?? 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [debounced, status, page])

  useEffect(() => { void load() }, [load])

  const catLabel = (c: string) => {
    const key = `categories.${c}`
    return CONTACT_CATEGORIES.includes(c as never) ? tCat(key as never) : c
  }

  function applyUpdated(m: Msg) {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)))
    setSelected((s) => (s && s.id === m.id ? m : s))
  }

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-6xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("cm.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("cm.subtitle")}</p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("cm.search")}
            className="h-9 max-w-xs"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as Status | "all")}>
            <SelectTrigger className="h-9 w-44">
              <span>{status === "all" ? t("cm.allStatuses") : t(`cm.${status}`)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("cm.allStatuses")}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(`cm.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-5 rounded-xl border">
          {initialLoad ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : messages.length === 0 ? (
            <div className="p-10"><EmptyState title={t("cm.empty")} /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cm.sender")}</TableHead>
                  <TableHead>{t("cm.category")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("cm.sentAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => (
                  <TableRow key={m.id} className="cursor-pointer" onClick={() => setSelected(m)}>
                    <TableCell>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.email || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm">{catLabel(m.category)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[m.status]}`}>{t(`cm.${m.status}`)}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(m.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t px-3 py-2">
              <Button
                variant="ghost" size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={2} data-icon="inline-start" />
                {t("cm.prev")}
              </Button>
              <span className="text-xs text-muted-foreground">
                {loading && !initialLoad ? "…" : `${page} / ${totalPages}`}
              </span>
              <Button
                variant="ghost" size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                {t("cm.next")}
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" strokeWidth={2} data-icon="inline-end" />
              </Button>
            </div>
          ) : loading && !initialLoad ? (
            <div className="border-t p-2 text-center text-xs text-muted-foreground">…</div>
          ) : null}
        </div>
      </div>

      <DetailDialog
        msg={selected}
        assignees={assignees}
        onClose={() => setSelected(null)}
        onUpdated={applyUpdated}
        t={t}
        catLabel={catLabel}
      />
    </PageTransition>
  )
}

function DetailDialog({
  msg, assignees, onClose, onUpdated, t, catLabel,
}: {
  msg: Msg | null
  assignees: Assignee[]
  onClose: () => void
  onUpdated: (m: Msg) => void
  t: ReturnType<typeof useTranslations>
  catLabel: (c: string) => string
}) {
  const [reply, setReply] = useState("")
  const [busy, setBusy] = useState<"reply" | "status" | "assign" | null>(null)

  useEffect(() => { setReply("") }, [msg?.id])

  if (!msg) return null

  async function patch(body: Record<string, unknown>, kind: "status" | "assign") {
    if (!msg) return
    setBusy(kind)
    try {
      const res = await fetch(`/api/admin/contact-messages/${msg.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed")
      onUpdated(j.data as Msg)
      toast.success(kind === "status" ? t("cm.statusUpdated") : t("cm.assigned"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally { setBusy(null) }
  }

  async function sendReply() {
    if (!msg || reply.trim().length < 1) return
    setBusy("reply")
    try {
      const res = await fetch(`/api/admin/contact-messages/${msg.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply.trim() }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || "Failed")
      onUpdated(j.data as Msg)
      setReply("")
      toast.success(t("cm.replySent"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed")
    } finally { setBusy(null) }
  }

  const loc = [msg.ipInfo?.country, msg.ipInfo?.as_name].filter(Boolean).join(" · ")

  return (
    <Dialog open={!!msg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{msg.subject || catLabel(msg.category)}</DialogTitle>
        </DialogHeader>

        {/* Gönderen + meta */}
        <div className="rounded-lg border bg-muted/20 p-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{msg.name}</div>
              {msg.email ? (
                <a href={`mailto:${msg.email}`} className="text-xs text-primary hover:underline">{msg.email}</a>
              ) : (
                <div className="text-xs text-amber-600">{t("cm.noEmail")}</div>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{fmtDate(msg.createdAt)}</span>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs text-muted-foreground sm:grid-cols-2">
            <MetaRow icon={Mail01Icon} label={t("cm.category")} value={catLabel(msg.category)} />
            <MetaRow icon={Globe02Icon} label={t("cm.ip")} value={msg.ipAddress || "—"} />
            <MetaRow icon={Location01Icon} label={t("cm.location")} value={loc || "—"} />
            <MetaRow icon={ComputerIcon} label={t("cm.device")} value={browserOf(msg.userAgent)} />
          </dl>
        </div>

        {/* Mesaj */}
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("cm.message")}</div>
          <p className="whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm leading-relaxed">{msg.message}</p>
        </div>

        {/* Yanıtlar */}
        {msg.replies.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("cm.repliesTitle")}</div>
            {msg.replies.map((r) => (
              <div key={r.id} className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.authorName}</span>
                  <span>{fmtDate(r.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Durum + atama */}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("status")}</span>
            <Select value={msg.status} onValueChange={(v) => patch({ status: v }, "status")}>
              <SelectTrigger className="h-8 w-32" disabled={busy === "status"}>
                <span>{t(`cm.${msg.status}`)}</span>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`cm.${s}`)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("cm.assignTo")}</span>
            <Select
              value={msg.assignedToUserId ?? "__none__"}
              onValueChange={(v) => patch({ assignedToUserId: v === "__none__" ? null : v }, "assign")}
            >
              <SelectTrigger className="h-8 w-44" disabled={busy === "assign"}>
                <span className="truncate">
                  {msg.assignedToUserId
                    ? assignees.find((a) => a.id === msg.assignedToUserId)?.name ?? "…"
                    : t("cm.unassigned")}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("cm.unassigned")}</SelectItem>
                {assignees.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Yanıt yaz */}
        <div className="border-t pt-4">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t("cm.replyPh")}
            rows={4}
            className="w-full resize-none rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex justify-end">
            <Button onClick={sendReply} disabled={busy === "reply" || reply.trim().length < 1}>
              <HugeiconsIcon icon={SentIcon} className="size-4" strokeWidth={2} data-icon="inline-start" />
              {busy === "reply" ? t("cm.sending") : t("cm.send")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MetaRow({ icon, label, value }: { icon: typeof Location01Icon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <HugeiconsIcon icon={icon} className="size-3.5 shrink-0 opacity-60" strokeWidth={2} />
      <span className="shrink-0">{label}:</span>
      <span className="truncate text-foreground">{value}</span>
    </div>
  )
}

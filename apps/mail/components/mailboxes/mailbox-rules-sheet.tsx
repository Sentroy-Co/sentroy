"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { useParams } from "next/navigation"
import debounce from "lodash/debounce"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Delete02Icon,
  PlusSignIcon,
  UserGroupIcon,
  Folder01Icon,
  Tag01Icon,
  Alert02Icon,
} from "@hugeicons/core-free-icons"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import { cn } from "@workspace/ui/lib/utils"
import { confirm } from "@workspace/console/stores/confirm"

const CATEGORIES = [
  "promotions",
  "updates",
  "receipts",
  "social",
  "primary",
] as const
type Category = (typeof CATEGORIES)[number]
type RuleKind = "category" | "move"

interface RuleDoc {
  id: string
  mailbox: string
  sender: string
  kind: RuleKind
  category: Category | null
  targetFolder: string | null
  createdAt: string
}

interface FolderInfo {
  path: string
  name: string
  specialUse: string | null
}

const CATEGORY_TONE: Record<Category, string> = {
  promotions: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  updates: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  receipts: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  social: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  primary: "bg-muted text-foreground",
}

/**
 * IMAP folders we never offer as a move target — moving into them
 * would either be destructive (Trash) or surprising (Sent), and the
 * mail-server already auto-routes to most of these via special_use.
 */
const SYSTEM_FOLDER_BLOCKLIST = new Set([
  "INBOX",
  "Sent",
  "Drafts",
  "Trash",
  "Junk",
  "Spam",
  "Archive",
])

function isUserFolder(f: FolderInfo): boolean {
  if (f.specialUse) return false
  if (SYSTEM_FOLDER_BLOCKLIST.has(f.path)) return false
  if (SYSTEM_FOLDER_BLOCKLIST.has(f.name)) return false
  return true
}

export function MailboxRulesSheet({
  mailbox,
  open,
  onOpenChange,
}: {
  mailbox: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("mailboxes")
  const tInbox = useTranslations("inbox")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [rules, setRules] = useState<RuleDoc[]>([])
  const [loading, setLoading] = useState(false)

  // Add-rule form state
  const [senderInput, setSenderInput] = useState("")
  const [domainWildcard, setDomainWildcard] = useState(false)
  const [kind, setKind] = useState<RuleKind>("category")
  const [category, setCategory] = useState<Category>("updates")
  const [targetFolder, setTargetFolder] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [foldersLoading, setFoldersLoading] = useState(false)

  const apiBase = `/api/companies/${slug}/inbox/rules`
  const inboxApi = `/api/companies/${slug}/inbox`

  const fetchRules = useCallback(async () => {
    if (!mailbox) return
    setLoading(true)
    try {
      const res = await fetch(
        `${apiBase}?mailbox=${encodeURIComponent(mailbox)}`,
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setRules((json.data?.items as RuleDoc[]) ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load rules")
    } finally {
      setLoading(false)
    }
  }, [apiBase, mailbox])

  // Folder list — fetched lazily because it's only needed when the
  // user picks the "move" action. Fetched eagerly with the rules
  // anyway since the dropdown is the worst place to first see a
  // spinner; folders for an account rarely number more than ~10 so
  // the cost is trivial.
  const fetchFolders = useCallback(async () => {
    if (!mailbox) return
    setFoldersLoading(true)
    try {
      const res = await fetch(
        `${inboxApi}/mailboxes?mailbox=${encodeURIComponent(mailbox)}`,
      )
      const json = await res.json()
      if (res.ok && Array.isArray(json.data)) {
        setFolders(
          (json.data as FolderInfo[]).map((f) => ({
            path: f.path,
            name: f.name,
            specialUse: f.specialUse ?? null,
          })),
        )
      }
    } catch {
      // Folder fetch is best-effort — falling back to "no folders"
      // surfaces a clearer empty state than a thrown toast.
    } finally {
      setFoldersLoading(false)
    }
  }, [inboxApi, mailbox])

  useEffect(() => {
    if (open && mailbox) {
      void fetchRules()
      void fetchFolders()
    }
  }, [open, mailbox, fetchRules, fetchFolders])

  // Reset form when sheet target changes
  useEffect(() => {
    setSenderInput("")
    setDomainWildcard(false)
    setKind("category")
    setCategory("updates")
    setTargetFolder("")
    setPreviewCount(null)
  }, [mailbox])

  // Compute the resolved sender expression (raw email vs `@domain`).
  const resolvedSender = useMemo(() => {
    const raw = senderInput.trim().toLowerCase()
    if (!raw) return ""
    if (domainWildcard) {
      // Strip everything before `@`, prefix `@` if user typed plain domain.
      const at = raw.lastIndexOf("@")
      const domain = at >= 0 ? raw.slice(at + 1) : raw
      return `@${domain}`
    }
    return raw
  }, [senderInput, domainWildcard])

  const userFolders = useMemo(() => folders.filter(isUserFolder), [folders])

  // If the user-folder list resolves to exactly one entry, pick it
  // automatically — saves a click and matches the common case (most
  // users have one custom folder like "Newsletters").
  useEffect(() => {
    if (kind !== "move") return
    if (targetFolder) return
    if (userFolders.length === 1) {
      setTargetFolder(userFolders[0]!.path)
    }
  }, [kind, userFolders, targetFolder])

  // Conflict hint — surface when the same sender already has a rule
  // so the user knows hitting "add" overwrites instead of duplicating.
  const existingRule = useMemo(
    () => rules.find((r) => r.sender === resolvedSender) ?? null,
    [rules, resolvedSender],
  )

  // Debounced preview — query the count endpoint as the user types so
  // they see "would reclassify N messages" before committing.
  const runPreview = useMemo(
    () =>
      debounce(async (mb: string, sender: string) => {
        if (!sender) {
          setPreviewCount(null)
          return
        }
        setPreviewing(true)
        try {
          const res = await fetch(`${apiBase}/preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mailbox: mb, sender }),
          })
          const json = await res.json()
          if (res.ok) {
            setPreviewCount(json.data?.matched ?? 0)
          } else {
            setPreviewCount(null)
          }
        } catch {
          setPreviewCount(null)
        } finally {
          setPreviewing(false)
        }
      }, 300),
    [apiBase],
  )

  useEffect(() => {
    if (!mailbox || !resolvedSender) {
      setPreviewCount(null)
      return
    }
    runPreview(mailbox, resolvedSender)
    return () => runPreview.cancel()
  }, [mailbox, resolvedSender, runPreview])

  const canSubmit =
    !!resolvedSender &&
    !submitting &&
    (kind === "category" ? true : !!targetFolder)

  const submitRule = useCallback(async () => {
    if (!mailbox || !resolvedSender) return
    if (kind === "move" && !targetFolder) return
    setSubmitting(true)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailbox,
          sender: resolvedSender,
          kind,
          ...(kind === "category"
            ? { category }
            : { targetFolder }),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      const data = json.data as {
        updated?: number
        moved?: number
        moveError?: string | null
      }
      if (kind === "category") {
        toast.success(
          tInbox("ruleAdded", {
            category: tInbox(`ruleCategory_${category}`),
            count: data?.updated ?? 0,
          }),
        )
      } else {
        toast.success(
          tInbox("ruleAddedMove", {
            folder: targetFolder,
            count: data?.moved ?? 0,
          }),
        )
        if (data?.moveError) {
          toast.error(data.moveError)
        }
      }
      setSenderInput("")
      setDomainWildcard(false)
      setPreviewCount(null)
      void fetchRules()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tInbox("ruleFailed"))
    } finally {
      setSubmitting(false)
    }
  }, [
    apiBase,
    category,
    fetchRules,
    kind,
    mailbox,
    resolvedSender,
    targetFolder,
    tInbox,
  ])

  const removeRule = useCallback(
    async (ruleId: string) => {
      if (!mailbox) return
      const ok = await confirm({
        title: t("ruleDeleteTitle"),
        description: t("ruleDeleteDesc"),
        confirmText: t("ruleDeleteConfirm"),
        destructive: true,
      })
      if (!ok) return
      try {
        const res = await fetch(
          `${apiBase}?ruleId=${ruleId}&mailbox=${encodeURIComponent(mailbox)}`,
          { method: "DELETE" },
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed")
        toast.success(t("ruleDeleted"))
        setRules((prev) => prev.filter((r) => r.id !== ruleId))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed")
      }
    },
    [apiBase, mailbox, t],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!w-full !max-w-md p-0 bg-background"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} className="size-4" />
              {t("rulesTitle")}
            </SheetTitle>
            <SheetDescription className="font-mono text-[12.5px]">
              {mailbox}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5">
            {/* Add-rule form */}
            <div className="mb-6 rounded-xl border border-border p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("ruleAddTitle")}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-[12px] text-muted-foreground">
                    {t("ruleSender")}
                  </label>
                  <Input
                    value={senderInput}
                    onChange={(e) => setSenderInput(e.target.value)}
                    placeholder={
                      domainWildcard
                        ? t("ruleSenderWildcardPlaceholder")
                        : t("ruleSenderPlaceholder")
                    }
                    className="h-9 rounded-md font-mono text-[12.5px]"
                    autoComplete="off"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                      <Switch
                        checked={domainWildcard}
                        onCheckedChange={setDomainWildcard}
                        size="sm"
                      />
                      {t("ruleDomainWildcard")}
                    </label>
                    {resolvedSender ? (
                      <code className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10.5px] text-foreground">
                        {resolvedSender}
                      </code>
                    ) : null}
                  </div>
                </div>

                {/* Conflict warning — only when current input collides
                    with an existing rule. Click-add will overwrite on
                    the server (upsert). */}
                {existingRule ? (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11.5px] text-amber-700 dark:text-amber-400">
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      strokeWidth={2}
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    <span>
                      {existingRule.kind === "category"
                        ? t("ruleConflictCategory", {
                            category: tInbox(
                              `ruleCategory_${existingRule.category!}`,
                            ),
                          })
                        : t("ruleConflictMove", {
                            folder: existingRule.targetFolder ?? "",
                          })}
                    </span>
                  </div>
                ) : null}

                {/* Action picker — category vs move-to-folder. */}
                <div>
                  <label className="mb-1.5 block text-[12px] text-muted-foreground">
                    {t("ruleAction")}
                  </label>
                  <Select
                    value={kind}
                    onValueChange={(v) => v && setKind(v as RuleKind)}
                  >
                    <SelectTrigger className="h-9 rounded-md text-[12.5px]">
                      <span className="inline-flex items-center gap-2">
                        <HugeiconsIcon
                          icon={kind === "move" ? Folder01Icon : Tag01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        {kind === "move"
                          ? t("ruleActionMove")
                          : t("ruleActionCategory")}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="category">
                        {t("ruleActionCategory")}
                      </SelectItem>
                      <SelectItem value="move">
                        {t("ruleActionMove")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {kind === "category" ? (
                  <div>
                    <label className="mb-1.5 block text-[12px] text-muted-foreground">
                      {t("ruleCategory")}
                    </label>
                    <Select
                      value={category}
                      onValueChange={(v) => v && setCategory(v as Category)}
                    >
                      <SelectTrigger className="h-9 rounded-md text-[12.5px]">
                        <span>{tInbox(`ruleCategory_${category}`)}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {tInbox(`ruleCategory_${c}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div>
                    <label className="mb-1.5 block text-[12px] text-muted-foreground">
                      {t("ruleTargetFolder")}
                    </label>
                    {foldersLoading ? (
                      <Skeleton className="h-9 w-full rounded-md" />
                    ) : userFolders.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11.5px] text-muted-foreground">
                        {t("ruleNoFolders")}
                      </div>
                    ) : (
                      <Select
                        value={targetFolder}
                        onValueChange={(v) => v && setTargetFolder(v)}
                      >
                        <SelectTrigger className="h-9 rounded-md text-[12.5px]">
                          <span className="font-mono text-[12.5px]">
                            {targetFolder || (
                              <span className="text-muted-foreground">
                                {t("ruleTargetFolderPlaceholder")}
                              </span>
                            )}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {userFolders.map((f) => (
                            <SelectItem key={f.path} value={f.path}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        strokeWidth={2}
                        className="mt-0.5 size-3 shrink-0"
                      />
                      <span>{t("ruleFutureNotApplied")}</span>
                    </div>
                  </div>
                )}

                {/* Preview hint — only shown for category rules; move
                    rules don't have a cache count, the action runs
                    against live IMAP at submit. */}
                {kind === "category" && resolvedSender ? (
                  <div className="text-[11.5px] text-muted-foreground">
                    {previewing
                      ? t("rulePreviewLoading")
                      : previewCount === null
                        ? t("rulePreviewNone")
                        : t("rulePreviewCount", { count: previewCount })}
                  </div>
                ) : null}

                <Button
                  onClick={submitRule}
                  disabled={!canSubmit}
                  className="w-full"
                >
                  {submitting ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                  )}
                  {t("ruleAddButton")}
                </Button>
              </div>
            </div>

            {/* Existing rules */}
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("rulesExisting", { count: rules.length })}
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : rules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">
                {t("rulesEmpty")}
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {rules.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    {r.kind === "move" ? (
                      <Badge
                        variant="secondary"
                        className="inline-flex items-center gap-1 bg-sky-500/15 font-mono text-[10px] uppercase text-sky-700 dark:text-sky-400"
                      >
                        <HugeiconsIcon
                          icon={Folder01Icon}
                          strokeWidth={2}
                          className="size-3"
                        />
                        {r.targetFolder ?? ""}
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-mono text-[10px] uppercase",
                          r.category ? CATEGORY_TONE[r.category] : "",
                        )}
                      >
                        {r.category
                          ? tInbox(`ruleCategory_${r.category}`)
                          : ""}
                      </Badge>
                    )}
                    <code className="flex-1 truncate font-mono text-[12px] text-foreground">
                      {r.sender}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeRule(r.id)}
                      title={t("ruleDeleteConfirm")}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      <span className="sr-only">{t("ruleDeleteConfirm")}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import debounce from "lodash/debounce"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Loading03Icon,
  Search01Icon,
  Cancel01Icon,
  PlusSignIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { cn } from "@workspace/ui/lib/utils"

interface Contact {
  id: string
  email: string
  name?: string
  status: string
}

interface ContactList {
  id: string
  name: string
  description?: string
  contactCount: number
}

interface ListMembersSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  list: ContactList | null
  slug: string
  /** Üye eklendiğinde/silindiğinde parent'a bildirim — sayıyı yenilesin */
  onMembersChanged?: () => void
}

export function ListMembersSheet({
  open,
  onOpenChange,
  list,
  slug,
  onMembersChanged,
}: ListMembersSheetProps) {
  const t = useTranslations("audience")

  const [members, setMembers] = useState<Contact[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [suggestions, setSuggestions] = useState<Contact[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const contactsApi = `/api/companies/${slug}/audience/contacts`
  const listsApi = `/api/companies/${slug}/audience/lists`

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.id)),
    [members],
  )

  // ── Üyeleri yükle ─────────────────────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    if (!list) return
    setLoadingMembers(true)
    try {
      // 1) Listedeki contactId'leri al
      const res = await fetch(`${listsApi}/${list.id}/members`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      const ids = (json.data as string[]) ?? []

      if (ids.length === 0) {
        setMembers([])
        return
      }

      // 2) Contact detaylarını bul — mevcut /contacts endpoint'i tüm contact'ları
      //    getir, sonra filtrele. (Büyük data için ayrı bir endpoint gerekebilir.)
      const cRes = await fetch(`${contactsApi}?limit=100`)
      const cJson = await cRes.json()
      const allContacts: Contact[] =
        (cJson.data?.contacts as Contact[]) ?? []

      const idSet = new Set(ids)
      setMembers(allContacts.filter((c) => idSet.has(c.id)))
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load members",
      )
    } finally {
      setLoadingMembers(false)
    }
  }, [list, listsApi, contactsApi])

  useEffect(() => {
    if (open && list) {
      setSearchQuery("")
      setSuggestions([])
      fetchMembers()
    }
  }, [open, list, fetchMembers])

  // ── Contact arama (debounced) ─────────────────────────────────────────────

  const runSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setSuggestions([])
        return
      }
      setSearching(true)
      try {
        const res = await fetch(
          `${contactsApi}?q=${encodeURIComponent(q)}`,
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed")
        setSuggestions((json.data as Contact[]) ?? [])
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    },
    [contactsApi],
  )

  const debouncedSearch = useMemo(
    () => debounce(runSearch, 300),
    [runSearch],
  )

  useEffect(() => {
    debouncedSearch(searchQuery)
    return () => debouncedSearch.cancel()
  }, [searchQuery, debouncedSearch])

  // ── Üye ekleme/çıkarma ────────────────────────────────────────────────────

  async function handleAddMember(contact: Contact) {
    if (!list) return
    if (memberIds.has(contact.id)) {
      toast.error(t("alreadyMember"))
      return
    }
    setBusyId(contact.id)
    try {
      const res = await fetch(`${listsApi}/${list.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setMembers((prev) => [...prev, contact])
      setSearchQuery("")
      setSuggestions([])
      toast.success(t("memberAdded"))
      onMembersChanged?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add")
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemoveMember(contact: Contact) {
    if (!list) return
    setBusyId(contact.id)
    try {
      const res = await fetch(`${listsApi}/${list.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setMembers((prev) => prev.filter((m) => m.id !== contact.id))
      toast.success(t("memberRemoved"))
      onMembersChanged?.()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove")
    } finally {
      setBusyId(null)
    }
  }

  // Öneriler: üye olmayanlar
  const nonMemberSuggestions = suggestions.filter((c) => !memberIds.has(c.id))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-full !max-w-xl p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b">
            <SheetTitle>{list?.name || t("members")}</SheetTitle>
            {list?.description && (
              <SheetDescription>{list.description}</SheetDescription>
            )}
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <HugeiconsIcon
                icon={UserMultipleIcon}
                strokeWidth={2}
                className="size-3.5"
              />
              <span>
                {members.length} {t("members")}
              </span>
            </div>
          </SheetHeader>

          {/* Add member search */}
          <div className="relative border-b p-4">
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchContacts")}
              className="pl-10"
            />

            {/* Suggestions dropdown */}
            {searchQuery.trim() && (
              <div className="absolute left-4 right-4 top-full z-20 mt-1 max-h-60 overflow-auto rounded-2xl border bg-popover p-1 shadow-lg">
                {searching ? (
                  <div className="flex items-center justify-center py-3">
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      strokeWidth={2}
                      className="size-4 animate-spin text-muted-foreground"
                    />
                  </div>
                ) : nonMemberSuggestions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {t("noMatchingContacts")}
                  </p>
                ) : (
                  nonMemberSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={busyId === c.id}
                      onClick={() => handleAddMember(c)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      <span className="flex flex-col min-w-0">
                        {c.name && (
                          <span className="truncate text-xs font-medium">
                            {c.name}
                          </span>
                        )}
                        <span className="truncate text-xs text-muted-foreground">
                          {c.email}
                        </span>
                      </span>
                      <HugeiconsIcon
                        icon={
                          busyId === c.id ? Loading03Icon : PlusSignIcon
                        }
                        strokeWidth={2}
                        className={cn(
                          "size-4 text-muted-foreground",
                          busyId === c.id && "animate-spin",
                        )}
                      />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Members list */}
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 p-4">
              {loadingMembers ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))
              ) : members.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <HugeiconsIcon
                    icon={UserMultipleIcon}
                    strokeWidth={1.5}
                    className="size-8 text-muted-foreground/50"
                  />
                  <p className="text-sm font-medium">{t("noMembersYet")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("addFirstMember")}
                  </p>
                </div>
              ) : (
                members.map((m) => (
                  <div
                    key={m.id}
                    className="group flex items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {m.name || m.email}
                      </span>
                      {m.name && (
                        <span className="truncate text-xs text-muted-foreground">
                          {m.email}
                        </span>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] capitalize shrink-0"
                    >
                      {m.status}
                    </Badge>
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => handleRemoveMember(m)}
                      title={t("removeMember")}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
                    >
                      <HugeiconsIcon
                        icon={
                          busyId === m.id ? Loading03Icon : Cancel01Icon
                        }
                        strokeWidth={2}
                        className={cn(
                          "size-3.5",
                          busyId === m.id && "animate-spin",
                        )}
                      />
                    </button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}

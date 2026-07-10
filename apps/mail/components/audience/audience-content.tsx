"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  UserMultipleIcon,
  Delete02Icon,
  Loading03Icon,
  Edit02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ContactDialog } from "@/components/audience/contact-dialog"
import { ListDialog } from "@/components/audience/list-dialog"
import { ListMembersSheet } from "@/components/audience/list-members-sheet"
import { confirm } from "@workspace/console/stores/confirm"

interface Contact {
  id: string
  email: string
  name?: string
  tags: string[]
  status: string
  lastEmailedAt?: string
  createdAt?: string
}

interface ContactList {
  id: string
  name: string
  description?: string
  contactCount: number
  createdAt?: string
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    unsubscribed:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bounced:
      "border-destructive/30 bg-destructive/10 text-destructive",
  }
  return (
    <Badge variant="outline" className={colorMap[status] ?? ""}>
      {status}
    </Badge>
  )
}

export function AudienceContent() {
  const t = useTranslations("audience")
  const tCommon = useTranslations("common")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [contacts, setContacts] = useState<Contact[]>([])
  const [lists, setLists] = useState<ContactList[]>([])
  const [loadingContacts, setLoadingContacts] = useState(true)
  const [loadingLists, setLoadingLists] = useState(true)

  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [listDialogOpen, setListDialogOpen] = useState(false)
  const [deletingContactId, setDeletingContactId] = useState<string | null>(
    null
  )
  const [deletingListId, setDeletingListId] = useState<string | null>(null)

  const [membersSheetList, setMembersSheetList] = useState<ContactList | null>(
    null,
  )

  const contactsApi = `/api/companies/${slug}/audience/contacts`
  const listsApi = `/api/companies/${slug}/audience/lists`

  const fetchContacts = useCallback(async () => {
    setLoadingContacts(true)
    try {
      const res = await fetch(contactsApi)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load contacts")
      }
      setContacts((json.data?.contacts as Contact[]) ?? [])
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load contacts"
      toast.error(message)
    } finally {
      setLoadingContacts(false)
    }
  }, [contactsApi])

  const fetchLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const res = await fetch(listsApi)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load lists")
      }
      setLists((json.data as ContactList[]) ?? [])
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load lists"
      toast.error(message)
    } finally {
      setLoadingLists(false)
    }
  }, [listsApi])

  useEffect(() => {
    fetchContacts()
    fetchLists()
  }, [fetchContacts, fetchLists])

  async function handleSaveContact(data: {
    email: string
    name?: string
    tags: string[]
    status: string
  }) {
    if (editingContact?.id) {
      const res = await fetch(`${contactsApi}/${editingContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to update contact")
      }
      toast.success(t("contactUpdated"))
    } else {
      const res = await fetch(contactsApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to create contact")
      }
      toast.success(t("contactAdded"))
    }
    fetchContacts()
  }

  async function handleDeleteContact(contact: Contact) {
    const ok = await confirm({
      title: t("confirmDeleteContact"),
      description: t("confirmDeleteContactDesc", { email: contact.email }),
      confirmText: tCommon("delete"),
      destructive: true,
    })
    if (!ok) return

    setDeletingContactId(contact.id)
    try {
      const res = await fetch(`${contactsApi}/${contact.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete contact")
      }
      setContacts((prev) => prev.filter((c) => c.id !== contact.id))
      toast.success(t("contactDeleted"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete contact"
      toast.error(message)
    } finally {
      setDeletingContactId(null)
    }
  }

  async function handleCreateList(data: {
    name: string
    description?: string
  }) {
    const res = await fetch(listsApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json.error || "Failed to create list")
    }
    toast.success(t("listCreated"))
    fetchLists()
  }

  async function handleDeleteList(list: ContactList) {
    const ok = await confirm({
      title: t("confirmDeleteList"),
      description: t("confirmDeleteListDesc", { name: list.name }),
      confirmText: tCommon("delete"),
      destructive: true,
    })
    if (!ok) return

    setDeletingListId(list.id)
    try {
      const res = await fetch(`${listsApi}/${list.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete list")
      }
      setLists((prev) => prev.filter((l) => l.id !== list.id))
      if (membersSheetList?.id === list.id) {
        setMembersSheetList(null)
      }
      toast.success(t("listDeleted"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete list"
      toast.error(message)
    } finally {
      setDeletingListId(null)
    }
  }

  function handleViewMembers(list: ContactList) {
    setMembersSheetList(list)
  }

  function openAddContact() {
    setEditingContact(null)
    setContactDialogOpen(true)
  }

  function openEditContact(contact: Contact) {
    setEditingContact(contact)
    setContactDialogOpen(true)
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        <HugeiconsIcon
          icon={UserMultipleIcon}
          strokeWidth={1.5}
          className="size-7 text-muted-foreground"
        />
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">{t("contacts")}</TabsTrigger>
          <TabsTrigger value="lists">{t("lists")}</TabsTrigger>
        </TabsList>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <Button onClick={openAddContact}>
              <HugeiconsIcon
                icon={PlusSignIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("addContact")}
            </Button>
          </div>

          {loadingContacts ? (
            <div className="rounded-xl border">
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
              <EmptyState
                icon={
                  <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={1.5} />
                }
                title={t("emptyContacts")}
                description={t("emptyContactsDesc")}
                action={
                  <Button onClick={openAddContact}>
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("addContact")}
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("email")}</TableHead>
                    <TableHead>{t("name")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("tags")}</TableHead>
                    <TableHead className="text-end">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        {contact.email}
                      </TableCell>
                      <TableCell>{contact.name ?? "-"}</TableCell>
                      <TableCell>
                        <StatusBadge status={contact.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {contact?.tags?.map((tag: string) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditContact(contact)}
                          >
                            <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                            <span className="sr-only">
                              {t("editContact")}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={deletingContactId === contact.id}
                            onClick={() => handleDeleteContact(contact)}
                          >
                            <HugeiconsIcon
                              icon={
                                deletingContactId === contact.id
                                  ? Loading03Icon
                                  : Delete02Icon
                              }
                              strokeWidth={2}
                              className={
                                deletingContactId === contact.id
                                  ? "animate-spin"
                                  : undefined
                              }
                            />
                            <span className="sr-only">
                              {t("contactDeleted")}
                            </span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Lists Tab */}
        <TabsContent value="lists" className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <Button onClick={() => setListDialogOpen(true)}>
              <HugeiconsIcon
                icon={PlusSignIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("createList")}
            </Button>
          </div>

          {loadingLists ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-xl" />
              ))}
            </div>
          ) : lists.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
              <EmptyState
                icon={
                  <HugeiconsIcon icon={UserGroupIcon} strokeWidth={1.5} />
                }
                title={t("emptyLists")}
                description={t("emptyListsDesc")}
                action={
                  <Button onClick={() => setListDialogOpen(true)}>
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("createList")}
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lists.map((list) => (
                <Card
                  key={list.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => handleViewMembers(list)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">
                        {list.name}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletingListId === list.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteList(list)
                        }}
                      >
                        <HugeiconsIcon
                          icon={
                            deletingListId === list.id
                              ? Loading03Icon
                              : Delete02Icon
                          }
                          strokeWidth={2}
                          className={
                            deletingListId === list.id
                              ? "animate-spin"
                              : undefined
                          }
                        />
                      </Button>
                    </div>
                    {list.description && (
                      <CardDescription className="truncate">
                        {list.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">
                        {list.contactCount} {t("members")}
                      </span>
                      <span className="text-xs text-primary">
                        {t("viewMembers")} →
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ContactDialog
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        contact={editingContact}
        onSave={handleSaveContact}
      />
      <ListDialog
        open={listDialogOpen}
        onOpenChange={setListDialogOpen}
        onSave={handleCreateList}
      />
      <ListMembersSheet
        open={!!membersSheetList}
        onOpenChange={(open) => {
          if (!open) setMembersSheetList(null)
        }}
        list={membersSheetList}
        slug={slug}
        onMembersChanged={fetchLists}
      />
    </PageTransition>
  )
}

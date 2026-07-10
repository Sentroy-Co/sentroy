"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mailbox01Icon,
  PlusSignIcon,
  Delete02Icon,
  SquareLockPasswordIcon,
  Loading03Icon,
  Key01Icon,
  UserGroupIcon,
  HelpCircleIcon,
} from "@hugeicons/core-free-icons"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useCompanyStore } from "@workspace/console/stores/company"
import { CreateMailboxDialog } from "@/components/mailboxes/create-mailbox-dialog"
import { ChangePasswordDialog } from "@/components/mailboxes/change-password-dialog"
import { MailboxCredentialsSheet } from "@/components/mailboxes/mailbox-credentials-sheet"
import { MailboxRulesSheet } from "@/components/mailboxes/mailbox-rules-sheet"
import { useMailTour } from "@/components/tour/mail-tour"

interface Mailbox {
  email: string
  domain: string
  isCatchAll: boolean
}

function mapSdkMailbox(raw: Record<string, unknown>): Mailbox {
  const email = (raw.email ?? raw.address ?? "") as string
  const domain =
    (raw.domain as string) ?? (email.includes("@") ? email.split("@")[1] : "")
  const isCatchAll = raw.isCatchAll === true
  return { email, domain, isCatchAll }
}

export function MailboxesContent() {
  const t = useTranslations("mailboxes")
  const tTour = useTranslations("tour")
  const { startMailboxTour } = useMailTour()
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]
  const { activeCompany } = useCompanyStore()

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState<string | null>(
    null
  )
  const [changePasswordEmail, setChangePasswordEmail] = useState<string | null>(
    null
  )
  const [credentialsEmail, setCredentialsEmail] = useState<string | null>(null)
  const [rulesEmail, setRulesEmail] = useState<string | null>(null)

  const apiBase = `/api/companies/${slug}/mailboxes`

  const fetchMailboxes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load mailboxes")
      }
      const list = (json.data as Record<string, unknown>[]) ?? []
      setMailboxes(list.map(mapSdkMailbox))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load mailboxes"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchMailboxes()
  }, [fetchMailboxes])

  async function handleDelete(email: string) {
    setDeletingEmail(email)
    try {
      const encodedEmail = encodeURIComponent(email)
      const res = await fetch(`${apiBase}/${encodedEmail}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete mailbox")
      }
      setMailboxes((prev) => prev.filter((m) => m.email !== email))
      setDeleteConfirmEmail(null)
      toast.success(t("mailboxDeleted"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete mailbox"
      toast.error(message)
    } finally {
      setDeletingEmail(null)
    }
  }

  const maxMailboxes = activeCompany?.maxMailboxes ?? 0
  const usedMailboxes = mailboxes.length

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="rounded-xl border">
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          {maxMailboxes > 0 && (
            <Badge variant="outline">
              {usedMailboxes}/{maxMailboxes} {t("quota")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={startMailboxTour}
            title={tTour("restart")}
            aria-label={tTour("restart")}
          >
            <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} />
          </Button>
          <Button data-tour="add-mailbox" onClick={() => setShowCreateDialog(true)}>
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("createMailbox")}
          </Button>
        </div>
      </div>

      {mailboxes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Mailbox01Icon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={() => setShowCreateDialog(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("createMailbox")}
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
                <TableHead>{t("domain")}</TableHead>
                <TableHead className="text-end">
                  {t("actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mailboxes.map((mailbox) => (
                <TableRow key={mailbox.email}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{mailbox.email}</span>
                      {mailbox.isCatchAll && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400"
                          title={`Receives all *@${mailbox.domain} mail`}
                        >
                          Catch-all
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{mailbox.domain}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setRulesEmail(mailbox.email)}
                        title={t("rules")}
                      >
                        <HugeiconsIcon icon={UserGroupIcon} strokeWidth={2} />
                        <span className="sr-only">{t("rules")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setCredentialsEmail(mailbox.email)}
                      >
                        <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                        <span className="sr-only">
                          {t("credentials")}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setChangePasswordEmail(mailbox.email)
                        }
                      >
                        <HugeiconsIcon
                          icon={SquareLockPasswordIcon}
                          strokeWidth={2}
                        />
                        <span className="sr-only">
                          {t("changePassword")}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletingEmail === mailbox.email}
                        onClick={() =>
                          setDeleteConfirmEmail(mailbox.email)
                        }
                      >
                        <HugeiconsIcon
                          icon={
                            deletingEmail === mailbox.email
                              ? Loading03Icon
                              : Delete02Icon
                          }
                          strokeWidth={2}
                          className={
                            deletingEmail === mailbox.email
                              ? "animate-spin"
                              : undefined
                          }
                        />
                        <span className="sr-only">
                          {t("deleteMailbox")}
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

      {/* Create Mailbox Dialog */}
      <CreateMailboxDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={fetchMailboxes}
      />

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={changePasswordEmail !== null}
        onOpenChange={(open) => {
          if (!open) setChangePasswordEmail(null)
        }}
        email={changePasswordEmail ?? ""}
        onChanged={fetchMailboxes}
      />

      {/* SMTP & IMAP Credentials Sheet */}
      <MailboxCredentialsSheet
        open={credentialsEmail !== null}
        onOpenChange={(open) => {
          if (!open) setCredentialsEmail(null)
        }}
        email={credentialsEmail}
        onChangePassword={() => {
          const em = credentialsEmail
          setCredentialsEmail(null)
          if (em) setChangePasswordEmail(em)
        }}
      />

      {/* Inbox category rules per mailbox */}
      <MailboxRulesSheet
        mailbox={rulesEmail}
        open={rulesEmail !== null}
        onOpenChange={(open) => {
          if (!open) setRulesEmail(null)
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmEmail !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmEmail(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteMailbox")}</DialogTitle>
            <DialogDescription>{deleteConfirmEmail}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("deleteConfirm")}
          </p>
          {mailboxes.find((m) => m.email === deleteConfirmEmail)?.isCatchAll && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              {t("deleteCatchAllWarn")}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmEmail(null)}
              disabled={deletingEmail !== null}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmEmail) handleDelete(deleteConfirmEmail)
              }}
              disabled={deletingEmail !== null}
            >
              {deletingEmail && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("deleteMailbox")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

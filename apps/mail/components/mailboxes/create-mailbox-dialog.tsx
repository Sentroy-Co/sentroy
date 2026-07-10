"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, Alert02Icon, Mail01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Field, FieldLabel, FieldError } from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@workspace/ui/components/select"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import { Checkbox } from "@workspace/ui/components/checkbox"

interface CreateMailboxDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateMailboxDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateMailboxDialogProps) {
  const t = useTranslations("mailboxes")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const { domains, domainsLoading } = useCompanyDataStore()

  const [prefix, setPrefix] = useState("")
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ prefix?: string; domain?: string; password?: string }>({})
  const [isCatchAll, setIsCatchAll] = useState(false)
  const [confirmCatchAll, setConfirmCatchAll] = useState<{
    conflicting: string[]
  } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const selectedDomain = domains.find((d) => d.id === selectedDomainId)

  // Domain'in mevcut catch-all'ı varsa rozet için.
  // Type genişlemesi: company-data store'da Domain'e `catchAll` eklendi
  // (API enrichment); store-level type güncellenene kadar inline cast.
  type WithCatchAll = {
    catchAll?: { targetMailboxEmail: string; enabled: boolean } | null
  }
  const getCatchAll = (
    d: (typeof domains)[number] | undefined,
  ): WithCatchAll["catchAll"] =>
    (d as WithCatchAll | undefined)?.catchAll
  const existingCatchAll = getCatchAll(selectedDomain)
  // Catch-all aktif olan domain'de NORMAL mailbox açmak anlamsız —
  // catch-all zaten *@domain → tek hedef'e route ediyor, ekstra mailbox
  // catch-all'ın hedefini kestirir ya da çakışır. Yeni catch-all yaratma
  // (isCatchAll=true) modunda aynı domain seçilebilir (mevcut catch-all'ı
  // değiştirme amaçlı). Buton + select item'larda aynı koşul.
  const isDomainBlockedForNormal = (
    d: (typeof domains)[number],
  ): boolean => !isCatchAll && getCatchAll(d)?.enabled === true

  useEffect(() => {
    if (open) {
      setPrefix("")
      setPassword("")
      setErrors({})
      setIsCatchAll(false)
      setConfirmCatchAll(null)
    }
  }, [open])

  useEffect(() => {
    if (open && domains.length > 0 && !selectedDomainId) {
      // Default seçim: catch-all'lı OLMAYAN ilk domain. Hepsi catch-all'lıysa
      // ilk domain (kullanıcı isCatchAll'a geçince re-select edebilsin).
      const firstClean = domains.find((d) => !getCatchAll(d)?.enabled)
      setSelectedDomainId((firstClean ?? domains[0]).id)
    }
  }, [open, domains, selectedDomainId])

  // isCatchAll=false moduna geçildiğinde, seçili domain catch-all'lıysa
  // otomatik temiz bir domain'e taşı — disabled select item'a takılı
  // kalmasın, "create" butonu hep enable kalsın.
  useEffect(() => {
    if (!isCatchAll && selectedDomain && getCatchAll(selectedDomain)?.enabled) {
      const firstClean = domains.find((d) => !getCatchAll(d)?.enabled)
      if (firstClean) setSelectedDomainId(firstClean.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCatchAll])

  function validate() {
    const newErrors: typeof errors = {}
    if (!prefix.trim()) {
      newErrors.prefix = t("email") + " is required"
    }
    if (!selectedDomainId) {
      newErrors.domain = t("domain") + " is required"
    }
    if (!password || password.length < 8) {
      newErrors.password = t("password") + " min 8 chars"
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function submitCatchAll(confirmDelete: boolean) {
    setSubmitting(true)
    try {
      const email = `${prefix.trim()}@${selectedDomain?.name}`
      const res = await fetch(
        `/api/companies/${slug}/mailboxes/catch-all`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domainId: selectedDomainId,
            targetMailboxEmail: email,
            password,
            confirmDeleteOthers: confirmDelete,
          }),
        },
      )
      const json = await res.json()
      // 409 + conflictingMailboxes → kullanıcıya uyarı dialog'u
      if (res.status === 409 && json.conflictingMailboxes) {
        setConfirmCatchAll({ conflicting: json.conflictingMailboxes })
        return
      }
      if (!res.ok) {
        throw new Error(json.error || "Failed to enable catch-all")
      }
      toast.success(t("catchAllEnabled"))
      onOpenChange(false)
      onCreated()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to enable catch-all"
      toast.error(message)
    } finally {
      setSubmitting(false)
      setConfirmingDelete(false)
    }
  }

  async function handleSubmit() {
    if (!validate()) return
    if (isCatchAll) {
      await submitCatchAll(false)
      return
    }
    setSubmitting(true)
    try {
      const email = `${prefix.trim()}@${selectedDomain?.name}`
      const res = await fetch(`/api/companies/${slug}/mailboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          domainId: selectedDomainId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to create mailbox")
      }
      // Account sync sonucu — user yarat + member ekle akışı best-effort.
      // existingUser true: aynı email zaten Sentroy hesabı, password
      //   ezilmedi (mevcut user'ın güvenliği). UI'da uyarı.
      // ok false: sentroy mail-server'da mailbox var ama auth tarafında
      //   user/permission senkronu fail oldu — admin manuel düzeltebilir.
      const sync = json.data?.accountSync as
        | { ok: boolean; existingUser: boolean; error?: string }
        | undefined
      if (sync?.existingUser) {
        toast.success(t("mailboxCreatedExistingUser", { email }))
      } else if (sync && !sync.ok) {
        toast.warning(
          t("mailboxCreatedSyncFailed", {
            email,
            reason: sync.error ?? "unknown",
          }),
        )
      } else {
        toast.success(t("mailboxCreated"))
      }
      onOpenChange(false)
      onCreated()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create mailbox"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createMailbox")}</DialogTitle>
          <DialogDescription>{t("emptyDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>{t("email")}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                placeholder="info"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                disabled={submitting}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>@</InputGroupText>
                {domainsLoading ? (
                  <span className="text-sm text-muted-foreground">...</span>
                ) : domains.length > 0 ? (
                  <Select
                    value={selectedDomainId}
                    onValueChange={setSelectedDomainId}
                  >
                    <SelectTrigger className="h-7 border-0 bg-transparent px-1 text-sm">
                      <span className="truncate">
                        {selectedDomain?.name || t("domain")}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map((d) => {
                        const catchAll = getCatchAll(d)
                        const blocked = isDomainBlockedForNormal(d)
                        return (
                          <SelectItem
                            key={d.id}
                            value={d.id}
                            label={d.name}
                            disabled={blocked}
                          >
                            <span className="flex items-center gap-1.5">
                              <span>{d.name}</span>
                              {catchAll?.enabled ? (
                                <span className="text-[10px] text-muted-foreground">
                                  · {t("catchAllLabelShort")}
                                </span>
                              ) : null}
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t("emptyTitle")}
                  </span>
                )}
              </InputGroupAddon>
            </InputGroup>
            {errors.prefix && <FieldError>{errors.prefix}</FieldError>}
            {errors.domain && <FieldError>{errors.domain}</FieldError>}
          </Field>

          <Field>
            <FieldLabel>{t("password")}</FieldLabel>
            <Input
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit()
              }}
            />
            {errors.password && <FieldError>{errors.password}</FieldError>}
          </Field>

          {/* Account info — bu mailbox aynı zamanda Sentroy hesabı yaratır.
               Aynı email zaten kayıtlıysa password ezilmez, sadece member
               eklenir; UI toast'ta uyarı verilir (mailboxCreatedExistingUser). */}
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-900 dark:text-blue-200">
            {t("createAccountInfo")}
          </div>

          {/* ── Catch-all toggle ─────────────────────────────────────── */}
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={isCatchAll}
                onCheckedChange={(c) => setIsCatchAll(c === true)}
                disabled={submitting}
                className="mt-0.5"
              />
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium leading-tight">
                  {t("catchAllToggle")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("catchAllDescription", {
                    domain: selectedDomain?.name ?? "domain",
                  })}
                </span>
              </div>
              <HugeiconsIcon
                icon={Mail01Icon}
                strokeWidth={2}
                className="size-4 shrink-0 text-muted-foreground/60"
              />
            </label>

            {isCatchAll && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  strokeWidth={2}
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>{t("catchAllWarning")}</span>
              </div>
            )}

            {existingCatchAll?.enabled && !isCatchAll && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  strokeWidth={2}
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span>
                  {t("catchAllExistingWarning", {
                    target: existingCatchAll.targetMailboxEmail,
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || domains.length === 0}
          >
            {submitting && (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="animate-spin"
                data-icon="inline-start"
              />
            )}
            {isCatchAll ? t("enableCatchAll") : t("createMailbox")}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* ── Confirm: existing mailboxes will be deleted ─────────────────── */}
      <Dialog
        open={confirmCatchAll !== null}
        onOpenChange={(o) => {
          if (!o && !confirmingDelete) setConfirmCatchAll(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="size-5"
              />
              {t("catchAllConfirmTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("catchAllConfirmDescription", {
                count: confirmCatchAll?.conflicting.length ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          {confirmCatchAll && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {confirmCatchAll.conflicting.map((email) => (
                <li key={email} className="text-foreground/80">
                  • {email}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmCatchAll(null)}
              disabled={confirmingDelete}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setConfirmingDelete(true)
                setConfirmCatchAll(null)
                await submitCatchAll(true)
              }}
              disabled={confirmingDelete}
            >
              {confirmingDelete && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("catchAllConfirmCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

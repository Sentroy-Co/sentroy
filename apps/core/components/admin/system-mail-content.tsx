"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlusSignIcon,
  Delete02Icon,
  RefreshIcon,
  CheckmarkCircle02Icon,
  Alert01Icon,
  Loading03Icon,
  CopyIcon,
  Tick02Icon,
  Building03Icon,
  UserSwitchIcon,
  Mail01Icon,
} from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { SystemMailTabs } from "@/components/admin/system-mail-tabs"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"

interface DomainAssignmentInfo {
  ownerCompanyId: string
  ownerCompanyName: string
  ownerCompanySlug: string
  assignedAt: string
}

interface DomainCatchAllInfo {
  targetMailboxEmail: string
  enabled: boolean
}

interface Domain {
  id: string
  domain: string
  status: string
  assignment: DomainAssignmentInfo | null
  catchAll: DomainCatchAllInfo | null
}

interface PickerCompany {
  id: string
  name: string
  slug: string
  hasSentroyKey: boolean
}

interface DnsRecord {
  type: string
  name: string
  value: string
  priority?: number | null
}

interface Settings {
  systemMailDomainId: string | null
  fromAddress: string
}

export function SystemMailContent() {
  const t = useTranslations("systemMail")
  const [domains, setDomains] = useState<Domain[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [dnsForId, setDnsForId] = useState<string | null>(null)
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([])
  const [dnsLoading, setDnsLoading] = useState(false)
  const [newDomain, setNewDomain] = useState("")
  const [fromAddress, setFromAddress] = useState("")
  const [assignDialogDomain, setAssignDialogDomain] = useState<Domain | null>(
    null,
  )
  const [pickerCompanies, setPickerCompanies] = useState<PickerCompany[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("")
  const [assigning, setAssigning] = useState(false)
  const [unassigningId, setUnassigningId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [domainsRes, settingsRes] = await Promise.all([
        fetch("/api/admin/system-mail/domains"),
        fetch("/api/admin/system-mail/settings"),
      ])
      const dJson = await domainsRes.json()
      const sJson = await settingsRes.json()
      if (domainsRes.ok) setDomains(dJson.data ?? [])
      if (settingsRes.ok) {
        setSettings(sJson.data)
        setFromAddress(sJson.data.fromAddress ?? "noreply")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function add() {
    if (!newDomain.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/admin/system-mail/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Add failed")
      toast.success(t("added"))
      setNewDomain("")
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setAdding(false)
    }
  }

  async function verify(d: Domain) {
    setVerifyingId(d.id)
    try {
      const res = await fetch(
        `/api/admin/system-mail/domains/${d.id}/verify`,
        { method: "POST" },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Verify failed")
      toast.success(t("verifyTriggered"))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setVerifyingId(null)
    }
  }

  async function remove(d: Domain) {
    if (!confirm(t("deleteConfirm", { domain: d.domain }))) return
    try {
      const res = await fetch(`/api/admin/system-mail/domains/${d.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      toast.success(t("deleted"))
      refresh()
    } catch {
      toast.error(t("deleteFailed"))
    }
  }

  async function setAsSystem(domainId: string) {
    try {
      const res = await fetch("/api/admin/system-mail/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemMailDomainId: domainId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setSettings(json.data)
      toast.success(t("setAsSystemDone"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  async function saveFromAddress() {
    try {
      const res = await fetch("/api/admin/system-mail/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAddress }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setSettings(json.data)
      toast.success(t("savedFromAddress"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  async function openAssignDialog(d: Domain) {
    setAssignDialogDomain(d)
    setSelectedCompanyId(d.assignment?.ownerCompanyId ?? "")
    setPickerLoading(true)
    try {
      const res = await fetch("/api/admin/system-mail/companies")
      const json = await res.json()
      if (res.ok) setPickerCompanies(json.data ?? [])
    } finally {
      setPickerLoading(false)
    }
  }

  async function confirmAssign() {
    if (!assignDialogDomain || !selectedCompanyId) return
    setAssigning(true)
    try {
      const res = await fetch(
        `/api/admin/system-mail/domains/${assignDialogDomain.id}/assign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerCompanyId: selectedCompanyId }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Assign failed")
      toast.success(t("assignSuccess"))
      setAssignDialogDomain(null)
      setSelectedCompanyId("")
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed")
    } finally {
      setAssigning(false)
    }
  }

  async function unassign(d: Domain) {
    if (!confirm(t("unassignConfirm", { domain: d.domain }))) return
    setUnassigningId(d.id)
    try {
      const res = await fetch(
        `/api/admin/system-mail/domains/${d.id}/assign`,
        { method: "DELETE" },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Unassign failed")
      toast.success(t("unassignSuccess"))
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unassign failed")
    } finally {
      setUnassigningId(null)
    }
  }

  async function openDns(d: Domain) {
    setDnsForId(d.id)
    setDnsLoading(true)
    setDnsRecords([])
    try {
      const res = await fetch(`/api/admin/system-mail/domains/${d.id}/dns`)
      const json = await res.json()
      if (res.ok) setDnsRecords(json.data ?? [])
    } finally {
      setDnsLoading(false)
    }
  }

  const activeDomain = settings?.systemMailDomainId
    ? domains.find((d) => d.id === settings.systemMailDomainId)
    : null

  return (
    <PageTransition className="flex flex-col gap-6">
      <SystemMailTabs />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      {/* ── From address card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("fromAddressTitle")}</CardTitle>
          <CardDescription>{t("fromAddressDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="flex flex-1 items-end gap-1">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs">{t("fromLocalPart")}</Label>
              <Input
                value={fromAddress}
                onChange={(e) => setFromAddress((e.target as HTMLInputElement).value)}
                placeholder="noreply"
                disabled={loading}
              />
            </div>
            <span className="pb-2.5 font-mono text-sm text-muted-foreground">
              @{activeDomain?.domain || t("noDomainSet")}
            </span>
          </div>
          <Button onClick={saveFromAddress} disabled={loading}>
            {t("save")}
          </Button>
        </CardContent>
      </Card>

      {/* ── Domains card ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("domainsTitle")}</CardTitle>
          <CardDescription>{t("domainsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label className="text-xs">{t("addDomain")}</Label>
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain((e.target as HTMLInputElement).value)}
                placeholder="mail.example.com"
                disabled={adding}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <Button onClick={add} disabled={adding || !newDomain.trim()}>
              {adding ? (
                <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} data-icon="inline-start" />
              )}
              {t("add")}
            </Button>
          </div>

          {loading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : domains.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {domains.map((d) => {
                const isActive = settings?.systemMailDomainId === d.id
                const isVerified = d.status === "active"
                return (
                  <div
                    key={d.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border p-3",
                      isActive && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium">
                            {d.domain}
                          </span>
                          {isActive && (
                            <Badge variant="outline" className="border-primary/40 text-[10px] uppercase tracking-wider text-primary">
                              {t("activeBadge")}
                            </Badge>
                          )}
                          {d.assignment && (
                            <Badge
                              variant="secondary"
                              className="gap-1 text-[10px] font-medium"
                            >
                              <HugeiconsIcon
                                icon={Building03Icon}
                                strokeWidth={2}
                                className="size-3"
                              />
                              {t("assignedTo", {
                                name: d.assignment.ownerCompanyName,
                              })}
                            </Badge>
                          )}
                          {d.catchAll?.enabled && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400"
                            >
                              <HugeiconsIcon
                                icon={Mail01Icon}
                                strokeWidth={2}
                                className="size-3"
                              />
                              {t("catchAllBadge", {
                                target: d.catchAll.targetMailboxEmail,
                              })}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                          <HugeiconsIcon
                            icon={isVerified ? CheckmarkCircle02Icon : Alert01Icon}
                            strokeWidth={2}
                            className={cn(
                              "size-3.5",
                              isVerified
                                ? "text-emerald-500"
                                : "text-amber-500",
                            )}
                          />
                          <span className="text-muted-foreground">
                            {t(`status.${isVerified ? "active" : "pending"}`)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openDns(d)}>
                        {t("dnsRecords")}
                      </Button>
                      {!isVerified && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => verify(d)}
                          disabled={verifyingId === d.id}
                        >
                          <HugeiconsIcon
                            icon={verifyingId === d.id ? Loading03Icon : RefreshIcon}
                            strokeWidth={2}
                            className={cn(
                              "size-3.5",
                              verifyingId === d.id && "animate-spin",
                            )}
                            data-icon="inline-start"
                          />
                          {t("verify")}
                        </Button>
                      )}
                      {isVerified && !isActive && (
                        <Button size="sm" onClick={() => setAsSystem(d.id)}>
                          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5" data-icon="inline-start" />
                          {t("useAsSystem")}
                        </Button>
                      )}
                      {/* Verify edilmiş domain için: assigned değilse "Assign",
                          assigned ise "Reassign" ve "Unassign". */}
                      {isVerified && !d.assignment && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssignDialog(d)}
                        >
                          <HugeiconsIcon
                            icon={UserSwitchIcon}
                            strokeWidth={2}
                            className="size-3.5"
                            data-icon="inline-start"
                          />
                          {t("assign")}
                        </Button>
                      )}
                      {isVerified && d.assignment && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAssignDialog(d)}
                          >
                            <HugeiconsIcon
                              icon={UserSwitchIcon}
                              strokeWidth={2}
                              className="size-3.5"
                              data-icon="inline-start"
                            />
                            {t("reassign")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => unassign(d)}
                            disabled={unassigningId === d.id}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            {unassigningId === d.id ? (
                              <HugeiconsIcon
                                icon={Loading03Icon}
                                strokeWidth={2}
                                className="size-3.5 animate-spin"
                                data-icon="inline-start"
                              />
                            ) : null}
                            {t("unassign")}
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(d)}>
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Assign dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={assignDialogDomain !== null}
        onOpenChange={(o) => {
          if (!o && !assigning) {
            setAssignDialogDomain(null)
            setSelectedCompanyId("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assignDialogTitle")}</DialogTitle>
            <DialogDescription>
              {assignDialogDomain
                ? t("assignDialogDesc", { domain: assignDialogDomain.domain })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Label className="text-xs">{t("selectCompany")}</Label>
            {pickerLoading ? (
              <Skeleton className="h-32 w-full rounded-lg" />
            ) : pickerCompanies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noCompaniesToAssign")}
              </p>
            ) : (
              <div className="flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
                {pickerCompanies.map((c) => {
                  const isSelected = selectedCompanyId === c.id
                  const isCurrent =
                    assignDialogDomain?.assignment?.ownerCompanyId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        c.hasSentroyKey && setSelectedCompanyId(c.id)
                      }
                      disabled={!c.hasSentroyKey}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                        isSelected &&
                          "border-primary/50 bg-primary/5 ring-1 ring-primary/30",
                        !c.hasSentroyKey &&
                          "cursor-not-allowed opacity-60",
                        c.hasSentroyKey &&
                          !isSelected &&
                          "hover:border-foreground/20 hover:bg-muted/30",
                      )}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          /d/{c.slug}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isCurrent && (
                          <Badge variant="outline" className="text-[10px]">
                            {t("currentOwner")}
                          </Badge>
                        )}
                        {!c.hasSentroyKey && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400"
                          >
                            {t("noApiKey")}
                          </Badge>
                        )}
                        {isSelected && (
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            strokeWidth={2}
                            className="size-4 text-primary"
                          />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignDialogDomain(null)
                setSelectedCompanyId("")
              }}
              disabled={assigning}
            >
              {t("close")}
            </Button>
            <Button
              onClick={confirmAssign}
              disabled={
                assigning ||
                !selectedCompanyId ||
                selectedCompanyId ===
                  assignDialogDomain?.assignment?.ownerCompanyId
              }
            >
              {assigning && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {assignDialogDomain?.assignment ? t("reassign") : t("assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DNS records dialog ────────────────────────────────────────── */}
      <Dialog open={dnsForId !== null} onOpenChange={(o) => !o && setDnsForId(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("dnsRecords")}</DialogTitle>
            <DialogDescription>{t("dnsHint")}</DialogDescription>
          </DialogHeader>
          {dnsLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : dnsRecords.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("noDnsRecords")}
            </p>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {dnsRecords.map((r, i) => (
                <DnsRow key={i} record={r} />
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDnsForId(null)}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

function DnsRow({ record }: { record: DnsRecord }) {
  const [copied, setCopied] = useState(false)
  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }
  return (
    <div className="rounded-lg border p-3 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {record.type}
        </Badge>
        {record.priority != null && (
          <span className="text-muted-foreground">priority {record.priority}</span>
        )}
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-muted-foreground">name</span>
          <code className="flex-1 truncate font-mono">{record.name}</code>
          <button onClick={() => copy(record.name)} className="text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={CopyIcon} strokeWidth={2} className="size-3.5" />
          </button>
        </div>
        <div className="flex items-start gap-2">
          <span className="w-12 shrink-0 pt-0.5 text-muted-foreground">value</span>
          <code className="flex-1 break-all font-mono">{record.value}</code>
          <button onClick={() => copy(record.value)} className="shrink-0 pt-0.5 text-muted-foreground hover:text-foreground">
            <HugeiconsIcon icon={copied ? CheckmarkCircle02Icon : CopyIcon} strokeWidth={2} className={cn("size-3.5", copied && "text-emerald-500")} />
          </button>
        </div>
      </div>
    </div>
  )
}

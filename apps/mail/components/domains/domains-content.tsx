"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useCompanyDataStore } from "@workspace/console/stores/company-data"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InternetIcon,
  PlusSignIcon,
  Tick02Icon,
  Cancel01Icon,
  Refresh01Icon,
  EyeIcon,
  Delete02Icon,
  Loading03Icon,
  ImageAdd01Icon,
  MoreHorizontalIcon,
  Copy01Icon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
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
import { DomainStatusBadge } from "@/components/domains/domain-status-badge"
import { DnsRecordsDialog } from "@/components/domains/dns-records-dialog"
import { DnsAutoconfigDialog } from "@/components/domains/dns-autoconfig-dialog"
import { BimiConfigDialog } from "@/components/domains/bimi-config-dialog"
import { confirm } from "@workspace/console/stores/confirm"
import { useMailTour } from "@/components/tour/mail-tour"

interface Domain {
  id: string
  name: string
  status: "pending" | "verifying" | "active" | "failed"
  spf: boolean
  dkim: boolean
  dmarc: boolean
}

interface DnsRecord {
  type: string
  name: string
  value: string
  priority?: number
}

function VerificationBadge({
  label,
  verified,
}: {
  label: string
  verified: boolean
}) {
  return (
    <Badge
      variant="outline"
      className={
        verified
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      }
    >
      <HugeiconsIcon
        icon={verified ? Tick02Icon : Cancel01Icon}
        strokeWidth={2}
      />
      {label}
    </Badge>
  )
}

function mapSdkDomain(raw: Record<string, unknown>): Domain {
  return {
    id: raw.id as string,
    name: raw.domain as string,
    status: raw.status as Domain["status"],
    spf: (raw.spfVerified as boolean) ?? false,
    dkim: (raw.dkimVerified as boolean) ?? false,
    dmarc: (raw.dmarcVerified as boolean) ?? false,
  }
}

export function DomainsContent() {
  const t = useTranslations("domains")
  const tTour = useTranslations("tour")
  const { startDomainTour } = useMailTour()
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]
  const fetchStoreDomains = useCompanyDataStore((s) => s.fetchDomains)

  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newDomain, setNewDomain] = useState("")
  const [addingDomain, setAddingDomain] = useState(false)
  const [dnsDialogOpen, setDnsDialogOpen] = useState(false)
  const [selectedDomainName, setSelectedDomainName] = useState("")
  const [selectedDomainForDns, setSelectedDomainForDns] = useState<Domain | null>(null)
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([])
  const [dnsLoading, setDnsLoading] = useState(false)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [autoconfigOpen, setAutoconfigOpen] = useState(false)
  const [autoconfigDomainId, setAutoconfigDomainId] = useState("")
  const [autoconfigDomainName, setAutoconfigDomainName] = useState("")
  const [bimiOpen, setBimiOpen] = useState(false)
  const [bimiDomain, setBimiDomain] = useState<Domain | null>(null)

  const apiBase = `/api/companies/${slug}/domains`

  const fetchDomains = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiBase)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load domains")
      }
      const list = (json.data as Record<string, unknown>[]) ?? []
      setDomains(list.map(mapSdkDomain))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load domains"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  // Store'u senkronize et (sidebar vs. güncel kalsın)
  function syncStore() {
    fetchStoreDomains(slug, true)
  }

  async function handleAddDomain() {
    if (!newDomain.trim()) return
    setAddingDomain(true)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to add domain")
      }
      const created = mapSdkDomain(json.data as Record<string, unknown>)
      setDomains((prev) => [...prev, created])
      syncStore()
      setNewDomain("")
      setShowAddDialog(false)
      toast.success(t("domainAdded"))
      // Open autoconfig dialog for the new domain
      setAutoconfigDomainId(created.id)
      setAutoconfigDomainName(created.name)
      setAutoconfigOpen(true)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add domain"
      toast.error(message)
    } finally {
      setAddingDomain(false)
    }
  }

  async function handleVerify(domain: Domain) {
    setVerifyingId(domain.id)
    try {
      const res = await fetch(`${apiBase}/${domain.id}/verify`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Verification failed")
      }
      const updated = mapSdkDomain(json.data as Record<string, unknown>)
      setDomains((prev) =>
        prev.map((d) => (d.id === domain.id ? updated : d)),
      )
      syncStore()
      toast.success(t("verificationStarted"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Verification failed"
      toast.error(message)
    } finally {
      setVerifyingId(null)
    }
  }

  async function handleViewDns(domain: Domain) {
    setSelectedDomainName(domain.name)
    setSelectedDomainForDns(domain)
    setDnsRecords([])
    setDnsDialogOpen(true)
    setDnsLoading(true)
    try {
      const res = await fetch(`${apiBase}/${domain.id}/dns`)
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to load DNS records")
      }
      setDnsRecords((json.data as DnsRecord[]) ?? [])
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load DNS records"
      toast.error(message)
    } finally {
      setDnsLoading(false)
    }
  }

  async function handleDelete(domain: Domain) {
    const ok = await confirm({
      title: t("confirmDeleteTitle"),
      description: t("confirmDeleteDesc", { name: domain.name }),
      confirmText: t("delete"),
      destructive: true,
    })
    if (!ok) return

    setDeletingId(domain.id)
    try {
      const res = await fetch(`${apiBase}/${domain.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete domain")
      }
      setDomains((prev) => prev.filter((d) => d.id !== domain.id))
      syncStore()
      toast.success(t("domainDeleted"))
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to delete domain"
      toast.error(message)
    } finally {
      setDeletingId(null)
    }
  }

  function handleCopyId(domain: Domain) {
    navigator.clipboard.writeText(domain.id)
    setCopiedId(domain.id)
    toast.success(t("idCopied"))
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
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
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={startDomainTour}
            title={tTour("restart")}
            aria-label={tTour("restart")}
          >
            <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} />
          </Button>
          <Button data-tour="add-domain" onClick={() => setShowAddDialog(true)}>
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("addDomain")}
          </Button>
        </div>
      </div>

      {domains.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={InternetIcon} strokeWidth={1.5} />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button onClick={() => setShowAddDialog(true)}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("addDomain")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("domainName")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>SPF</TableHead>
                <TableHead>DKIM</TableHead>
                <TableHead>DMARC</TableHead>
                <TableHead className="text-end">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((domain) => (
                <TableRow key={domain.id}>
                  <TableCell className="font-medium">
                    {domain.name}
                  </TableCell>
                  <TableCell>
                    <DomainStatusBadge status={domain.status} />
                  </TableCell>
                  <TableCell>
                    <VerificationBadge label="SPF" verified={domain.spf} />
                  </TableCell>
                  <TableCell>
                    <VerificationBadge label="DKIM" verified={domain.dkim} />
                  </TableCell>
                  <TableCell>
                    <VerificationBadge
                      label="DMARC"
                      verified={domain.dmarc}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={
                                deletingId === domain.id ||
                                verifyingId === domain.id
                              }
                            />
                          }
                        >
                          <HugeiconsIcon
                            icon={
                              deletingId === domain.id ||
                              verifyingId === domain.id
                                ? Loading03Icon
                                : MoreHorizontalIcon
                            }
                            strokeWidth={2}
                            className={
                              deletingId === domain.id ||
                              verifyingId === domain.id
                                ? "animate-spin"
                                : undefined
                            }
                          />
                          <span className="sr-only">{t("actions")}</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => handleVerify(domain)}
                          >
                            <HugeiconsIcon
                              icon={Refresh01Icon}
                              strokeWidth={2}
                              className="size-4"
                            />
                            {t("verify")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleViewDns(domain)}
                          >
                            <HugeiconsIcon
                              icon={EyeIcon}
                              strokeWidth={2}
                              className="size-4"
                            />
                            {t("viewDns")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setBimiDomain(domain)
                              setBimiOpen(true)
                            }}
                          >
                            <HugeiconsIcon
                              icon={ImageAdd01Icon}
                              strokeWidth={2}
                              className="size-4"
                            />
                            {t("bimi")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleCopyId(domain)}
                          >
                            <HugeiconsIcon
                              icon={
                                copiedId === domain.id
                                  ? Tick02Icon
                                  : Copy01Icon
                              }
                              strokeWidth={2}
                              className="size-4"
                            />
                            {t("copyId")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(domain)}
                            className="text-destructive focus:text-destructive"
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              strokeWidth={2}
                              className="size-4"
                            />
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Domain Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addDomain")}</DialogTitle>
            <DialogDescription>{t("emptyDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Input
              placeholder={t("domainPlaceholder")}
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddDomain()
              }}
              disabled={addingDomain}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={addingDomain}
            >
              {t("cancel")}
            </Button>
            <Button onClick={handleAddDomain} disabled={addingDomain}>
              {addingDomain && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("addDomain")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DNS Records Dialog */}
      <DnsRecordsDialog
        open={dnsDialogOpen}
        onOpenChange={setDnsDialogOpen}
        domain={selectedDomainName}
        domainId={selectedDomainForDns?.id}
        domainStatus={selectedDomainForDns?.status}
        records={dnsRecords}
        loading={dnsLoading}
        onAutoConfig={
          selectedDomainForDns
            ? () => {
                setAutoconfigDomainId(selectedDomainForDns.id)
                setAutoconfigDomainName(selectedDomainForDns.name)
                setAutoconfigOpen(true)
              }
            : undefined
        }
      />

      {/* DNS Auto-config Dialog */}
      <DnsAutoconfigDialog
        open={autoconfigOpen}
        onOpenChange={setAutoconfigOpen}
        domainId={autoconfigDomainId}
        domainName={autoconfigDomainName}
        onManual={() => {
          const domain = domains.find((d) => d.id === autoconfigDomainId)
          if (domain) handleViewDns(domain)
        }}
        onComplete={() => fetchDomains()}
      />

      {/* BIMI Config Dialog */}
      {bimiDomain && (
        <BimiConfigDialog
          open={bimiOpen}
          onOpenChange={setBimiOpen}
          domainId={bimiDomain.id}
          domainName={bimiDomain.name}
          domainStatus={bimiDomain.status}
          onUpdated={() => fetchDomains()}
        />
      )}
    </PageTransition>
  )
}

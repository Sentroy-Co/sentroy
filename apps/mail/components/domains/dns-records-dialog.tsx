"use client"

import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Copy01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "sonner"

interface DnsRecord {
  type: string
  name: string
  value: string
  priority?: number
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copied to clipboard"),
    () => toast.error("Failed to copy")
  )
}

function getPurpose(record: DnsRecord): string {
  if (record.type === "MX") return "Mail routing"
  if (record.type === "TXT" && record.value.startsWith("v=spf1")) return "SPF"
  if (record.type === "TXT" && record.value.startsWith("v=DKIM1"))
    return "DKIM"
  if (record.type === "CNAME" && record.name.includes("._domainkey"))
    return "DKIM"
  if (record.type === "TXT" && record.value.startsWith("v=DMARC1"))
    return "DMARC"
  if (record.name.startsWith("_dmarc.")) return "DMARC"
  return record.type
}

export function DnsRecordsDialog({
  open,
  onOpenChange,
  domain,
  domainId,
  domainStatus,
  records,
  loading,
  onAutoConfig,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domain: string
  domainId?: string
  domainStatus?: string
  records: DnsRecord[]
  loading: boolean
  onAutoConfig?: () => void
}) {
  const t = useTranslations("domains")
  const showAutoConfig = onAutoConfig && domainStatus && domainStatus !== "active"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dnsRecords")}</DialogTitle>
          <DialogDescription>{t("dnsDescription")}</DialogDescription>
        </DialogHeader>

        {showAutoConfig && (
          <Button variant="outline" className="w-full" onClick={() => { onOpenChange(false); onAutoConfig() }}>
            {t("autoConfigureDns")}
          </Button>
        )}

        <div className="flex flex-col gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))
          ) : records.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No DNS records found for {domain}
            </p>
          ) : (
            records.map((record, idx) => (
              <div
                key={`${record.type}-${record.name}-${idx}`}
                className="flex flex-col gap-1.5 rounded-2xl border border-border bg-muted/30 p-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {record.type}
                  </Badge>
                  <span className="text-xs font-medium text-muted-foreground">
                    {getPurpose(record)}
                  </span>
                  {record.priority != null && (
                    <span className="text-xs text-muted-foreground">
                      Priority: {record.priority}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Host
                    </span>
                    <div className="flex items-center gap-1">
                      <code className="max-w-[280px] truncate rounded-lg bg-muted px-1.5 py-0.5 text-xs">
                        {record.name}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => copyToClipboard(record.name)}
                      >
                        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Value
                    </span>
                    <div className="flex items-center gap-1">
                      <code className="max-w-[280px] truncate rounded-lg bg-muted px-1.5 py-0.5 text-xs">
                        {record.value}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => copyToClipboard(record.value)}
                      >
                        <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

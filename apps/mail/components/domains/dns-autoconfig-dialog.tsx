"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cursor01Icon,
  Settings05Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"

interface DomainConnectInfo {
  supported: boolean
  providerName?: string
  applyUrl?: string
  width?: number
  height?: number
  /** Discover route'undan dönen "neden supported değil" sebebi —
   *  diagnostic UI için. */
  reason?: string
  reasonHint?: string
}

export function DnsAutoconfigDialog({
  open,
  onOpenChange,
  domainId,
  domainName,
  onManual,
  onComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domainId: string
  domainName: string
  onManual: () => void
  onComplete: () => void
}) {
  const t = useTranslations("dnsAutoconfig")
  const tDc = useTranslations("domainConnect")
  const params = useParams<{ "company-slug": string }>()
  const slug = params["company-slug"]

  const [dcInfo, setDcInfo] = useState<DomainConnectInfo | null>(null)
  const [dcLoading, setDcLoading] = useState(true)
  const popupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Unmount'ta popup poll interval'ini mutlaka temizle (orphan timer onleme)
  useEffect(() => {
    return () => {
      if (popupTimerRef.current) {
        clearInterval(popupTimerRef.current)
        popupTimerRef.current = null
      }
    }
  }, [])

  const discoverDc = useCallback(async () => {
    if (!domainName || !domainId) return
    setDcLoading(true)
    try {
      const res = await fetch(
        `/api/companies/${slug}/domain-connect/discover?domain=${encodeURIComponent(domainName)}&domainId=${encodeURIComponent(domainId)}`,
      )
      const json = await res.json()
      if (res.ok && json.data) {
        setDcInfo(json.data)
      } else {
        setDcInfo({ supported: false })
      }
    } catch {
      setDcInfo({ supported: false })
    } finally {
      setDcLoading(false)
    }
  }, [slug, domainName, domainId])

  useEffect(() => {
    if (open) {
      setDcInfo(null)
      setDcLoading(true)
      discoverDc()
    }
  }, [open, discoverDc])

  function handleDomainConnect() {
    if (!dcInfo?.applyUrl) return
    const w = dcInfo.width || 600
    const h = dcInfo.height || 700
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2)
    const top = Math.round(window.screenY + (window.outerHeight - h) / 2)
    const popup = window.open(
      dcInfo.applyUrl,
      "domain-connect",
      `width=${w},height=${h},left=${left},top=${top}`,
    )
    if (!popup) {
      window.location.href = dcInfo.applyUrl
      return
    }
    // Onceki timer varsa temizle (dialog birden fazla kez acilirsa)
    if (popupTimerRef.current) clearInterval(popupTimerRef.current)
    popupTimerRef.current = setInterval(() => {
      if (popup.closed) {
        if (popupTimerRef.current) {
          clearInterval(popupTimerRef.current)
          popupTimerRef.current = null
        }
        onComplete()
        onOpenChange(false)
      }
    }, 500)
  }

  function handleManual() {
    onOpenChange(false)
    onManual()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { domain: domainName })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Domain Connect */}
          {dcLoading ? (
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <Skeleton className="size-5 rounded" />
              <div className="flex-1">
                <Skeleton className="mb-1 h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ) : dcInfo?.supported ? (
            <button
              type="button"
              onClick={handleDomainConnect}
              className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
            >
              <HugeiconsIcon
                icon={Cursor01Icon}
                strokeWidth={2}
                className="size-5 shrink-0 text-primary"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{tDc("title")}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {tDc("recommended")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tDc("description", {
                    providerName: dcInfo.providerName || "",
                  })}
                </p>
              </div>
            </button>
          ) : dcInfo?.reasonHint ? (
            // Auto-config butonu çıkmadığında neden çıkmadığını user'a
            // göster — boş alan + manual fallback yerine net sebep daha
            // diagnostic. Server-side console.warn ile birlikte çalışır.
            <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {tDc("title")}:
              </span>{" "}
              {dcInfo.reasonHint}
            </div>
          ) : null}

          {/* Manual */}
          <button
            type="button"
            onClick={handleManual}
            className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50"
          >
            <HugeiconsIcon
              icon={Settings05Icon}
              strokeWidth={2}
              className="size-5 shrink-0 text-muted-foreground"
            />
            <div>
              <p className="font-medium">{t("manualSetup")}</p>
              <p className="text-xs text-muted-foreground">
                {t("manualSetupDesc")}
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

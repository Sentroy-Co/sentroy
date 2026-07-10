"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { ShoppingBag01Icon, Alert02Icon, Loading03Icon } from "@hugeicons/core-free-icons"
import { PageTransition } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

type ProductMap = Record<string, string>

export function SystemProductsContent() {
  const t = useTranslations("admin")
  const [amounts, setAmounts] = useState<number[]>([])
  const [sandbox, setSandbox] = useState<ProductMap>({})
  const [production, setProduction] = useState<ProductMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/billing/system-products")
      const json = await res.json()
      const d = json?.data
      setAmounts((d?.amounts as number[]) ?? [])
      setSandbox((d?.sandbox as ProductMap) ?? {})
      setProduction((d?.production as ProductMap) ?? {})
    } catch {
      toast.error(t("systemProductsPage.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    try {
      for (const [mode, products] of [
        ["sandbox", sandbox],
        ["production", production],
      ] as const) {
        const res = await fetch("/api/admin/billing/system-products", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode, products }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => null)
          toast.error(j?.error ?? t("systemProductsPage.saveFailed"))
          return
        }
      }
      toast.success(t("systemProductsPage.saved"))
    } catch {
      toast.error(t("systemProductsPage.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const setId = (mode: "sandbox" | "production", key: string, value: string) => {
    const setter = mode === "sandbox" ? setSandbox : setProduction
    setter((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <HugeiconsIcon icon={ShoppingBag01Icon} className="size-5" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{t("systemProductsPage.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("systemProductsPage.subtitle")}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-amber-500" strokeWidth={2} />
          <p>{t("systemProductsPage.hint")}</p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">{t("systemProductsPage.amount")}</TableHead>
                    <TableHead>{t("systemProductsPage.sandboxId")}</TableHead>
                    <TableHead>{t("systemProductsPage.productionId")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {amounts.map((amount) => {
                    const key = String(amount)
                    return (
                      <TableRow key={key}>
                        <TableCell className="font-semibold">${amount}</TableCell>
                        <TableCell>
                          <Input
                            value={sandbox[key] ?? ""}
                            onChange={(e) => setId("sandbox", key, e.target.value)}
                            placeholder={t("systemProductsPage.placeholder")}
                            className="font-mono text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={production[key] ?? ""}
                            onChange={(e) => setId("production", key, e.target.value)}
                            placeholder={t("systemProductsPage.placeholder")}
                            className="font-mono text-xs"
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? (
                  <HugeiconsIcon icon={Loading03Icon} className="animate-spin" strokeWidth={2} data-icon="inline-start" />
                ) : null}
                {t("systemProductsPage.save")}
              </Button>
            </div>

            <Label className="block text-xs font-normal text-muted-foreground">
              {t("systemProductsPage.usage")}
            </Label>
          </>
        )}
      </div>
    </PageTransition>
  )
}

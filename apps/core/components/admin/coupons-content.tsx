"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Coupon03Icon,
  PlusSignIcon,
  PencilEdit02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"

import { PageTransition, EmptyState } from "@workspace/console/components/shared"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
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

interface Coupon {
  id: string
  code: string
  discountPercent: number
  maxUses: number
  usedCount: number
  validUntil: string
  applicablePlanIds: string[]
  isActive: boolean
  createdAt: string
}

interface Plan {
  id: string
  name: Record<string, string>
}

export function CouponsContent() {
  const t = useTranslations("admin")
  const tc = useTranslations("common")

  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null)
  const [form, setForm] = useState({
    code: "",
    discountPercent: 10,
    maxUses: 100,
    validUntil: "",
    applicablePlanIds: "",
    isActive: true,
  })
  const [saving, setSaving] = useState(false)

  const fetchCoupons = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/coupons")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load coupons")
      setCoupons(json.data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load coupons"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/plans")
      const json = await res.json()
      if (res.ok) setPlans(json.data)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchCoupons()
    fetchPlans()
  }, [fetchCoupons, fetchPlans])

  function openCreateDialog() {
    setEditingCoupon(null)
    setForm({
      code: "",
      discountPercent: 10,
      maxUses: 100,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      applicablePlanIds: "",
      isActive: true,
    })
    setDialogOpen(true)
  }

  function openEditDialog(coupon: Coupon) {
    setEditingCoupon(coupon)
    setForm({
      code: coupon.code,
      discountPercent: coupon.discountPercent,
      maxUses: coupon.maxUses,
      validUntil: coupon.validUntil ? new Date(coupon.validUntil).toISOString().split("T")[0] : "",
      applicablePlanIds: (coupon.applicablePlanIds ?? []).join(", "),
      isActive: coupon.isActive,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      code: form.code,
      discountPercent: form.discountPercent,
      maxUses: form.maxUses,
      validUntil: form.validUntil || undefined,
      applicablePlanIds: form.applicablePlanIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      isActive: form.isActive,
    }

    try {
      if (editingCoupon) {
        const res = await fetch(`/api/admin/coupons/${editingCoupon.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to update coupon")

        setCoupons((prev) =>
          prev.map((c) => (c.id === editingCoupon.id ? json.data : c)),
        )
        toast.success(t("couponUpdated"))
      } else {
        const res = await fetch("/api/admin/coupons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to create coupon")

        setCoupons((prev) => [json.data, ...prev])
        toast.success(t("couponCreated"))
      }
      setDialogOpen(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save coupon"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(coupon: Coupon) {
    try {
      if (coupon.isActive) {
        const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
          method: "DELETE",
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to deactivate coupon")
        setCoupons((prev) =>
          prev.map((c) => (c.id === coupon.id ? { ...c, isActive: false } : c)),
        )
      } else {
        const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to activate coupon")
        setCoupons((prev) =>
          prev.map((c) => (c.id === coupon.id ? { ...c, isActive: true } : c)),
        )
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to toggle coupon"
      toast.error(message)
    }
  }

  function getPlanName(planId: string): string {
    const plan = plans.find((p) => p.id === planId)
    return plan?.name?.en ?? planId
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
        <h1 className="text-2xl font-bold">{t("coupons")}</h1>
        <Button onClick={openCreateDialog}>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("createCoupon")}
        </Button>
      </div>

      {coupons.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={Coupon03Icon} strokeWidth={1.5} />}
            title={tc("noResults")}
            description=""
            action={
              <Button onClick={openCreateDialog}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("createCoupon")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("discount")}</TableHead>
                <TableHead>{t("usage")}</TableHead>
                <TableHead>{t("validUntil")}</TableHead>
                <TableHead>{t("plans")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-end">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell className="font-mono font-medium">
                    {coupon.code}
                  </TableCell>
                  <TableCell>{coupon.discountPercent}%</TableCell>
                  <TableCell>
                    {coupon.usedCount} / {coupon.maxUses}
                  </TableCell>
                  <TableCell>
                    {coupon.validUntil
                      ? new Date(coupon.validUntil).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(coupon.applicablePlanIds ?? []).length === 0
                        ? t("allPlans")
                        : coupon.applicablePlanIds.map((pid) => (
                            <Badge key={pid} variant="outline" className="text-xs">
                              {getPlanName(pid)}
                            </Badge>
                          ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={coupon.isActive}
                      onCheckedChange={() => toggleActive(coupon)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditDialog(coupon)}
                      >
                        <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                        <span className="sr-only">{t("editCoupon")}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Coupon Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCoupon ? t("editCoupon") : t("createCoupon")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("code")}</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={!!editingCoupon}
                placeholder="SUMMER2024"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{t("discountPercent")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.discountPercent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discountPercent: parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("maxUses")}</Label>
                <Input
                  type="number"
                  value={form.maxUses}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxUses: parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("validUntil")}</Label>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("applicablePlanIds")}</Label>
              <Input
                value={form.applicablePlanIds}
                onChange={(e) => setForm((f) => ({ ...f, applicablePlanIds: e.target.value }))}
                placeholder={t("applicablePlanIdsPlaceholder")}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
              <Label>{t("active")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              {tc("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  )
}

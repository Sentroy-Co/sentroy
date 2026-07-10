"use client"

import { useState, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CreditCardIcon,
  PlusSignIcon,
  PencilEdit02Icon,
  Loading03Icon,
  Tick02Icon,
  Cancel01Icon,
  Delete02Icon,
  DashboardSquare01Icon,
  ChartBarLineIcon,
} from "@hugeicons/core-free-icons"

import {
  PageTransition,
  EmptyState,
  LocalizedField,
} from "@workspace/console/components/shared"
import { t as resolveLocale } from "@workspace/console/lib/locale"
import type { Plan, LocalizedString } from "@workspace/db/types"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"
import { BytesInput } from "@workspace/ui/components/bytes-input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { Switch } from "@workspace/ui/components/switch"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

type PolarEnvForm = { monthlyProductId: string; yearlyProductId: string }

type PlanForm = {
  name: LocalizedString
  description: LocalizedString
  maxCompanies: number
  maxDomainsPerCompany: number
  maxMembersPerCompany: number
  maxMailboxesPerCompany: number
  maxContacts: number
  storageLimit: number
  trashRetentionDays: number
  monthlyEmailLimit: number
  features: LocalizedString[]
  price: number
  yearlyPrice: number
  polar: { sandbox: PolarEnvForm; production: PolarEnvForm }
  isDefault: boolean
  isActive: boolean
}

function makeEmptyForm(): PlanForm {
  return {
    name: { en: "", tr: "" },
    description: { en: "", tr: "" },
    maxCompanies: 1,
    maxDomainsPerCompany: 1,
    maxMembersPerCompany: 5,
    maxMailboxesPerCompany: 5,
    maxContacts: 500,
    storageLimit: 1073741824,
    trashRetentionDays: 30,
    monthlyEmailLimit: 1000,
    features: [],
    price: 0,
    yearlyPrice: 0,
    polar: {
      sandbox: { monthlyProductId: "", yearlyProductId: "" },
      production: { monthlyProductId: "", yearlyProductId: "" },
    },
    isDefault: false,
    isActive: true,
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const POLAR_ENVS = ["sandbox", "production"] as const

type PlanTab = "general" | "limits" | "features" | "billing"

export function PlansContent() {
  const t = useTranslations("admin")
  const tc = useTranslations("common")

  // Dialog sol-rail navigasyonu. Burada paylaşılan vertical <Tabs>
  // kullanmıyoruz: o, `group/tabs[data-vertical]` ata olarak içteki
  // LocalizedField'ın (yatay) tab'larına da dikey stil sızdırıyordu.
  const NAV_TABS = [
    { key: "general", icon: DashboardSquare01Icon, label: t("tabGeneral") },
    { key: "limits", icon: ChartBarLineIcon, label: t("tabLimits") },
    { key: "features", icon: Tick02Icon, label: t("planFeatures") },
    { key: "billing", icon: CreditCardIcon, label: t("billing") },
  ] as const

  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [form, setForm] = useState<PlanForm>(makeEmptyForm())
  const [tab, setTab] = useState<PlanTab>("general")
  const [saving, setSaving] = useState(false)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/plans")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load plans")
      setPlans(json.data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load plans"
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  function openCreateDialog() {
    setEditingPlan(null)
    setForm(makeEmptyForm())
    setTab("general")
    setDialogOpen(true)
  }

  function openEditDialog(plan: Plan) {
    setEditingPlan(plan)
    setForm({
      name: { en: plan.name?.en || "", tr: plan.name?.tr || "" },
      description: { en: plan.description?.en || "", tr: plan.description?.tr || "" },
      maxCompanies: plan.maxCompanies,
      maxDomainsPerCompany: plan.maxDomainsPerCompany,
      maxMembersPerCompany: plan.maxMembersPerCompany,
      maxMailboxesPerCompany: plan.maxMailboxesPerCompany,
      maxContacts: plan.maxContacts,
      storageLimit: plan.storageLimit,
      trashRetentionDays: plan.trashRetentionDays,
      monthlyEmailLimit: plan.monthlyEmailLimit,
      features: (plan.features ?? []).map((f) => ({
        en: f?.en ?? "",
        tr: f?.tr ?? "",
      })),
      price: plan.price,
      yearlyPrice: plan.yearlyPrice ?? 0,
      polar: {
        sandbox: {
          monthlyProductId: plan.polar?.sandbox?.monthlyProductId ?? "",
          yearlyProductId: plan.polar?.sandbox?.yearlyProductId ?? "",
        },
        production: {
          monthlyProductId: plan.polar?.production?.monthlyProductId ?? "",
          yearlyProductId: plan.polar?.production?.yearlyProductId ?? "",
        },
      },
      isDefault: plan.isDefault,
      isActive: plan.isActive,
    })
    setTab("general")
    setDialogOpen(true)
  }

  function addFeature() {
    setForm((f) => ({ ...f, features: [...f.features, { en: "", tr: "" }] }))
  }

  function removeFeature(index: number) {
    setForm((f) => ({
      ...f,
      features: f.features.filter((_, i) => i !== index),
    }))
  }

  function updatePolar(
    env: (typeof POLAR_ENVS)[number],
    key: keyof PolarEnvForm,
    value: string,
  ) {
    setForm((f) => ({
      ...f,
      polar: { ...f.polar, [env]: { ...f.polar[env], [key]: value.trim() } },
    }))
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      ...form,
      yearlyPrice: form.yearlyPrice > 0 ? form.yearlyPrice : undefined,
      features: form.features
        .map((f) => ({ en: (f.en ?? "").trim(), tr: (f.tr ?? "").trim() }))
        .filter((f) => f.en || f.tr),
    }

    try {
      if (editingPlan) {
        const res = await fetch(`/api/admin/plans/${editingPlan.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to update plan")

        setPlans((prev) =>
          prev.map((p) => (p.id === editingPlan.id ? json.data : p)),
        )
        toast.success(t("planUpdated"))
      } else {
        const res = await fetch("/api/admin/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to create plan")

        setPlans((prev) => [json.data, ...prev])
        toast.success(t("planCreated"))
      }
      setDialogOpen(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save plan"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(plan: Plan) {
    try {
      if (plan.isActive) {
        const res = await fetch(`/api/admin/plans/${plan.id}`, {
          method: "DELETE",
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to deactivate plan")
        setPlans((prev) =>
          prev.map((p) => (p.id === plan.id ? { ...p, isActive: false } : p)),
        )
      } else {
        const res = await fetch(`/api/admin/plans/${plan.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to activate plan")
        setPlans((prev) =>
          prev.map((p) => (p.id === plan.id ? { ...p, isActive: true } : p)),
        )
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to toggle plan"
      toast.error(message)
    }
  }

  if (loading) {
    return (
      <PageTransition className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("plans")}</h1>
        <Button onClick={openCreateDialog}>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t("createPlan")}
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<HugeiconsIcon icon={CreditCardIcon} strokeWidth={1.5} />}
            title={tc("noResults")}
            description=""
            action={
              <Button onClick={openCreateDialog}>
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("createPlan")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.isActive ? "opacity-60" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {resolveLocale(plan.name) || t("untitled")}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {plan.isDefault && <Badge>{t("default")}</Badge>}
                    <Badge
                      variant="outline"
                      className={
                        plan.isActive
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-destructive/30 bg-destructive/10 text-destructive"
                      }
                    >
                      <HugeiconsIcon
                        icon={plan.isActive ? Tick02Icon : Cancel01Icon}
                        strokeWidth={2}
                      />
                      {plan.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  {resolveLocale(plan.description)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("price")}</span>
                    <span className="font-medium">
                      ${plan.price}
                      {plan.yearlyPrice ? ` / $${plan.yearlyPrice}` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("maxCompanies")}</span>
                    <span>{plan.maxCompanies}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("maxDomains")}</span>
                    <span>{plan.maxDomainsPerCompany}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("maxMembers")}</span>
                    <span>{plan.maxMembersPerCompany}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("maxMailboxes")}</span>
                    <span>{plan.maxMailboxesPerCompany}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("contacts")}</span>
                    <span>{plan.maxContacts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("storage")}</span>
                    <span>{formatBytes(plan.storageLimit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("monthlyEmails")}</span>
                    <span>{plan.monthlyEmailLimit}</span>
                  </div>
                  {plan.features && plan.features.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {plan.features.map((f, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {resolveLocale(f)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <Switch
                    checked={plan.isActive}
                    onCheckedChange={() => toggleActive(plan)}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEditDialog(plan)}
                  >
                    <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
                    <span className="sr-only">{t("editPlan")}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Plan Dialog — sol tab / sağ içerik düzeni */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? t("editPlan") : t("createPlan")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 gap-4">
            <div className="flex w-40 shrink-0 flex-col gap-1 self-start">
              {NAV_TABS.map((nt) => (
                <button
                  key={nt.key}
                  type="button"
                  onClick={() => setTab(nt.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === nt.key
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={nt.icon}
                    strokeWidth={2}
                    className="size-4 shrink-0"
                  />
                  {nt.label}
                </button>
              ))}
            </div>

            {/* Sabit yükseklik — tab'lar arası geçişte modal boyutu sabit kalır. */}
            <div className="h-[55vh] min-h-0 flex-1 overflow-y-auto pe-1">
              {/* Genel — isim, açıklama, fiyat, durum */}
              {tab === "general" && (
                <div className="flex flex-col gap-4">
                <LocalizedField<"name" | "description">
                  fields={[
                    { name: "name", label: t("name") },
                    {
                      name: "description",
                      label: t("planDescription"),
                      multiline: true,
                      rows: 3,
                    },
                  ]}
                  value={{ name: form.name, description: form.description }}
                  onChange={(v: {
                    name: LocalizedString
                    description: LocalizedString
                  }) =>
                    setForm((f) => ({
                      ...f,
                      name: v.name,
                      description: v.description,
                    }))
                  }
                />
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>{t("priceMonthly")} ($)</Label>
                    <Input
                      type="number"
                      value={form.price}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          price: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>{t("priceYearly")} ($)</Label>
                    <Input
                      type="number"
                      value={form.yearlyPrice}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          yearlyPrice: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.isDefault}
                      onCheckedChange={(checked) =>
                        setForm((f) => ({ ...f, isDefault: checked }))
                      }
                    />
                    <Label>{t("defaultPlan")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(checked) =>
                        setForm((f) => ({ ...f, isActive: checked }))
                      }
                    />
                    <Label>{t("active")}</Label>
                  </div>
                </div>
                </div>
              )}

              {/* Limitler — sayısal kotalar */}
              {tab === "limits" && (
                <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t("maxCompanies")}</Label>
                  <Input
                    type="number"
                    value={form.maxCompanies}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxCompanies: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("maxDomainsPerCompany")}</Label>
                  <Input
                    type="number"
                    value={form.maxDomainsPerCompany}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxDomainsPerCompany: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("maxMembersPerCompany")}</Label>
                  <Input
                    type="number"
                    value={form.maxMembersPerCompany}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxMembersPerCompany: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("maxMailboxesPerCompany")}</Label>
                  <Input
                    type="number"
                    value={form.maxMailboxesPerCompany}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxMailboxesPerCompany: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("maxContacts")}</Label>
                  <Input
                    type="number"
                    value={form.maxContacts}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        maxContacts: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("storageLimitBytes")}</Label>
                  <BytesInput
                    value={form.storageLimit}
                    onChange={(bytes) =>
                      setForm((f) => ({ ...f, storageLimit: bytes }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("trashRetentionDays")}</Label>
                  <Input
                    type="number"
                    value={form.trashRetentionDays}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        trashRetentionDays: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>{t("monthlyEmailLimit")}</Label>
                  <Input
                    type="number"
                    value={form.monthlyEmailLimit}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        monthlyEmailLimit: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                </div>
              )}

              {/* Özellikler — çok dilli liste */}
              {tab === "features" && (
                <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label>{t("planFeatures")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addFeature}
                  >
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    {t("addFeature")}
                  </Button>
                </div>
                {form.features.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("noFeaturesYet")}
                  </p>
                ) : (
                  form.features.map((feat, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg border p-3"
                    >
                      <div className="flex-1">
                        <LocalizedField
                          label={`${t("featureLabel")} ${i + 1}`}
                          value={feat}
                          onChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              features: f.features.map((x, j) =>
                                j === i ? v : x,
                              ),
                            }))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="mt-6"
                        onClick={() => removeFeature(i)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                        <span className="sr-only">{t("removeFeature")}</span>
                      </Button>
                    </div>
                  ))
                )}
                </div>
              )}

              {/* Faturalama — Polar product eşlemesi */}
              {tab === "billing" && (
                <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <Label>{t("polarMappingTitle")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("polarMappingHint")}
                  </p>
                </div>
                {POLAR_ENVS.map((env) => (
                  <div
                    key={env}
                    className="flex flex-col gap-2 rounded-lg border p-3"
                  >
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {env === "sandbox"
                        ? t("polarSandbox")
                        : t("polarProduction")}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">
                          {t("polarMonthlyProductId")}
                        </Label>
                        <Input
                          value={form.polar[env].monthlyProductId}
                          onChange={(e) =>
                            updatePolar(env, "monthlyProductId", e.target.value)
                          }
                          placeholder="prod_…"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">
                          {t("polarYearlyProductId")}
                        </Label>
                        <Input
                          value={form.polar[env].yearlyProductId}
                          onChange={(e) =>
                            updatePolar(env, "yearlyProductId", e.target.value)
                          }
                          placeholder="prod_…"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              )}
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

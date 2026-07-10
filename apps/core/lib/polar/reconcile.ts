import { companyModel, planModel, userToolEntitlementModel, sentroyAppModel, appInstallModel, systemPurchaseModel } from "@workspace/db/models"
import type { CompanySubscription, Plan } from "@workspace/db/types"
import { findPack } from "@workspace/console/lib/tool-packs"
import type { PolarMode } from "./client"

/**
 * Polar abonelik state'ini Sentroy company'sine yansıtan reconcile katmanı.
 *
 * - Plan ↔ product eşlemesi plan.polar[mode] üzerinden (her interval ayrı).
 * - Company, Polar customer'ın `external_customer_id`'sinden (= company.id),
 *   metadata.companyId'den ya da kayıtlı polarCustomerId'den bulunur.
 * - Limit enforcement denormalize (company.max*); plan değişince `applyPlan`
 *   ile yeniden kopyalanır, revoke'da default(Free) plana düşülür.
 */

type ReconcileIntent = "apply" | "keep" | "downgrade"
type BillingInterval = "month" | "year"

/**
 * Polar webhook payload'larındaki subscription objesinin gevşek görünümü.
 *
 * ⚠️ Hem camelCase HEM snake_case alanları kabul ederiz: SDK `validateEvent`
 * başarılı parse'ta camelCase döner, ama eski SDK / yeni Polar payload'unda
 * parse patlayınca webhook route ham `JSON.parse(body)` (snake_case) verisine
 * düşer. Tek bir tarafı okumak (eski hali) update/cancel'da bitiş tarihi +
 * cancelAtPeriodEnd alanlarının sessizce kaybolmasına yol açıyordu.
 */
interface RawSubscription {
  id?: string
  status?: string
  productId?: string
  product_id?: string
  product?: { id?: string }
  customerId?: string
  customer_id?: string
  customer?: { id?: string; externalId?: string | null; external_id?: string | null }
  metadata?: Record<string, unknown> | null
  currentPeriodEnd?: string | Date | null
  current_period_end?: string | Date | null
  endsAt?: string | Date | null
  ends_at?: string | Date | null
  cancelAtPeriodEnd?: boolean | null
  cancel_at_period_end?: boolean | null
  recurringInterval?: string | null
  recurring_interval?: string | null
}

/** camel/snake ne gelirse oku — webhook payload'u iki formatta da gelebilir. */
function rawProductId(r: RawSubscription): string | undefined {
  return r.product?.id ?? r.productId ?? r.product_id ?? undefined
}
function rawCustomerId(r: RawSubscription): string | undefined {
  return r.customer?.id ?? r.customerId ?? r.customer_id ?? undefined
}
function rawPeriodEnd(r: RawSubscription): string | Date | null | undefined {
  return (
    r.currentPeriodEnd ?? r.current_period_end ?? r.endsAt ?? r.ends_at ?? null
  )
}
function rawCancelAtPeriodEnd(r: RawSubscription): boolean {
  return !!(r.cancelAtPeriodEnd ?? r.cancel_at_period_end)
}
function rawInterval(r: RawSubscription): string | null | undefined {
  return r.recurringInterval ?? r.recurring_interval
}

/** Aktif ortam + interval için bir planın Polar product ID'sini çöz. */
export function resolvePlanProduct(
  plan: Plan,
  mode: PolarMode,
  interval: BillingInterval,
): string | null {
  const map = plan.polar?.[mode]
  if (!map) return null
  return (interval === "year" ? map.yearlyProductId : map.monthlyProductId) ?? null
}

/** Bir Polar product ID'sinden plan + interval bul (reverse lookup). */
export async function findPlanByProduct(
  productId: string,
  mode: PolarMode,
): Promise<{ plan: Plan; interval: BillingInterval } | null> {
  const plans = await planModel.findActive()
  for (const plan of plans) {
    const map = plan.polar?.[mode]
    if (!map) continue
    if (map.monthlyProductId && map.monthlyProductId === productId) {
      return { plan, interval: "month" }
    }
    if (map.yearlyProductId && map.yearlyProductId === productId) {
      return { plan, interval: "year" }
    }
  }
  return null
}

function mapStatus(status: string | undefined): CompanySubscription["status"] {
  switch (status) {
    case "active":
      return "active"
    case "trialing":
      return "trialing"
    case "past_due":
      return "past_due"
    case "unpaid":
      return "unpaid"
    case "canceled":
      return "canceled"
    case "incomplete":
    case "incomplete_expired":
      return "incomplete"
    default:
      // Bilinmeyen/yeni Polar status'ü sessizce "active" yapma (fail-open
      // riski). Güvenli tarafa düş + logla → operatör görsün.
      if (status) {
        console.warn(`[polar] unknown subscription status: ${status}`)
      }
      return "incomplete"
  }
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function extractCompanyId(raw: RawSubscription): string | null {
  const ext = raw.customer?.externalId ?? raw.customer?.external_id
  if (typeof ext === "string" && ext) return ext
  const metaCompany = raw.metadata?.companyId ?? raw.metadata?.company_id
  if (typeof metaCompany === "string" && metaCompany) return metaCompany
  return null
}

/**
 * Bir Polar subscription'ı company'ye uygula. `intent`:
 *  - apply   → plan limitlerini bu plana yükselt (active/created/updated/uncanceled)
 *  - keep    → durum güncellenir, limitler korunur (canceled-deferred / past_due)
 *  - downgrade → default(Free) plan limitlerine düş (revoked/unpaid)
 */
async function reconcileSubscription(
  raw: RawSubscription,
  mode: PolarMode,
  intent: ReconcileIntent,
): Promise<{ companyId: string | null }> {
  if (!raw.id) return { companyId: null }

  const companyId = extractCompanyId(raw)
  let company = companyId ? await companyModel.findById(companyId) : null
  if (!company) {
    const cid = rawCustomerId(raw)
    if (cid) company = await companyModel.findByPolarCustomerId(cid)
  }
  if (!company) return { companyId: null }

  const polarCustomerId = rawCustomerId(raw)
  if (polarCustomerId && company.polarCustomerId !== polarCustomerId) {
    await companyModel.setPolarCustomerId(company.id, polarCustomerId)
  }

  const productId = rawProductId(raw)
  const match = productId ? await findPlanByProduct(productId, mode) : null
  // Eşleme görünürlüğü: apply event'inde product yoksa ya da hiçbir plana
  // map edilmemişse, planId/limitler eski kalır (sync bozulur). Sessiz
  // kalma — operatör product ID eşlemesini düzeltebilsin.
  if (intent === "apply") {
    if (!productId) {
      console.error(
        `[polar] subscription ${raw.id}: apply event with no productId — plan/limits unchanged for company ${company.id}`,
      )
    } else if (!match) {
      console.warn(
        `[polar] subscription ${raw.id}: product ${productId} not mapped to any plan (${mode}) — company ${company.id} keeps planId ${company.planId}. Map it in Admin → Plans → Billing.`,
      )
    }
  }
  const ri = rawInterval(raw)
  const interval: BillingInterval =
    ri === "year" || ri === "month" ? ri : (match?.interval ?? "month")

  const subscription: CompanySubscription = {
    polarSubscriptionId: raw.id,
    polarProductId: productId ?? "",
    planId: match?.plan.id ?? company.planId,
    interval,
    status: mapStatus(raw.status),
    currentPeriodEnd: toDate(rawPeriodEnd(raw)),
    cancelAtPeriodEnd: rawCancelAtPeriodEnd(raw),
    environment: mode,
    updatedAt: new Date(),
  }
  await companyModel.setSubscription(company.id, subscription)

  if (intent === "apply" && match?.plan) {
    await companyModel.applyPlan(company.id, match.plan)
  } else if (intent === "downgrade") {
    const def = await planModel.findDefault()
    if (def) await companyModel.applyPlan(company.id, def)
  }

  return { companyId: company.id }
}

/**
 * Doğrulanmış Polar webhook olayını işle. Event-type'a göre intent seçilir.
 * Bilinmeyen tipler no-op (ack). Dönen companyId audit/log içindir.
 */
export async function handlePolarEvent(
  event: { type: string; data: unknown },
  mode: PolarMode,
): Promise<{ companyId: string | null }> {
  const data = event.data as RawSubscription & {
    activeSubscriptions?: RawSubscription[]
    active_subscriptions?: RawSubscription[]
    externalId?: string | null
    external_id?: string | null
    id?: string
  }

  switch (event.type) {
    case "subscription.created":
    case "subscription.active":
    case "subscription.updated":
    case "subscription.uncanceled":
      if (data.metadata?.type === "app-purchase") return reconcileAppSubscription(data, "apply")
      return reconcileSubscription(data, mode, "apply")
    case "subscription.canceled":
    case "subscription.past_due":
      if (data.metadata?.type === "app-purchase") return reconcileAppSubscription(data, "keep")
      return reconcileSubscription(data, mode, "keep")
    case "subscription.revoked":
      if (data.metadata?.type === "app-purchase") return reconcileAppSubscription(data, "downgrade")
      return reconcileSubscription(data, mode, "downgrade")
    case "customer.state_changed": {
      // data = Customer; activeSubscriptions alt aboneliklerde customer
      // nesting olmayabilir → external id'yi customer'dan iliştir.
      const subs = data.activeSubscriptions ?? data.active_subscriptions ?? []
      const custExt = data.externalId ?? data.external_id ?? null
      let companyId: string | null = null
      for (const s of subs) {
        const r = await reconcileSubscription(
          { ...s, customer: { id: data.id, externalId: custExt } },
          mode,
          "apply",
        )
        companyId = r.companyId ?? companyId
      }
      return { companyId }
    }
    // tools.sentroy.com tek-seferlik paket satın alımı → entitlement.
    // (Abonelik order'ları da order.paid yollar ama metadata.type yoktur →
    // reconcileToolPackOrder no-op döner, abonelik akışı subscription.* ile.)
    case "order.paid":
    case "order.updated":
      if (data.metadata?.type === "app-purchase") return reconcileAppPurchaseOrder(data)
      if (data.metadata?.type === "system-product") return reconcileSystemProductOrder(data)
      return reconcileToolPackOrder(data, mode)
    // Yenileme/ödeme — subscription.* event'leri durumu zaten taşıyor.
    case "order.created":
    default:
      return { companyId: null }
  }
}

/**
 * Tek-seferlik tool-pack order'ını işle → UserToolEntitlement yarat (45 gün).
 * Idempotent: aynı Polar order için ikinci webhook (order.updated tekrarı) çift
 * hak yaratmaz (polarOrderId benzersiz + findByOrderId ön-kontrol).
 */
async function reconcileToolPackOrder(
  data: unknown,
  _mode: PolarMode,
): Promise<{ companyId: string | null }> {
  const d = data as {
    id?: string
    metadata?: Record<string, unknown>
    productId?: string
    product_id?: string
  }
  const meta = d.metadata ?? {}
  if (meta.type !== "tool-pack") return { companyId: null } // abonelik order'ı

  const userId = typeof meta.userId === "string" ? meta.userId : null
  const packKey = typeof meta.packKey === "string" ? meta.packKey : null
  const orderId = typeof d.id === "string" ? d.id : null
  if (!userId || !packKey || !orderId) {
    console.warn("[polar] tool-pack order eksik metadata:", { userId, packKey, orderId })
    return { companyId: null }
  }

  const pack = findPack(packKey)
  if (!pack) {
    console.warn("[polar] tool-pack order bilinmeyen pack:", packKey)
    return { companyId: null }
  }

  const existing = await userToolEntitlementModel.findByOrderId(orderId)
  if (existing) return { companyId: null } // idempotent

  await userToolEntitlementModel.create({
    userId,
    toolKey: pack.toolKey,
    packKey: pack.key,
    polarOrderId: orderId,
    polarProductId: d.productId ?? d.product_id ?? null,
    total: pack.credits,
    priceUsd: pack.priceUsd,
    validityDays: pack.validityDays,
  })
  return { companyId: null }
}

/**
 * Sistem (ilk-parti) tek-seferlik ürün order'ını işle → system_purchases kaydı.
 * Idempotent (polarOrderId unique + findByOrderId ön-kontrol). Entitlement mantığı
 * burada YOK — kayıt yalnız ödeme kanıtıdır; alt uygulama `app`+`reference` ile
 * sorgulayıp ne sağlayacağına kendi karar verir.
 */
async function reconcileSystemProductOrder(
  data: unknown,
): Promise<{ companyId: string | null }> {
  const d = data as {
    id?: string
    metadata?: Record<string, unknown>
    productId?: string
    product_id?: string
  }
  const meta = d.metadata ?? {}
  if (meta.type !== "system-product") return { companyId: null }

  const userId = typeof meta.userId === "string" ? meta.userId : null
  const orderId = typeof d.id === "string" ? d.id : null
  const amountUsd = typeof meta.amountUsd === "number" ? meta.amountUsd : Number(meta.amountUsd)
  if (!userId || !orderId || !Number.isFinite(amountUsd)) {
    console.warn("[polar] system-product order eksik metadata:", { userId, orderId, amountUsd })
    return { companyId: null }
  }

  const existing = await systemPurchaseModel.findByOrderId(orderId)
  if (existing) return { companyId: null } // idempotent

  await systemPurchaseModel.create({
    userId,
    app: typeof meta.app === "string" && meta.app ? meta.app : null,
    reference: typeof meta.reference === "string" && meta.reference ? meta.reference : null,
    amountUsd,
    polarOrderId: orderId,
    polarProductId: d.productId ?? d.product_id ?? null,
  })
  return { companyId: null }
}

/** metadata'dan app-purchase alanlarını çöz. */
function appPurchaseMeta(meta: Record<string, unknown>): { appId: string; userId: string; companyId: string } | null {
  const appId = typeof meta.appId === "string" ? meta.appId : null
  const userId = typeof meta.userId === "string" ? meta.userId : null
  const companyId = typeof meta.companyId === "string" ? meta.companyId : null
  if (!appId || !userId || !companyId) {
    console.warn("[polar] app-purchase eksik metadata:", { appId, userId, companyId })
    return null
  }
  return { appId, userId, companyId }
}

/**
 * Tek-seferlik (one_time) App Store satın alımı → AppInstall aktive. Idempotent:
 * activate (userId,appId,companyId) unique upsert; replay çift kurulum saymaz.
 */
async function reconcileAppPurchaseOrder(data: unknown): Promise<{ companyId: string | null }> {
  const d = data as { id?: string; metadata?: Record<string, unknown> }
  const m = appPurchaseMeta(d.metadata ?? {})
  if (!m) return { companyId: null }
  const app = await sentroyAppModel.findById(m.appId)
  if (!app) return { companyId: null }
  const { created } = await appInstallModel.activate({
    appId: m.appId,
    userId: m.userId,
    companyId: m.companyId,
    consentedScopes: app.requiredScopes,
    polarOrderId: typeof d.id === "string" ? d.id : null,
  })
  if (created) await sentroyAppModel.adjustInstallCount(m.appId, 1)
  return { companyId: m.companyId }
}

/**
 * Abonelik (subscription) App Store satın alımı → AppInstall. apply → aktive,
 * downgrade(revoked) → kaldır, keep(canceled/past_due) → dönem sonuna dek korunur.
 */
async function reconcileAppSubscription(
  raw: RawSubscription,
  intent: ReconcileIntent,
): Promise<{ companyId: string | null }> {
  const m = appPurchaseMeta(raw.metadata ?? {})
  if (!m) return { companyId: null }
  const app = await sentroyAppModel.findById(m.appId)
  if (!app) return { companyId: null }

  if (intent === "downgrade") {
    const inst = await appInstallModel.findActive(m.userId, m.appId, m.companyId)
    if (inst) {
      await appInstallModel.uninstall(inst.id)
      await sentroyAppModel.adjustInstallCount(m.appId, -1)
    }
    return { companyId: m.companyId }
  }
  if (intent === "apply") {
    const { created } = await appInstallModel.activate({
      appId: m.appId,
      userId: m.userId,
      companyId: m.companyId,
      consentedScopes: app.requiredScopes,
      polarSubscriptionId: raw.id ?? null,
    })
    if (created) await sentroyAppModel.adjustInstallCount(m.appId, 1)
  }
  // keep → no-op (revoked'a kadar aktif kalır)
  return { companyId: m.companyId }
}

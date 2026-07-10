import { getDb } from "../client"
import { toId, toObjectId } from "./_helpers"

const COLLECTION = "status_pages"

/**
 * Status Page — Sentroy multi-tenant Atlassian Statuspage benzeri ürün
 * (Phase 3+'ta UI/handler tarafından tüketilir; Phase 2 sadece şema).
 *
 * Bir Sentroy company'sinin tek bir status page'i olur (1:1). Public
 * URL: `https://status.sentroy.com/p/{slug}`. v2'de custom domain (CNAME)
 * eklenecek.
 *
 * Sentroy'un kendi internal status'u (`/`) bu modele girmez — hardcoded
 * kalır (apps/status'ın kendi 5 service probe pattern'iyle).
 */

export type StatusPagePlan = "free" | "pro"

export interface StatusPageBranding {
  /** Public page'de gösterilen başlık. */
  displayName: string
  /** CTA + accent renk (`#rrggbb` ya da null). */
  primaryColor: string | null
  /** Logo URL (yoksa text fallback). */
  logoUrl: string | null
  /** Logo'ya verilecek link (RP'nin marketing sitesi, vs.). Boş ise
   *  logo clickable değil. */
  logoLinkUrl: string | null
  /** Opsiyonel kısa tagline (header altında, hero'da). */
  tagline: string | null
}

export interface StatusPage {
  id: string
  companyId: string
  /** Public route segment'i — `auth.sentroy.com/p/<slug>`. Unique. */
  slug: string
  /** İç ad (dashboard list'inde gösterilir). */
  name: string
  branding: StatusPageBranding
  /** Embed widget izinli origin'leri (CORS). Boş = embed kapalı. */
  embedOrigins: string[]
  /** Atlassian-style "subscribe" widget açık mı (email subs). */
  subscribersEnabled: boolean
  /** v2'de CNAME-doğrulamalı custom domain. v1'de null. */
  customDomain: string | null
  plan: StatusPagePlan
  /** Free tier max — components / checks / monthly probes. */
  maxComponents: number
  maxChecksPerComponent: number
  enabled: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const FREE_TIER_MAX_COMPONENTS = 10
const FREE_TIER_MAX_CHECKS_PER_COMPONENT = 5

const DEFAULT_BRANDING: StatusPageBranding = {
  displayName: "",
  primaryColor: null,
  logoUrl: null,
  logoLinkUrl: null,
  tagline: null,
}

function col() {
  return getDb().then((db) => db.collection(COLLECTION))
}

// ─── Queries ──────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<StatusPage | null> {
  const c = await col()
  const doc = await c.findOne({ _id: toObjectId(id) })
  return doc ? toId(doc) : null
}

export async function findBySlug(slug: string): Promise<StatusPage | null> {
  const c = await col()
  const doc = await c.findOne({ slug })
  return doc ? toId(doc) : null
}

export async function findByCompany(
  companyId: string,
): Promise<StatusPage | null> {
  const c = await col()
  const doc = await c.findOne({ companyId })
  return doc ? toId(doc) : null
}

// ─── Mutations ────────────────────────────────────────────────────────────

export async function create(input: {
  companyId: string
  slug: string
  name: string
  branding?: Partial<StatusPageBranding>
  embedOrigins?: string[]
  plan?: StatusPagePlan
  createdBy: string
}): Promise<StatusPage> {
  const c = await col()
  const now = new Date()
  const branding: StatusPageBranding = {
    ...DEFAULT_BRANDING,
    displayName: input.branding?.displayName ?? input.name,
    ...input.branding,
  }
  const doc = {
    companyId: input.companyId,
    slug: input.slug.trim().toLowerCase(),
    name: input.name.trim(),
    branding,
    embedOrigins: input.embedOrigins ?? [],
    subscribersEnabled: true,
    customDomain: null,
    plan: input.plan ?? "free",
    maxComponents: FREE_TIER_MAX_COMPONENTS,
    maxChecksPerComponent: FREE_TIER_MAX_CHECKS_PER_COMPONENT,
    enabled: true,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }
  const result = await c.insertOne(doc)
  return { id: result.insertedId.toString(), ...doc }
}

export async function update(
  id: string,
  patch: Partial<
    Pick<
      StatusPage,
      | "name"
      | "branding"
      | "embedOrigins"
      | "subscribersEnabled"
      | "enabled"
      | "customDomain"
    >
  >,
): Promise<StatusPage | null> {
  const c = await col()
  const result = await c.findOneAndUpdate(
    { _id: toObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return result ? toId(result) : null
}

export async function remove(id: string): Promise<boolean> {
  const c = await col()
  const result = await c.deleteOne({ _id: toObjectId(id) })
  return result.deletedCount === 1
}

export async function createIndexes(): Promise<void> {
  const c = await col()
  await c.createIndex({ slug: 1 }, { unique: true })
  await c.createIndex({ companyId: 1 }, { unique: true })
}

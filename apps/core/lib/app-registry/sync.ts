import { parseManifest } from "@workspace/app-manifest"
import { sentroyAppModel, registryStateModel, registrySyncConflictModel } from "@workspace/db/models"
import type { SentroyApp } from "@workspace/db/types"
import { verifyAttached } from "@workspace/console/lib/app-registry-jws"
import { buildAppCreateInput, semverGt } from "@/lib/app-store/build-record"
import { resolvePinnedKeys } from "./pinned-keys"

/**
 * Instance-side registry sync — İMZALI katalogu çeker, doğrular, YEREL olarak
 * merge eder. Supply-chain güven sınırları (blueprint C1-C4/H1-H6):
 *  - imza (kid-strict) + freshness (expiresAt/30d) + monotonic floor
 *    (generatedAt) HERHANGİ biri başarısızsa TÜM sync abort (SIFIR yazma).
 *  - wire'daki önhesaplı güvenlik attribute'larına ASLA güvenilmez: her satır
 *    strict parseManifest + buildAppCreateInput(source:"registry") ile YEREL
 *    yeniden türetilir.
 *  - yerel sayaçlar korunur (upsertRegistryApp); appId/slug çakışması karantina
 *    (asla ez/E11000); reconcile-by-absence + sticky revocation + blocklist.
 *  - oauthClientId ASLA import edilmez (H1: oauth app'ler katalogtan hariç).
 *
 * APP_REGISTRY_ENABLED yoksa hiçbir şey yapmaz (early return) → hosted/registry-
 * kapalı instance byte-birebir aynı.
 */

const MAX_CATALOG_BYTES = 8 * 1024 * 1024 // 8MB — DoS guard (H6)
const MAX_CATALOG_APPS = 2000 // app-sayısı cap (H6)
const MAX_CATALOG_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 gün hard cap (C3)

export interface SyncReport {
  ok: boolean
  trigger: string
  error?: string
  created: number
  updated: number
  skipped: number
  conflicts: number
  revoked: number
  reconciledAbsent: number
  catalogVersion?: string
}

function zeroReport(trigger: string, error?: string): SyncReport {
  return {
    ok: !error,
    trigger,
    error,
    created: 0,
    updated: 0,
    skipped: 0,
    conflicts: 0,
    revoked: 0,
    reconciledAbsent: 0,
  }
}

export function isRegistrySyncEnabled(): boolean {
  const v = process.env.APP_REGISTRY_ENABLED
  return !!v && /^(1|true|on|yes)$/i.test(v.trim())
}

function registryUrl(): string {
  return (process.env.APP_REGISTRY_URL || "https://sentroy.com").trim().replace(/\/+$/, "")
}

/** Byte-cap'li streamed body okuma (Content-Length yalanına karşı gerçek cap). */
async function readCapped(res: Response, cap: number): Promise<string | null> {
  const cl = res.headers.get("content-length")
  if (cl && Number(cl) > cap) return null
  if (!res.body) return null
  const reader = res.body.getReader()
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > cap) {
        try {
          await reader.cancel()
        } catch {
          /* ignore */
        }
        return null
      }
      chunks.push(Buffer.from(value))
    }
  }
  return Buffer.concat(chunks).toString("utf8")
}

// Doğrulanmış (imzalı) payload'ı defansif parse — bizim imzamız olsa da şekil
// kontrolü yaparız (bozuk export'a karşı).
interface CatalogAppShape {
  appId: string
  slug: string | null
  currentVersion: string
  manifestVersion: number
  manifestSnapshot: unknown
  registryDeveloper: { name: string; slug: string; verified: boolean } | null
  registryStats: { installCount: number; ratingAvg: number; ratingCount: number } | null
  hostedOnly?: boolean
  supportsSelfHostedIssuers?: boolean
  originVerifiedAt: string | null
}
interface CatalogShape {
  version: string
  generatedAt: string
  expiresAt: string
  apps: CatalogAppShape[]
  editorsChoice: string[]
  revocations: string[]
}

function parseEnvelope(payload: unknown): CatalogShape | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>
  if (
    typeof p.version !== "string" ||
    typeof p.generatedAt !== "string" ||
    typeof p.expiresAt !== "string" ||
    !Array.isArray(p.apps) ||
    !Array.isArray(p.editorsChoice) ||
    !Array.isArray(p.revocations)
  ) {
    return null
  }
  return p as unknown as CatalogShape
}

export async function syncRegistry(opts: { trigger: string }): Promise<SyncReport> {
  const { trigger } = opts
  if (!isRegistrySyncEnabled()) return zeroReport(trigger, "disabled")

  const base = registryUrl()
  if (!/^https:\/\//i.test(base)) {
    const r = zeroReport(trigger, "APP_REGISTRY_URL must be https")
    await registryStateModel.setSyncError(r.error!)
    return r
  }

  // ── 1. Fetch (byte-cap'li) ────────────────────────────────────────────────
  let raw: string | null
  try {
    const res = await fetch(`${base}/api/public/app-registry/catalog`, {
      headers: {
        accept: "application/jose",
        ...(process.env.APP_REGISTRY_TELEMETRY && /^(1|true|on|yes)$/i.test(process.env.APP_REGISTRY_TELEMETRY.trim())
          ? { "x-sentroy-registry-client": process.env.APP_VERSION || "1" }
          : {}),
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const r = zeroReport(trigger, `catalog fetch failed: ${res.status}`)
      await registryStateModel.setSyncError(r.error!)
      return r
    }
    raw = await readCapped(res, MAX_CATALOG_BYTES)
  } catch (err) {
    const r = zeroReport(trigger, `catalog fetch error: ${err instanceof Error ? err.message : String(err)}`)
    await registryStateModel.setSyncError(r.error!)
    return r
  }
  if (raw === null) {
    const r = zeroReport(trigger, "catalog too large or empty")
    await registryStateModel.setSyncError(r.error!)
    return r
  }

  // ── 2. İmza doğrula (PINNED key'ler) — parse ETMEDEN ÖNCE ──────────────────
  const verified = verifyAttached(raw, resolvePinnedKeys())
  if (!verified.ok) {
    const r = zeroReport(trigger, `signature verification failed: ${verified.error}`)
    await registryStateModel.setSyncError(r.error!)
    return r
  }

  const envelope = parseEnvelope(verified.payload)
  if (!envelope) {
    const r = zeroReport(trigger, "malformed catalog envelope")
    await registryStateModel.setSyncError(r.error!)
    return r
  }

  // ── 3. Freshness (C3) ─────────────────────────────────────────────────────
  const now = Date.now()
  const generatedAt = new Date(envelope.generatedAt)
  const expiresAt = new Date(envelope.expiresAt)
  if (Number.isNaN(generatedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    const r = zeroReport(trigger, "invalid catalog timestamps")
    await registryStateModel.setSyncError(r.error!)
    return r
  }
  if (now > expiresAt.getTime()) {
    const r = zeroReport(trigger, "catalog expired")
    await registryStateModel.setSyncError(r.error!)
    return r
  }
  if (now - generatedAt.getTime() > MAX_CATALOG_AGE_MS) {
    const r = zeroReport(trigger, "catalog older than 30d hard cap")
    await registryStateModel.setSyncError(r.error!)
    return r
  }
  // Gelecek-tarihli katalog monotonic floor'u KALICI zehirler (lockout) —
  // 5dk skew toleransıyla reddet (aksi halde floor 2100'e yazılır, sonraki
  // meşru kataloglar sonsuza dek no-op olur).
  if (generatedAt.getTime() > now + 5 * 60 * 1000) {
    const r = zeroReport(trigger, "catalog generatedAt is in the future")
    await registryStateModel.setSyncError(r.error!)
    return r
  }

  // ── 4. Monotonic floor (C2) — rollback/downgrade guard ────────────────────
  const state = await registryStateModel.get()
  if (state.lastCatalogGeneratedAt && generatedAt.getTime() <= state.lastCatalogGeneratedAt.getTime()) {
    // Eski/tekrar katalog — SIFIR yazma, hata değil (idempotent no-op).
    return { ...zeroReport(trigger), catalogVersion: envelope.version }
  }

  // App-sayısı cap AŞILIRSA sessizce slice ETME — tail'i disable eden bir
  // reconcile bug'ı (attacker-orderable) yaratır. SIFIR yazma ile reddet.
  if (envelope.apps.length > MAX_CATALOG_APPS) {
    const r = zeroReport(trigger, `catalog exceeds ${MAX_CATALOG_APPS} apps`)
    await registryStateModel.setSyncError(r.error!)
    return r
  }

  // ── 5. Per-app processing ─────────────────────────────────────────────────
  const report = zeroReport(trigger)
  report.catalogVersion = envelope.version

  const apps = envelope.apps
  const revokedSet = new Set(state.revokedTombstones)
  const blockedSet = new Set(state.blockedAppIds)
  const catalogAppIds = new Set<string>()

  for (const entry of apps) {
    try {
      if (!entry || typeof entry.appId !== "string") {
        report.skipped++
        continue
      }

      // manifestVersion geçersiz → atla+uyar (wire ön-filtre).
      if (typeof entry.manifestVersion !== "number" || entry.manifestVersion < 1) {
        report.skipped++
        continue
      }

      // Strict re-parse — wire'daki güvenlik attribute'larına ASLA güvenme.
      const parsed = parseManifest(entry.manifestSnapshot)
      if (!parsed.ok) {
        await registrySyncConflictModel.record({
          appId: entry.appId,
          slug: entry.slug ?? null,
          reason: "manifest-invalid",
          catalogVersion: envelope.version,
          detail: parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ").slice(0, 500),
        })
        report.conflicts++
        continue
      }
      const m = parsed.manifest

      // AUTHORITATIVE appId = manifest identity.id (wire'a değil manifest'e güven).
      // Wire entry.appId buna EŞİT olmalı; değilse katalog yalan söylüyor →
      // karantina. Aksi halde entry.appId ile yapılan blocklist/revocation
      // kontrolü baypas edilebilir ve catalogAppIds zehirlenebilir (reconcile).
      const appId = m.identity.id
      if (entry.appId !== appId) {
        await registrySyncConflictModel.record({
          appId,
          slug: entry.slug ?? null,
          reason: "row-error",
          catalogVersion: envelope.version,
          detail: `wire appId "${entry.appId}" != manifest identity.id "${appId}"`,
        })
        report.conflicts++
        continue
      }
      catalogAppIds.add(appId)

      // H1: oauth-mode app'ler instance-side de hariç (upstream dürüstlüğüne
      // güvenme) — yerel oauthClientId mint hook'u yok (v2/O11).
      if (m.auth.mode === "oauth") {
        report.skipped++
        continue
      }

      // Blocklist / sticky revocation → asla (yeniden) oluşturma (authoritative id).
      if (blockedSet.has(appId) || revokedSet.has(appId)) {
        report.skipped++
        continue
      }

      // Yerel yeniden türetme — sandbox/allow/embedOrigin/injectedParams YEREL.
      const built = buildAppCreateInput(
        m,
        {
          developerCompanyId: null,
          submittedByUserId: null,
          source: "registry",
          submitForReview: false,
          registryOriginVerifiedAt: entry.originVerifiedAt ? new Date(entry.originVerifiedAt) : null,
        },
        new Date(),
      )

      // H2 çakışma kontrolü: appId + slug.
      const byAppId = await sentroyAppModel.findByAppId(built.appId)
      const bySlug = await sentroyAppModel.findBySlug(built.slug)

      // slug başka bir appId'ye ait → karantina, atla (asla E11000).
      if (bySlug && bySlug.appId !== built.appId) {
        await registrySyncConflictModel.record({
          appId: built.appId,
          slug: built.slug,
          localAppId: bySlug.id,
          localSource: bySlug.source,
          reason: "slug-collision",
          catalogVersion: envelope.version,
        })
        report.conflicts++
        continue
      }

      // appId var ama registry değil → yerel sahiplenmiş, asla ezme.
      if (byAppId && byAppId.source !== "registry") {
        await registrySyncConflictModel.record({
          appId: built.appId,
          slug: built.slug,
          localAppId: byAppId.id,
          localSource: byAppId.source,
          reason: "appid-squatted-by-local",
          catalogVersion: envelope.version,
        })
        report.conflicts++
        continue
      }

      // semverGt monotonic guard (mevcut registry satırı için).
      if (byAppId && !semverGt(byAppId.currentVersion, m.identity.version)) {
        report.skipped++
        continue
      }

      // enabled = mevcut admin localState "disabled" değilse (revoked/blocked zaten atlandı).
      const localState = byAppId?.localState
      const enabled = localState !== "disabled"

      const doc: Omit<SentroyApp, "id"> = {
        ...built,
        enabled,
        registryDeveloper: entry.registryDeveloper ?? null,
        registryStats: entry.registryStats ?? null,
        ...(localState ? { localState } : {}),
      }

      const result = await sentroyAppModel.upsertRegistryApp(doc)
      if (result.created) report.created++
      else report.updated++
    } catch (err) {
      // H3: per-row hata sync'i abort ETMEZ — karantina + devam.
      await registrySyncConflictModel.record({
        appId: entry?.appId ?? "unknown",
        slug: entry?.slug ?? null,
        reason: "row-error",
        catalogVersion: envelope.version,
        detail: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      })
      report.conflicts++
    }
  }

  // ── 6. Reconcile-by-absence (C2) — katalogta olmayan yerel registry satırlarını disable ──
  // SHRINK GUARD: imzalı-ama-boş/kısmi bir katalog (transient export bug veya
  // compromise) tüm kurulu app'leri tek sync'te disable etmesin. catalogAppIds
  // boşsa VEYA enabled registry satırlarının >%50'sini disable edecekse
  // reconcile'ı ATLA + conflict kaydı (sonraki tam katalog kendini onarır).
  const localRegistry = await sentroyAppModel.listAllRegistry()
  const enabledRows = localRegistry.filter((r) => r.enabled)
  const toDisable = enabledRows.filter((r) => !catalogAppIds.has(r.appId))
  const shrinkGuard =
    toDisable.length > 0 &&
    (catalogAppIds.size === 0 || (enabledRows.length >= 4 && toDisable.length * 2 > enabledRows.length))
  if (shrinkGuard) {
    await registrySyncConflictModel.record({
      appId: "(reconcile)",
      reason: "row-error",
      catalogVersion: envelope.version,
      detail: `reconcile skipped: would disable ${toDisable.length}/${enabledRows.length} rows (catalog shrink guard)`,
    })
  } else {
    for (const row of toDisable) {
      await sentroyAppModel.update(row.id, { enabled: false })
      report.reconciledAbsent++
    }
  }

  // ── 7. Revocations (C2 sticky) ────────────────────────────────────────────
  if (envelope.revocations.length > 0) {
    await registryStateModel.recordRevoked(envelope.revocations)
    for (const appId of envelope.revocations) {
      const row = await sentroyAppModel.findByAppId(appId)
      if (row && row.source === "registry" && row.enabled) {
        await sentroyAppModel.update(row.id, { enabled: false })
        report.revoked++
      }
    }
  }

  // ── 8. Persist + editorsChoice (featured_apps'e YAZMADAN registryState'e) ──
  await registryStateModel.setCatalogFeatured(envelope.editorsChoice)
  await registryStateModel.setSyncResult({ version: envelope.version, generatedAt })

  return report
}

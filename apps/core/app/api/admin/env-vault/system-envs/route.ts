import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import {
  envProjectModel,
  envVariableModel,
} from "@workspace/db/models"
import { decryptValue } from "@workspace/console/lib/env-vault-crypto"
import {
  SYSTEM_ENV_REGISTRY,
  SYSTEM_PROJECTS,
  seedSystemProjects,
} from "@/lib/system-envs"

/**
 * GET /api/admin/env-vault/system-envs
 *
 * Sentroy'un kendi migrate-edilmiş env'lerinin durumunu döner —
 * her registry entry için: vault'ta var mı, core'un process.env'inde var
 * mı, getEnvWithFallback hangi kaynaktan okur. Diagnostic page render eder.
 *
 * Plaintext değer **dönmez** — sadece "set/unset" + masked preview
 * (ilk 4 + son 4 karakter, ortası `*`). Dashboard'da gerçek değeri
 * görmek için variable'ı normal env-vault UI'ında aç.
 *
 * `system-admin` only. Process.env diagnostic core app'in kendi
 * çevresine bakar — mail-only env'ler için (`visibleFromCore: false`)
 * sadece vault state döner; "process.env burada görünmez" işareti.
 */

interface SystemEnvStatus {
  key: string
  projectSlug: string
  projectId: string | null
  description: string
  usedIn: string
  visibleFromCore: boolean
  inVault: boolean
  inProcessEnv: boolean
  /**
   * Hangi kaynaktan okunur:
   *   - "vault"        → vault'ta set, getEnvWithFallback vault'tan döner
   *   - "process.env"  → vault'ta yok, process.env fallback aktif
   *   - "missing"      → ikisi de yok, getEnvWithFallback undefined döner
   *   - "unknown"      → mail-only env, core diagnostic process.env göremez
   */
  source: "vault" | "process.env" | "missing" | "unknown"
  vaultMaskedValue: string | null
  vaultDecryptError: boolean
  vaultUpdatedAt: string | null
  vaultEnvironment: string | null
}

function maskValue(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length)
  return `${value.slice(0, 4)}${"*".repeat(Math.min(20, value.length - 8))}${value.slice(-4)}`
}

export async function GET(request: NextRequest) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error

  // Sistem projelerini idempotent garantile.
  await seedSystemProjects(auth.session.user.id).catch(() => {})

  // Project slug → id map (1 query yerine 3, sınırlı sayıda)
  const projectIds = new Map<string, string>()
  for (const def of SYSTEM_PROJECTS) {
    const project = await envProjectModel.findBySlug(def.slug, null)
    if (project) projectIds.set(def.slug, project.id)
  }

  const out: SystemEnvStatus[] = []

  for (const def of SYSTEM_ENV_REGISTRY) {
    const projectId = projectIds.get(def.projectSlug) ?? null
    const projectDef = SYSTEM_PROJECTS.find((p) => p.slug === def.projectSlug)
    const env = projectDef?.defaultEnvironment ?? "prod"

    // Vault lookup
    let inVault = false
    let vaultMaskedValue: string | null = null
    let vaultDecryptError = false
    let vaultUpdatedAt: string | null = null
    let vaultEnvironment: string | null = null
    if (projectId) {
      const variable = await envVariableModel.findOne(projectId, env, def.key)
      if (variable) {
        inVault = true
        vaultEnvironment = env
        vaultUpdatedAt =
          variable.updatedAt instanceof Date
            ? variable.updatedAt.toISOString()
            : (variable.updatedAt as unknown as string)
        try {
          vaultMaskedValue = maskValue(decryptValue(variable.valueCipher))
        } catch {
          vaultDecryptError = true
        }
      }
    }

    // process.env lookup (core perspective)
    const peVal = def.visibleFromCore ? process.env[def.key] : undefined
    const inProcessEnv = peVal !== undefined && peVal !== ""

    let source: SystemEnvStatus["source"]
    if (inVault) {
      source = "vault"
    } else if (def.visibleFromCore && inProcessEnv) {
      source = "process.env"
    } else if (!def.visibleFromCore) {
      source = "unknown"
    } else {
      source = "missing"
    }

    out.push({
      key: def.key,
      projectSlug: def.projectSlug,
      projectId,
      description: def.description,
      usedIn: def.usedIn,
      visibleFromCore: def.visibleFromCore,
      inVault,
      inProcessEnv,
      source,
      vaultMaskedValue,
      vaultDecryptError,
      vaultUpdatedAt,
      vaultEnvironment,
    })
  }

  // Aggregate sayıları header'a koy — dashboard "X/Y vault'ta" göstergesi için
  const total = out.length
  const inVaultCount = out.filter((s) => s.inVault).length

  return jsonSuccess({
    entries: out,
    summary: {
      total,
      inVault: inVaultCount,
      processEnv: out.filter((s) => s.source === "process.env").length,
      missing: out.filter((s) => s.source === "missing").length,
      unknown: out.filter((s) => s.source === "unknown").length,
    },
    projects: SYSTEM_PROJECTS.map((p) => ({
      slug: p.slug,
      name: p.name,
      id: projectIds.get(p.slug) ?? null,
    })),
  })
}

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertAdmin } from "@workspace/console/lib/admin-access"
import {
  envProjectModel,
  envAuditLogModel,
} from "@workspace/db/models"
import { seedSystemProjects } from "@/lib/system-envs"

/**
 * Sentroy Env Vault — projects collection.
 *
 *   GET    → tüm projects (admin browse). Sentroy'un kendi sistem
 *            projeleri (sentroy-core/mail/storage) yoksa idempotent
 *            seed edilir — admin "where do my envs go" sorusunu
 *            açılır açılmaz görür.
 *   POST   → yeni project (slug + name)
 *
 * Yalnızca system-admin (`session.user.role === "admin"`).
 */

export async function GET(request: NextRequest) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error

  await seedSystemProjects(auth.session.user.id).catch(() => {
    // Seed fail bypass — listeye dön
  })
  const projects = await envProjectModel.findAll()
  return jsonSuccess(projects)
}

export async function POST(request: NextRequest) {
  const auth = await assertAdmin(request)
  if ("error" in auth) return auth.error

  let body: {
    slug?: string
    name?: string
    description?: string | null
    defaultEnvironment?: string
  }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const slug = (body.slug ?? "").trim().toLowerCase()
  const name = (body.name ?? "").trim()
  if (!slug || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return jsonError(
      "slug required — lowercase alphanumeric + hyphens (e.g. 'my-blog')",
    )
  }
  if (!name) return jsonError("name required")

  // Aynı slug var mı?
  const existing = await envProjectModel.findBySlug(slug)
  if (existing) return jsonError("project with this slug already exists", 409)

  const project = await envProjectModel.create({
    slug,
    name,
    description: body.description ?? null,
    defaultEnvironment: body.defaultEnvironment ?? "prod",
    createdBy: auth.session.user.id,
  })

  await envAuditLogModel.log({
    action: "project.create",
    projectId: project.id,
    actorId: auth.session.user.id,
    actorEmail: auth.session.user.email ?? null,
    meta: { slug: project.slug, name: project.name },
  })

  return jsonSuccess(project, 201)
}

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyOwnerOrAdmin } from "@workspace/console/lib/company-access"
import {
  envProjectModel,
  envAuditLogModel,
} from "@workspace/db/models"

/**
 * Per-company env-vault projects.
 *
 * vault.sentroy.com end-user UI bunu hits eder; access kontrolü
 * company owner/admin (member-level RBAC ileri için, env-vault şu an
 * sensitive — sadece şirket sahibi/yöneticisi görür).
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
  if ("error" in auth) return auth.error

  const projects = await envProjectModel.findByCompany(auth.companyId!)
  return jsonSuccess(projects)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const auth = await assertCompanyOwnerOrAdmin(request, slug)
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

  const projectSlug = (body.slug ?? "").trim().toLowerCase()
  const name = (body.name ?? "").trim()
  if (!projectSlug || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(projectSlug)) {
    return jsonError(
      "slug required — lowercase alphanumeric + hyphens (e.g. 'my-blog')",
    )
  }
  if (!name) return jsonError("name required")

  // Aynı company içinde slug benzersiz olmalı (başka company aynı slug'ı
  // kullanabilir).
  const existing = await envProjectModel.findBySlug(projectSlug, auth.companyId)
  if (existing) return jsonError("project with this slug already exists", 409)

  const project = await envProjectModel.create({
    slug: projectSlug,
    name,
    description: body.description ?? null,
    defaultEnvironment: body.defaultEnvironment ?? "prod",
    companyId: auth.companyId,
    createdBy: auth.session!.user.id,
  })

  await envAuditLogModel.log({
    action: "project.create",
    projectId: project.id,
    actorId: auth.session!.user.id,
    actorEmail: auth.session!.user.email ?? null,
    meta: { slug: project.slug, name: project.name, companyId: auth.companyId },
  })

  return jsonSuccess(project, 201)
}

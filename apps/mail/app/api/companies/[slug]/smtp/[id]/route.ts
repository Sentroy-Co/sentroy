export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import * as SmtpModel from "@workspace/db/models/smtp-credential"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  let body: { isActive?: boolean }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (typeof body.isActive !== "boolean") {
    return jsonError("isActive must be a boolean")
  }

  const result = await getSentroyForCompany(request, slug, "smtp.manage")
  if ("error" in result && result.error) return result.error

  try {
    const existing = await SmtpModel.findById(id)
    if (!existing) {
      return jsonError("SMTP credential not found", 404)
    }

    if (existing.companyId !== result.company!._id.toString()) {
      return jsonError("Not authorized", 403)
    }

    const updated = await SmtpModel.updateById(id, {
      isActive: body.isActive,
    })

    return jsonSuccess(updated)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update SMTP credential"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug, "smtp.manage")
  if ("error" in result && result.error) return result.error

  try {
    const existing = await SmtpModel.findById(id)
    if (!existing) {
      return jsonError("SMTP credential not found", 404)
    }

    if (existing.companyId !== result.company!._id.toString()) {
      return jsonError("Not authorized", 403)
    }

    await SmtpModel.deleteById(id)
    return jsonSuccess({ message: "SMTP credential deleted" })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete SMTP credential"
    return jsonError(message, 500)
  }
}

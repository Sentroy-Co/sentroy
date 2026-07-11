export const dynamic = "force-dynamic"

import crypto from "crypto"
import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import * as SmtpModel from "@workspace/db/models/smtp-credential"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const result = await getSentroyForCompany(request, slug, "smtp.manage")
  if ("error" in result && result.error) return result.error

  try {
    const credentials = await SmtpModel.findByCompany(
      result.company!._id.toString()
    )
    return jsonSuccess(credentials)
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to list SMTP credentials"
    return jsonError(message, 500)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  let body: { name?: string; domainId?: string }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return jsonError("Name is required")
  }

  if (
    !body.domainId ||
    typeof body.domainId !== "string" ||
    !body.domainId.trim()
  ) {
    return jsonError("Domain is required")
  }

  const result = await getSentroyForCompany(request, slug, "smtp.manage")
  if ("error" in result && result.error) return result.error

  try {
    const username = `smtp_${crypto.randomBytes(12).toString("hex")}`
    const password = crypto.randomBytes(24).toString("base64url")
    const passwordHash = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex")

    const credential = await SmtpModel.create({
      companyId: result.company!._id.toString(),
      name: body.name.trim(),
      username,
      passwordHash,
      domainId: body.domainId.trim(),
      isActive: true,
    })

    return jsonSuccess(
      {
        ...credential,
        password,
      },
      201
    )
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to create SMTP credential"
    return jsonError(message, 500)
  }
}

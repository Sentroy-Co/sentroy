export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForInbox } from "@/lib/inbox-access"
import { mailRuleModel } from "@workspace/db/models"
import { findCategory } from "@workspace/db/models/mail-rule"

const MAX_BATCH = 30

interface InputMessage {
  uid: string
  subject?: string
  fromName?: string | null
  fromAddress: string
  preview?: string | null
  hasListUnsubscribe?: boolean
}

/**
 * Rules-only classifier overlay — kategorinin ASIL kaynağı artık mail-server:
 * teslimatta deterministik kurallarla hesaplanıp mesajın üzerine IMAP keyword
 * olarak damgalanıyor ve list yanıtında `category` alanıyla geliyor. Bu
 * endpoint yalnızca kullanıcının "bu göndereni her zaman X olarak
 * kategorile" kurallarını (mail_rules, kind=category) uygular — sender kuralı
 * sunucu damgasının ÜZERİNE yazar (pin kazanır).
 *
 * Eski AI (Gemini) sınıflandırma aşaması ve Mongo uid-cache'i kaldırıldı —
 * uid'ler klasör taşımalarında değiştiği için cache kırılgandı ve mobil bu
 * katmana erişemiyordu. Response şekli geriye-uyumlu.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  let body: { mailbox?: string; messages?: InputMessage[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  if (!body.mailbox) return jsonError("mailbox is required")
  if (Array.isArray(body.messages) && body.messages.length > MAX_BATCH) {
    return jsonError(`Maximum ${MAX_BATCH} messages per batch`, 422)
  }

  const result = await getSentroyForInbox(request, slug, body.mailbox)
  if ("error" in result && result.error) return result.error
  const companyId = result.companyId
  if (!companyId) return jsonError("Company not resolved", 500)

  const messages = Array.isArray(body.messages) ? body.messages : []
  const validMessages = messages.filter(
    (m): m is InputMessage =>
      typeof m?.uid === "string" &&
      m.uid.length > 0 &&
      typeof m.fromAddress === "string",
  )
  if (validMessages.length === 0) {
    return jsonSuccess({ classifications: [], cached: 0, classified: 0, rules: 0 })
  }

  const mailbox = body.mailbox.toLowerCase()

  // Sender-pinned kurallar — deterministik, her çağrıda taze değerlendirilir
  // (cache yok: kural silinince etkisi anında kalkar).
  const rules = await mailRuleModel.listForMailbox({ companyId, mailbox })
  const rulePairs = rules.map((r) => ({
    sender: r.sender,
    category: r.category,
    kind: r.kind,
  }))

  const classifications: Array<{ uid: string; category: string }> = []
  for (const m of validMessages) {
    const cat = findCategory(rulePairs, m.fromAddress)
    if (cat) classifications.push({ uid: m.uid, category: cat })
  }

  return jsonSuccess({
    classifications,
    cached: 0,
    classified: 0,
    rules: classifications.length,
  })
}

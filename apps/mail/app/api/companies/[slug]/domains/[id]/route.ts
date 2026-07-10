import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { hasPermission } from "@workspace/auth/server/permissions"
import { syncOnMailboxDelete } from "@/lib/mailbox-account-sync"
import { catchAllRuleModel } from "@workspace/db/models"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  if (!result.isTokenAccess) {
    const canView = await hasPermission(
      result.session!,
      slug,
      `domains.domain:${id}:view`,
    )
    if (!canView) {
      return jsonError("Insufficient permissions", 403)
    }
  }

  try {
    const [domain, dns] = await Promise.all([
      result.sentroy!.domains.get(id),
      result.sentroy!.domains.getDnsRecords(id),
    ])
    return jsonSuccess({ ...domain.data, dnsRecords: dns.data })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to get domain"
    return jsonError(message, 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params

  const result = await getSentroyForCompany(request, slug)
  if ("error" in result && result.error) return result.error

  if (!result.isTokenAccess) {
    const canDelete = await hasPermission(
      result.session!,
      slug,
      `domains.domain:${id}:delete`,
    )
    if (!canDelete) {
      return jsonError("Insufficient permissions", 403)
    }
  }

  try {
    // ── Cascade delete sırası ──────────────────────────────────────────
    // 1. Domain bilgisini al (name lazım — mail-server bazen mailbox
    //    listesinde `domain` field'ı vermiyor, email'den parse ediyoruz).
    // 2. O domain'e ait tüm mailboxları sil + her birinin auth user
    //    bağı / company-member permission'ı temizle (best-effort).
    // 3. Bu domain'in catch-all rule'unu DB'den temizle.
    // 4. Mail-server'da domain'i sil.
    //
    // Mailbox silme önce yapılıyor çünkü mail-server foreign-key niyetiyle
    // domain'i mailbox varken silmiyor (Postfix virtual user table'ı bağlı).
    // Mailbox silme aşamasında bir tane fail etse de devam ediyoruz —
    // half-deleted state'de bile domain delete denemesi tek atomik
    // commit'ten daha iyi recovery sağlar (admin retry edebilir).

    let domainName = ""
    try {
      const d = await result.sentroy!.domains.get(id)
      domainName = String(
        ((d.data as { name?: string } | undefined)?.name ?? "")
      ).toLowerCase()
    } catch (err) {
      console.warn(
        `[domains:delete] could not fetch domain ${id} before cascade:`,
        err instanceof Error ? err.message : err,
      )
    }

    const cascade: {
      mailboxesDeleted: number
      mailboxesFailed: number
      catchAllRemoved: boolean
      failed?: { email: string; error: string }[]
    } = {
      mailboxesDeleted: 0,
      mailboxesFailed: 0,
      catchAllRemoved: false,
    }

    if (domainName) {
      try {
        const mailboxes = await result.sentroy!.mailboxes.list()
        const owned = (mailboxes.data ?? []).filter(
          (m: { email?: string; domain?: string }) => {
            const d = (
              m.domain ??
              (m.email && m.email.includes("@") ? m.email.split("@")[1] : "")
            ).toLowerCase()
            return d === domainName
          },
        )

        for (const mb of owned) {
          const email = mb.email
          if (!email) continue
          try {
            await result.sentroy!.mailboxes.delete(email)
            // Auth user / member permission cleanup — best-effort, mailbox
            // sentroy'dan zaten silindi, sync hatası akışı bloklamasın.
            await syncOnMailboxDelete({ email })
            cascade.mailboxesDeleted++
          } catch (err) {
            cascade.mailboxesFailed++
            const errMsg = err instanceof Error ? err.message : String(err)
            console.warn(
              `[domains:delete] mailbox cascade failed for ${email}:`,
              errMsg,
            )
            ;(cascade.failed ??= []).push({ email, error: errMsg })
          }
        }
      } catch (err) {
        console.warn(
          `[domains:delete] mailbox list failed for ${domainName}, skipping cascade:`,
          err instanceof Error ? err.message : err,
        )
      }
    }

    // Catch-all DB kaydı — DB-side artifact, mail-server ile birlikte
    // gitmeli. Domain id ile lookup eşsizdir.
    try {
      cascade.catchAllRemoved = await catchAllRuleModel.removeByDomainId(id)
    } catch (err) {
      console.warn(
        `[domains:delete] catch-all rule cleanup failed for ${id}:`,
        err instanceof Error ? err.message : err,
      )
    }

    await result.sentroy!.domains.delete(id)
    return jsonSuccess({ message: "Domain deleted", cascade })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete domain"
    return jsonError(message, 500)
  }
}

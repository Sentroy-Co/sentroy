import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { assertCompanyAccess } from "@workspace/console/lib/company-access"
import {
  companyModel,
  companyMemberModel,
  companyInvitationModel,
  userNotificationModel,
} from "@workspace/db/models"
import { getDb } from "@workspace/db/client"
import { ObjectId } from "mongodb"
import type { Permission, CompanyMemberRole } from "@workspace/db/types"
import { sendSystemMailEvent } from "@workspace/auth/server/system-mail-events"
import { audit } from "@workspace/console/lib/audit"

const INVITE_DEFAULT_LOCALE = (
  process.env.SYSTEM_MAIL_DEFAULT_LOCALE || "en"
).toLowerCase()

/**
 * Davetiyeler sözleşmesi:
 *
 * - GET    /api/companies/:slug/invitations           → pending listesi
 * - POST   /api/companies/:slug/invitations           → davet oluştur + mail
 * - DELETE /api/companies/:slug/invitations/:id       → davet iptal
 * - POST   /api/invitations/:token/accept             → kabul et (auth gerekir)
 * - GET    /api/invitations/:token                    → peek (company adı, role)
 *
 * Caller'ın `members.manage` yetkisi olmalı.
 */

function getOrigin(request: NextRequest): string {
  // Davet kabul sayfası (/invites/[token]) YALNIZ core app'te (sentroy.com) var.
  // Davet mail/storage gibi bir subdomain'den gönderildiğinde request origin o
  // subdomain'i gösterir — orada /invites route'u yok → kullanıcı 404 alır. Bu
  // yüzden her zaman core URL'e işaret ediyoruz; core'daki lang-less /invites
  // sayfası locale'i tespit edip /[lang]/invites/... 'e redirect eder.
  return (
    process.env.NEXT_PUBLIC_CORE_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    new URL(request.url).origin
  )
}

/**
 * Davet email'i gönderme — create + resend için ortak helper.
 *
 * Subject + HTML body artık `system_mail_event_templates` üzerinden
 * yönetiliyor (admin /admin/system-mail/events). Override yoksa
 * `packages/auth/src/server/system-mail-events.ts` içindeki
 * `invitation.created` default'una düşülür.
 *
 * Hatalar yutulur — invitation create akışını kırmaz; davet DB'de
 * yine yaratılır, kullanıcı manuel resend ile yeniden deneyebilir.
 */
async function sendInvitationEmail(opts: {
  to: string
  companyName: string
  role: CompanyMemberRole
  acceptUrl: string
  isExistingUser: boolean
}): Promise<{ sent: boolean; reason?: string }> {
  const { to, companyName, role, acceptUrl, isExistingUser } = opts
  try {
    return await sendSystemMailEvent("invitation.created", {
      to,
      locale: INVITE_DEFAULT_LOCALE,
      variables: {
        companyName,
        role,
        acceptUrl,
        actionVerb: isExistingUser ? "join" : "create your account and join",
      },
    })
  } catch (err) {
    console.warn("[invitations] send failed:", err)
    return { sent: false, reason: "send-threw" }
  }
}

// ── List ─────────────────────────────────────────────────────────────────────

export async function listInvitationsHandler(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "members.manage")
  if ("error" in access) return access.error

  const items = await companyInvitationModel.listByCompany(access.companyId, {
    onlyPending: true,
  })
  return jsonSuccess(items)
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createInvitationHandler(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const access = await assertCompanyAccess(request, slug, "members.manage")
  if ("error" in access) return access.error

  let body: { email?: string; role?: string; permissions?: string[] }
  try {
    body = await request.json()
  } catch {
    return jsonError("Invalid JSON body")
  }

  const email = (body.email ?? "").trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("Valid email is required")
  }
  const role: CompanyMemberRole = body.role === "admin" ? "admin" : "member"
  const permissions = (body.permissions || []) as Permission[]

  // Plan limit: pending invite + active member toplamı maxMembers'i aşamaz.
  const company = await companyModel.findById(access.companyId)
  if (!company) return jsonError("Company not found", 404)
  if (company.maxMembers > 0) {
    const [members, pending] = await Promise.all([
      companyMemberModel.findByCompany(access.companyId),
      companyInvitationModel.listByCompany(access.companyId, {
        onlyPending: true,
      }),
    ])
    if (members.length + pending.length >= company.maxMembers) {
      return jsonError(
        `Member limit reached (${members.length + pending.length}/${company.maxMembers})`,
        403,
      )
    }
  }

  // Email zaten member ise reddet
  const db = await getDb()
  const existingUser = await db
    .collection("user")
    .findOne({ email })
  if (existingUser) {
    const userId = existingUser._id.toString()
    const existingMember = await companyMemberModel.findByCompanyAndUser(
      access.companyId,
      userId,
    )
    if (existingMember) {
      return jsonError("User is already a member of this company")
    }
  }

  // Pending davet zaten varsa duplicate yaratma
  const existingPending = await companyInvitationModel.findPendingByEmail(
    access.companyId,
    email,
  )
  if (existingPending) {
    return jsonError("An invitation for this email is already pending")
  }

  const inviterId = access.session?.user.id ?? ""
  const invitation = await companyInvitationModel.create({
    companyId: access.companyId,
    email,
    role,
    permissions,
    invitedBy: inviterId,
  })

  const origin = getOrigin(request)
  // Locale segment'ini DOĞRUDAN ekliyoruz — `/[lang]/invites/[token]` route'unu
  // direkt vurur (lang-less redirect'e bağımlı değil → her durumda 404 yok).
  const acceptUrl = `${origin}/${INVITE_DEFAULT_LOCALE}/invites/${invitation.token}`

  // Email — sender result'ını bekleyip response'a ekliyoruz. Önceden
  // fire-and-forget + sessizce yutuluyordu, admin email gitmediğini
  // toast'tan göremiyordu. Artık başarısız ise UI uyarı gösterebilir.
  const { sent: emailSent, reason: emailReason } = await sendInvitationEmail({
    to: email,
    companyName: company.name,
    role,
    acceptUrl,
    isExistingUser: Boolean(existingUser),
  })

  // Eğer alıcı zaten Sentroy hesabıdır → in-app notification da yarat
  if (existingUser) {
    await userNotificationModel
      .create({
        userId: existingUser._id.toString(),
        type: "company-invitation",
        title: `${company.name} invited you to join as ${role}`,
        body: "Open the invitation to accept or decline.",
        href: `/invites/${invitation.token}`,
        meta: {
          companyId: company.id,
          invitationId: invitation.id,
        },
      })
      .catch((err) =>
        console.warn("[invitations] notification create failed:", err),
      )
  }

  audit({
    request,
    userId: inviterId,
    companyId: access.companyId,
    action: "invitation.create",
    resource: "invitation",
    resourceId: invitation.id,
    details: { email, role },
  })

  // Response'a email durumunu ekle — UI toast bilgilendirme için.
  return jsonSuccess(
    {
      ...invitation,
      emailSent,
      emailReason,
    },
    201,
  )
}

// ── Resend ──────────────────────────────────────────────────────────────────

/**
 * Pending davet için email'i tekrar gönder. UI'da "no-sender" / "send-failed"
 * gibi bir warning sonrası kullanıcının elle tetiklediği akış.
 *
 * Davet DB'de zaten var; sadece email body'sini yeniden üretip sender'a
 * iletiyoruz. Token + expiresAt değişmez (yeni davet oluşturmuyoruz, aynı
 * link). Davet pending değilse 409.
 */
export async function resendInvitationHandler(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "members.manage")
  if ("error" in access) return access.error

  const invite = await companyInvitationModel.findById(id)
  if (!invite || invite.companyId !== access.companyId) {
    return jsonError("Invitation not found", 404)
  }
  if (invite.status !== "pending") {
    return jsonError("Invitation is not pending", 409)
  }
  // Süre dolmuş davet için resend yapma — kullanıcı yeni davet oluşturmalı.
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return jsonError("Invitation expired — create a new one", 410)
  }

  const company = await companyModel.findById(invite.companyId)
  if (!company) return jsonError("Company not found", 404)

  // Existing user kontrolü — email template "join" vs "create account" yazısı
  const db = await getDb()
  const existingUser = await db
    .collection("user")
    .findOne({ email: invite.email })

  const origin = getOrigin(request)
  // Locale segment'i doğrudan (bkz. create akışı) — 404 garantili önlenir.
  const acceptUrl = `${origin}/${INVITE_DEFAULT_LOCALE}/invites/${invite.token}`

  const { sent: emailSent, reason: emailReason } = await sendInvitationEmail({
    to: invite.email,
    companyName: company.name,
    role: invite.role,
    acceptUrl,
    isExistingUser: Boolean(existingUser),
  })

  audit({
    request,
    userId: access.session?.user.id ?? "",
    companyId: access.companyId,
    action: "invitation.resend",
    resource: "invitation",
    resourceId: invite.id,
    details: { email: invite.email, emailSent, emailReason },
  })

  if (!emailSent) {
    return jsonError(
      `Email not sent: ${emailReason ?? "unknown"}. Configure system mail in Admin → System mail.`,
      502,
    )
  }
  return jsonSuccess({ resent: true, emailSent })
}

// ── Revoke ───────────────────────────────────────────────────────────────────

export async function revokeInvitationHandler(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params
  const access = await assertCompanyAccess(request, slug, "members.manage")
  if ("error" in access) return access.error

  const invite = await companyInvitationModel.findById(id)
  if (!invite || invite.companyId !== access.companyId) {
    return jsonError("Invitation not found", 404)
  }
  if (invite.status !== "pending") {
    return jsonError("Invitation is not pending")
  }
  await companyInvitationModel.revoke(id)
  audit({
    request,
    userId: access.session?.user.id ?? "",
    companyId: access.companyId,
    action: "invitation.revoke",
    resource: "invitation",
    resourceId: id,
    details: { email: invite.email, role: invite.role },
  })
  return jsonSuccess({ revoked: true })
}

// ── Peek (token) ─────────────────────────────────────────────────────────────

export async function peekInvitationHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const invite = await companyInvitationModel.findByToken(token)
  if (!invite) return jsonError("Invitation not found", 404)
  if (invite.status === "revoked")
    return jsonError("Invitation revoked", 410)
  if (invite.status === "accepted")
    return jsonError("Invitation already accepted", 410)
  if (invite.expiresAt < new Date()) {
    await companyInvitationModel.markExpired(invite.id)
    return jsonError("Invitation expired", 410)
  }

  const company = await companyModel.findById(invite.companyId)
  if (!company) return jsonError("Company not found", 404)

  return jsonSuccess({
    email: invite.email,
    role: invite.role,
    company: { name: company.name, slug: company.slug, avatarUrl: company.avatarUrl ?? null },
    expiresAt: invite.expiresAt,
  })
}

// ── Accept (token) ───────────────────────────────────────────────────────────

export async function acceptInvitationHandler(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // Auth check — accept yapan user oturum açmış olmalı.
  const { getAuthSession } = await import("@workspace/console/lib/api-helpers")
  const session = await getAuthSession(request)
  if (!session) return jsonError("Unauthorized", 401)

  const invite = await companyInvitationModel.findByToken(token)
  if (!invite) return jsonError("Invitation not found", 404)
  if (invite.status === "revoked")
    return jsonError("Invitation revoked", 410)
  if (invite.status === "accepted")
    return jsonError("Invitation already accepted", 410)
  if (invite.expiresAt < new Date()) {
    await companyInvitationModel.markExpired(invite.id)
    return jsonError("Invitation expired", 410)
  }

  // Email match — davet edilen adres ile oturum açan adres eşleşmeli.
  const sessionEmail = (session.user.email ?? "").toLowerCase()
  if (sessionEmail !== invite.email) {
    return jsonError(
      `This invitation is for ${invite.email}. Sign in with that account to accept.`,
      403,
    )
  }

  const company = await companyModel.findById(invite.companyId)
  if (!company) return jsonError("Company not found", 404)

  // Daha önce member ise idempotent — markAccepted + skip member create
  const existing = await companyMemberModel.findByCompanyAndUser(
    invite.companyId,
    session.user.id,
  )
  if (existing) {
    await companyInvitationModel.markAccepted(invite.id, session.user.id)
    return jsonSuccess({
      companySlug: company.slug,
      alreadyMember: true,
    })
  }

  // Plan limit (yine kontrol — zaman geçtikçe değişmiş olabilir)
  if (company.maxMembers > 0) {
    const members = await companyMemberModel.findByCompany(company.id)
    if (members.length >= company.maxMembers) {
      return jsonError(
        `Company has reached its member limit (${members.length}/${company.maxMembers})`,
        403,
      )
    }
  }

  await companyMemberModel.create({
    companyId: invite.companyId,
    userId: session.user.id,
    role: invite.role,
    status: "active",
    permissions: invite.permissions,
  })

  await companyInvitationModel.markAccepted(invite.id, session.user.id)

  audit({
    request,
    userId: session.user.id,
    companyId: invite.companyId,
    action: "invitation.accept",
    resource: "invitation",
    resourceId: invite.id,
    details: { role: invite.role },
  })

  // Owner / admin / inviter → "X joined" notification.
  // Inviter rolünün owner/admin olmaması mümkün (explicit members.manage
  // izniyle), bu yüzden invite.invitedBy'yi her zaman dahil ediyoruz.
  try {
    const allMembers = await companyMemberModel.findByCompany(company.id)
    const recipientIds = new Set<string>(
      allMembers
        .filter((m) => m.role === "owner" || m.role === "admin")
        .map((m) => m.userId),
    )
    if (invite.invitedBy) recipientIds.add(invite.invitedBy)
    recipientIds.delete(session.user.id) // accepter kendine bildirim almasın
    const newName = session.user.name || session.user.email || "A teammate"
    await Promise.all(
      Array.from(recipientIds).map((uid) =>
        userNotificationModel
          .create({
            userId: uid,
            type: "company-member-joined",
            title: `${newName} joined ${company.name}`,
            body: `Role: ${invite.role}`,
            href: `/d/${company.slug}/team`,
            meta: { companyId: company.id, userId: session.user.id },
          })
          .catch(() => {}),
      ),
    )
  } catch {
    // notification failure must not block accept
  }

  return jsonSuccess({
    companySlug: company.slug,
    alreadyMember: false,
  })
}

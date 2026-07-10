import {
  createUserWithEmail,
  setUserPasswordByEmail,
  findUserIdByEmail,
} from "@workspace/auth/server/admin-password"
import { companyMemberModel } from "@workspace/db/models"
import type { Permission, CompanyMember } from "@workspace/db/types"

/**
 * Mailbox CRUD'unu Sentroy auth user account'larıyla senkronize eden
 * helper'lar. Mail-server'daki mailbox (Postfix/Dovecot virtual user)
 * + better-auth user account + company-member ilişkisi tek noktada
 * koordine edilir.
 *
 * Hata politikası: Tüm fonksiyonlar **best-effort** — hata fırlatmazlar,
 * `{ ok, ...details }` shape'iyle döner. Caller mailbox CRUD akışını
 * kırmadan UI'ya warning gösterebilir.
 */

export interface SyncOnCreateResult {
  ok: boolean
  /** User zaten Sentroy hesabıydı; password ezilmedi. */
  existingUser: boolean
  /** Yeni member kaydı yarattıysa true; mevcut member'a permission eklediyse false. */
  newMembership: boolean
  error?: string
}

/**
 * Mailbox başarıyla yaratıldıktan sonra çağrılır:
 *  1. Aynı email'de user yoksa yarat (emailVerified: true).
 *  2. CompanyMember kaydı yoksa yarat: role="member",
 *     permissions=["inbox.mailbox:<email>"]. Member sadece kendi
 *     inbox'ını görebilir (mevcut filterAccessibleMailboxes pattern'i).
 *  3. Member zaten varsa permissions array'ine `inbox.mailbox:<email>`
 *     ekle (duplicate yoksa).
 *
 * Idempotent: aynı mailbox için tekrar çağrılırsa duplicate yaratmaz.
 */
/**
 * Mailbox sahibi user için varsayılan permission seti. Kullanıcı kendi
 * inbox'ına ek olarak şirketin günlük operasyon yüzeyinde temel haklara
 * sahip olur — admin manuel kısıp/genişletebilir, ama default olarak
 * "kendi mailbox'ından çalışan ekip üyesi" bağlamına yetecek kadar.
 *
 * Verilen yetkiler:
 *   • `inbox.mailbox:<email>`        — kendi inbox erişimi (zorunlu)
 *   • `templates.manage`             — email şablonu CRUD
 *   • `send.execute`                 — şablon/raw mail gönderme
 *   • `domains.domain:<id>:view`     — yalnızca kendi mailbox'ının
 *                                       domain'ini görme (DNS lookup,
 *                                       send-from picker'ı çalışsın)
 *   • `storage.view`                 — bucket/medya browse
 *   • `media.upload`                 — medya upload (template asset,
 *                                       attachment vb.)
 *
 * Kapsanmayan: `domains.create/edit/delete`, `mailboxes.manage`,
 * `members.manage`, `webhooks.manage`, `buckets.*` — admin/owner
 * tarafından gerektiğinde manuel verilir.
 */
function defaultMemberPermissions(input: {
  email: string
  domainId?: string | null
}): Permission[] {
  const perms: Permission[] = [
    `inbox.mailbox:${input.email.toLowerCase()}` as Permission,
    "templates.manage",
    "send.execute",
    "storage.view",
    "media.upload",
  ]
  if (input.domainId) {
    perms.push(`domains.domain:${input.domainId}:view` as Permission)
  }
  return perms
}

export async function syncOnMailboxCreate(input: {
  email: string
  password: string
  companyId: string
  /** Mailbox'ın bağlı olduğu domain id — `domains.domain:<id>:view`
   *  scoped permission için. Verilmezse domain-scoped permission atlanır. */
  domainId?: string | null
}): Promise<SyncOnCreateResult> {
  try {
    const { user, alreadyExisted } = await createUserWithEmail({
      email: input.email,
      password: input.password,
    })

    const defaultPerms = defaultMemberPermissions({
      email: input.email,
      domainId: input.domainId,
    })

    const existingMember = await companyMemberModel.findByCompanyAndUser(
      input.companyId,
      user.id,
    )

    if (existingMember) {
      // Mevcut üye → default set'in içerdiği permission'lardan eksik
      // olanları ekle. Daha önce admin manuel kısmış olabilir, eklenenler
      // sadece o üyede henüz hiç olmayanlar.
      const next = new Set(existingMember.permissions ?? [])
      let added = false
      for (const p of defaultPerms) {
        if (!next.has(p)) {
          next.add(p)
          added = true
        }
      }
      if (added) {
        await companyMemberModel.updatePermissions(
          existingMember.id,
          Array.from(next) as Permission[],
        )
      }
      return {
        ok: true,
        existingUser: alreadyExisted,
        newMembership: false,
      }
    }

    await companyMemberModel.create({
      companyId: input.companyId,
      userId: user.id,
      role: "member",
      status: "active",
      permissions: defaultPerms,
    } as Omit<CompanyMember, "id" | "joinedAt" | "updatedAt">)

    return {
      ok: true,
      existingUser: alreadyExisted,
      newMembership: true,
    }
  } catch (err) {
    console.warn("[mailbox-sync] create failed:", err)
    return {
      ok: false,
      existingUser: false,
      newMembership: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Mailbox password update'ten sonra çağrılır. User varsa credential
 * account'ının parolasını güncel hash ile yazar; user yoksa silently
 * skip (mail-only kullanıcı, sync gereksiz).
 */
export async function syncOnMailboxPasswordChange(input: {
  email: string
  newPassword: string
}): Promise<{ ok: boolean; updated: boolean; error?: string }> {
  try {
    const updated = await setUserPasswordByEmail(input.email, input.newPassword)
    return { ok: true, updated }
  } catch (err) {
    console.warn("[mailbox-sync] password change failed:", err)
    return {
      ok: false,
      updated: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Mailbox silindikten sonra çağrılır:
 *  - User'ın **tüm** company-member kayıtlarında `inbox.mailbox:<email>`
 *    permission'ı varsa çıkar (mailbox sahibi başka company'lerde de
 *    aynı mailbox için permission'a sahip olabilir, hepsini temizle).
 *  - User account'unu **silme** (başka mailbox'ları/company member'lığı
 *    olabilir).
 *  - Member kaydında permission tükendiyse (boş array kaldıysa) member'ı
 *    silme — admin'in görmesi için boş kalır, manuel kaldırılabilir.
 */
export async function syncOnMailboxDelete(input: {
  email: string
}): Promise<{ ok: boolean; cleaned: number; error?: string }> {
  try {
    const userId = await findUserIdByEmail(input.email)
    if (!userId) return { ok: true, cleaned: 0 } // mail-only user, no-op

    const memberships = await companyMemberModel.findByUser(userId)
    const targetPerm = `inbox.mailbox:${input.email.toLowerCase()}`
    let cleaned = 0
    for (const m of memberships) {
      if (m.permissions?.includes(targetPerm as Permission)) {
        const next = m.permissions.filter((p) => p !== targetPerm)
        await companyMemberModel.updatePermissions(
          m.id,
          next as Permission[],
        )
        cleaned++
      }
    }
    return { ok: true, cleaned }
  } catch (err) {
    console.warn("[mailbox-sync] delete cleanup failed:", err)
    return {
      ok: false,
      cleaned: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Sentroy oturum kullanıcısı → Linear kimliği eşlemesi (triage mapping.server.ts
 * portu). Davranış birebir: e-posta Linear workspace üyesiyle eşleşirse "linear"
 * requester; eşleşmezse "proxy" (talepler API-key sahibi adına açılır, atıf
 * bloğu kimliği taşır). buildProxyHeader metinleri AYNEN korunur — panel
 * tespit filtreleri (ATTRIBUTION_SIGNATURE_*) bu metinlere bağlıdır.
 */

import { findLinearUserByEmail } from "./users"
import type { LinearContext } from "./context"

/**
 * Sentroy better-auth session'ındaki kullanıcının bize gereken alt kümesi
 * (triage'daki AppUser karşılığı). Route'lar `session.user`'ı doğrudan geçirir.
 */
export type PanelUser = {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

export type ResolvedRequester =
  | {
      kind: "linear"
      linearUserId: string
      displayName: string
      email: string
      avatarUrl?: string | null
    }
  | {
      kind: "proxy"
      displayName: string
      email: string
      appUserId: string
      avatarUrl?: string | null
    }

export async function resolveRequester(
  ctx: LinearContext,
  user: PanelUser,
): Promise<ResolvedRequester> {
  const email = user.email ?? ""
  if (email) {
    const linearUser = await findLinearUserByEmail(ctx, email)
    if (linearUser) {
      return {
        kind: "linear",
        linearUserId: linearUser.id,
        displayName: linearUser.name,
        email: linearUser.email,
        avatarUrl: linearUser.avatarUrl,
      }
    }
  }
  return {
    kind: "proxy",
    displayName: user.name || email || "Anonim",
    email,
    appUserId: user.id,
    avatarUrl: user.image ?? null,
  }
}

/**
 * Talebin açıklamasının başına eklenen atıf bloğu. Hiçbir görünmez işaretçi
 * içermez — panel tespiti yapısal attachment + bu imzayla yapılır. Yalnız temiz
 * bir blockquote döner; Linear Lite görünümünde stripProxyHeader ile gizlenir,
 * Linear'da ise düzgün bir "kim açtı" notu olarak kalır.
 */
export function buildProxyHeader(requester: ResolvedRequester): string {
  // E-posta yoksa boş "()" basma.
  const email = requester.email ? ` (${requester.email})` : ""
  if (requester.kind === "linear") {
    return `> Submitted by **${requester.displayName}**${email}`
  }
  return [
    `> Submitted: **${requester.displayName}**${email}`,
    `> App User: ${requester.appUserId}`,
  ].join("\n")
}

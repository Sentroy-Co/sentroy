/**
 * Erişim + atıf temizleme yardımcıları (triage access.server.ts portu,
 * birebir — pure fonksiyonlar, ctx gerekmez).
 */

import type { Issue } from "./types"
import type { ResolvedRequester } from "./mapping"
import {
  LEGACY_PROXY_HEADER_OPEN,
  LEGACY_PROXY_HEADER_CLOSE,
} from "./constants"

/**
 * Dashboard workspace scope'a geçtiğinden bu yana authenticated kullanıcılar
 * tüm Linear workspace'ini görebilir. Detay sayfasının erişim kontrolü
 * Linear'ın kendi yetkilendirmesine bırakılır — burada her zaman true.
 *
 * Imza requester argümanıyla korunuyor ki ileride per-issue politika
 * gerekirse tek nokta yeter.
 */
export function canViewIssue(
  _issue: Issue,
  _requester: ResolvedRequester,
): boolean {
  return true
}

function stripBetween(
  description: string,
  open: string,
  close: string,
): string | null {
  const start = description.indexOf(open)
  const end = description.indexOf(close)
  if (start < 0 || end < 0 || end < start) return null
  return description.slice(end + close.length).replace(/^\s+/, "")
}

export function stripProxyHeader(description: string | null): string {
  if (!description) return ""
  // Legacy talepler (v1.5.0 ve öncesi) description'da `<!-- ... -->` çifti
  // taşır — varsa o aralığı kaldır.
  const byLegacy = stripBetween(
    description,
    LEGACY_PROXY_HEADER_OPEN,
    LEGACY_PROXY_HEADER_CLOSE,
  )
  if (byLegacy !== null) return byLegacy
  // Yeni talepler işaretçisizdir: baştaki atıf blockquote'unu temizle ki
  // panel görünümünde açıklama gövdesi tertemiz kalsın. Geçit,
  // buildProxyHeader'ın ürettiği şekle bağlı — gevşek bir substring değil — ki
  // kullanıcının yapıştırdığı meşru bir blockquote (içinde "Submitted by" geçse
  // bile) yanlışlıkla silinmesin. E-posta parantezi OPSİYONEL: e-postasız
  // proxy'de yok ("> Submitted: **Ad**"), web proxy'de var ("(email)"). Yeni
  // proxy imzası "Submitted:" — eski talepler "Submitted on behalf of" taşır;
  // ikisini de tut.
  const lead = description.match(/^\s*((?:>[^\n]*(?:\n|$))+)/)
  if (
    lead &&
    /^>\s*Submitted(?: by| on behalf of|:) \*\*[^*]+\*\*( \([^)]+\))?/.test(lead[1])
  ) {
    let rest = description.slice(lead[0].length).replace(/^\s+/, "")
    // Linear blockquote'u boş satırlarla bölmüş olabilir; proxy atıfının
    // devam satırları (Source: / App User:) gövdeye sızmasın diye onları da
    // temizle. Bilinen önekediğine sabitli — kullanıcının kendi blockquote'u
    // yenmez. (App User satırı kullanıcı id'si taşır; sızmaması önemli.)
    rest = rest.replace(
      /^(?:>\s*(?:Source:|App User:)[^\n]*(?:\n|$)|\s*\n)+/,
      "",
    )
    return rest.replace(/^\s+/, "")
  }
  return description
}

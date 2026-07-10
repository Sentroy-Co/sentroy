import dns from "dns/promises"
import { assertPublicUrl } from "@workspace/console/lib/ssrf"
import type { DomainConnectSettings } from "./types"

/**
 * Step 1 (DC spec §3 — DNS-based discovery): user'ın domain'inde
 * `_domainconnect.<domain>` TXT kaydını sorgula. Değer DNS provider'ın
 * Domain Connect endpoint hostname'i — Cloudflare için
 * `domainconnect.cloudflare.com`, GoDaddy için `domainconnect.godaddy.com`,
 * vb. Bu host üzerinden settings + apply URL'leri inşa edilir.
 *
 * **Karıştırma uyarısı:** `_dcpubkeyv1.<sentroy.com>` (Sentroy'un syncPubKey
 * TXT'si) ile `_domainconnect.<user-domain>` (DNS provider'ın discovery
 * TXT'si) iki tamamen farklı kayıt. İlki sentroy.com'da, ikincisi
 * user'ın yönetilen domain'inde yaşar. Önceki sürüm yanlışlıkla
 * `_dcpubkeyv1.<user-domain>`'i sorguladığı için Cloudflare-managed
 * domain'lerde discovery hep null dönüyordu.
 */
async function findDomainConnectHost(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveTxt(`_domainconnect.${domain}`)
    // TXT records come as string[][]; her chunk array bir TXT entry,
    // join ile birleşik string. Birden fazla TXT kaydı olabilir,
    // ilk anlamlı (host-benzeri) değeri al.
    for (const record of records) {
      const value = record.join("").trim().replace(/^"|"$/g, "")
      if (value) return value
    }
    return null
  } catch {
    return null
  }
}

/**
 * Step 2: Query the Domain Connect settings endpoint
 * to get provider capabilities and sync UX URL.
 */
async function fetchSettings(
  host: string,
  domain: string,
): Promise<DomainConnectSettings | null> {
  try {
    const url = `https://${host}/v2/${encodeURIComponent(domain)}/settings`
    // SSRF guard: discovery host'u DNS TXT'den (domain sahibi kontrolünde)
    // geliyor — iç servise/metadata'ya yönlenmesini engelle.
    await assertPublicUrl(url)
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const json = await res.json()
    if (!json.providerName || !json.urlSyncUX) return null
    return {
      providerName: json.providerName,
      urlSyncUX: json.urlSyncUX,
      urlAsyncUX: json.urlAsyncUX,
      urlAPI: json.urlAPI,
      width: json.width,
      height: json.height,
    }
  } catch {
    return null
  }
}

/**
 * Full discovery: resolves TXT record, fetches settings.
 * Returns null if Domain Connect is not supported for this domain.
 */
export async function discoverDomainConnect(
  domain: string,
): Promise<DomainConnectSettings | null> {
  const host = await findDomainConnectHost(domain)
  if (!host) return null
  return fetchSettings(host, domain)
}

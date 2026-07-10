import type { TemplateVars } from "./types"

interface DnsRecord {
  type: string
  name: string
  value: string
}

/**
 * Parse rendered DNS records back into Domain Connect template variables.
 * The record format is deterministic since Sentroy controls getDnsRecords().
 */
export function extractTemplateVars(
  records: DnsRecord[],
  domain: string,
): TemplateVars | null {
  let serverIp = ""
  let dkimSelector = ""
  let dkimPublicKey = ""
  let dmarcEmail = ""

  // A record (apex) — bazı template'lerde SPF içinde IP olmuyor, mail
  // server doğrudan A kaydı ile veriyor. SPF yoksa A'dan extract et.
  let apexA = ""

  for (const r of records) {
    if (r.type === "A" && (r.name === "" || r.name === "@" || r.name === domain)) {
      if (!apexA) apexA = r.value
    }

    // SPF: "v=spf1 ip4:{ip} ~all" — quotes etrafta olabilir
    const txtValue = r.type === "TXT" ? r.value.replace(/^"|"$/g, "") : ""

    if (r.type === "TXT" && txtValue.startsWith("v=spf1")) {
      const match = txtValue.match(/ip4:([^\s]+)/)
      if (match) serverIp = match[1]
    }

    // DKIM: name = "{selector}._domainkey" ya da "{selector}._domainkey.{domain}"
    //       (mail-server bazen FQDN, bazen relative dönüyor)
    if (r.type === "TXT" && txtValue.startsWith("v=DKIM1")) {
      const nameMatch = r.name.match(/^([^.]+)\._domainkey(?:\.|$)/)
      if (nameMatch) dkimSelector = nameMatch[1]

      // DKIM key chunked TXT olabilir — "..." "..." şeklinde gelir;
      // join yapıp etrafını temizle, sonra p= yakala. p='nin bittiği
      // yer ya satır sonu, ya `;` ya da `"`.
      const cleanValue = txtValue.replace(/"\s*"/g, "")
      const keyMatch = cleanValue.match(/p=([A-Za-z0-9+/=]+)/)
      if (keyMatch) dkimPublicKey = keyMatch[1]
    }

    // DMARC: "v=DMARC1; ... rua=mailto:{email} ..."
    if (r.type === "TXT" && txtValue.startsWith("v=DMARC1")) {
      const mailMatch = txtValue.match(/rua=mailto:([^\s;]+)/)
      if (mailMatch) dmarcEmail = mailMatch[1]
    }
  }

  // Fallback'lar — eksik kayıtları rejecte etmeden dolduruyoruz ki
  // mail-server hangi varianta dönerse dönsün template inşa edilebilsin.
  if (!serverIp && apexA) serverIp = apexA
  if (!dmarcEmail) dmarcEmail = `dmarc@${domain}`

  if (!serverIp || !dkimSelector || !dkimPublicKey) return null

  return { serverIp, dkimSelector, dkimPublicKey, dmarcEmail }
}

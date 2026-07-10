import { NextRequest } from "next/server"
import { jsonError, jsonSuccess } from "@workspace/console/lib/api-helpers"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"
import { discoverDomainConnect } from "@/lib/domain-connect/discovery"
import { extractTemplateVars } from "@/lib/domain-connect/extract-vars"
import { buildApplyUrl } from "@/lib/domain-connect/apply-url"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const domainName = request.nextUrl.searchParams.get("domain")
  const domainId = request.nextUrl.searchParams.get("domainId")

  if (!domainName) return jsonError("domain query param is required")
  if (!domainId) return jsonError("domainId query param is required")

  const result = await getSentroyForCompany(request, slug, "domains.edit")
  if ("error" in result && result.error) return result.error

  // Step 1: Discover Domain Connect support
  const settings = await discoverDomainConnect(domainName)
  if (!settings) {
    // `_domainconnect.<domain>` TXT kaydı yok ya da provider settings
    // endpoint'i 4xx/5xx döndü. Domain ya managed-DNS kullanmıyor (örn.
    // self-hosted nameserver) ya da provider DC desteklemiyor.
    console.warn(
      `[domain-connect/discover] no provider for ${domainName} — _domainconnect TXT missing or settings 4xx/5xx`,
    )
    return jsonSuccess({
      supported: false,
      reason: "discovery_failed",
      reasonHint:
        "DNS provider'ın Domain Connect desteği bulunamadı (_domainconnect TXT yok ya da provider settings yanıtlamıyor).",
    })
  }

  // Step 2: Fetch DNS records to extract template variables
  try {
    const dns = await result.sentroy!.domains.getDnsRecords(domainId)
    const records = dns.data ?? []

    if (records.length === 0) {
      console.warn(
        `[domain-connect/discover] mail-server returned 0 DNS records for domainId=${domainId}`,
      )
      return jsonSuccess({
        supported: false,
        reason: "no_records",
        reasonHint:
          "Mail-server bu domain için henüz DNS kaydı üretmedi. Provisioning'i tekrar deneyin.",
      })
    }

    const vars = extractTemplateVars(
      records.map((r: { type: string; name: string; value: string }) => ({
        type: r.type,
        name: r.name,
        value: r.value,
      })),
      domainName,
    )

    if (!vars) {
      // Hangi alan eksik — debug için record özetini logla.
      const types = records.map((r: { type: string }) => r.type).join(",")
      console.warn(
        `[domain-connect/discover] extractTemplateVars returned null for ${domainName} — record types: [${types}]`,
      )
      return jsonSuccess({
        supported: false,
        reason: "vars_missing",
        reasonHint:
          "Sentroy DNS kayıtlarından SPF/DKIM bilgileri çözümlenemedi (mail-server provisioning eksik olabilir).",
      })
    }

    // Build callback URL — Mailcheap → kullanıcı → mail API. `nextUrl.origin`
    // standalone'da bind address'i (`0.0.0.0:3001`) verir, public URL'i değil.
    const origin =
      process.env.NEXT_PUBLIC_MAIL_APP_URL || request.nextUrl.origin
    const callbackUrl = `${origin}/api/companies/${slug}/domain-connect/callback?domainId=${domainId}`

    const applyUrl = await buildApplyUrl(settings, domainName, vars, callbackUrl)

    return jsonSuccess({
      supported: true,
      providerName: settings.providerName,
      applyUrl,
      width: settings.width,
      height: settings.height,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith("signing_failed:")) {
      // Apply-url private key'i parse etti ama imza math fail —
      // genelde key tipi yanlış (RSA değil), boyut < 2048, ya da
      // OpenSSL FIPS modunda kısıtlı. Key'i 2048-bit RSA PKCS#1 ile
      // tekrar üretmek genelde çözer.
      console.error(
        `[domain-connect/discover] signing failed for ${domainName}: ${msg}`,
      )
      return jsonSuccess({
        supported: false,
        reason: "signing_failed",
        reasonHint:
          "Apply URL imzalanamadı. DOMAIN_CONNECT_PRIVATE_KEY env'i geçerli bir 2048-bit RSA PEM olmalı (PKCS#1 ya da PKCS#8). Sunucu loguna detay yazıldı.",
      })
    }
    console.error(
      `[domain-connect/discover] unexpected error for ${domainName}:`,
      msg,
    )
    return jsonSuccess({
      supported: false,
      reason: "exception",
      reasonHint:
        "Domain Connect inşası sırasında beklenmedik hata. Sunucu loglarını kontrol edin.",
    })
  }
}

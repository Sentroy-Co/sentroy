import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * GET /api/whois?domain=<domain> — RDAP (Registration Data Access Protocol)
 * üzerinden domain kayıt verisi. WHOIS/RDAP'in CORS'u yok → server-side.
 * rdap.org bootstrap'i yetkili registry RDAP sunucusuna yönlendirir; tüm gTLD
 * (.com/.net/.org/.io/.dev/.app…) + birçok ccTLD destekli. Yanıt normalize
 * edilir (registrar, tarihler, status, nameserver, DNSSEC, abuse). Mongo/secret
 * kullanmaz; core'a rewrite EDİLMEZ (downloader serve eder).
 */

const TIMEOUT_MS = 9000
const MAX_BYTES = 256 * 1024

// Domain etiketleri + en az bir nokta + geçerli TLD (harf, ≥2). IDN punycode kabul.
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

function normalizeDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase()
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/\.$/, "")
  if (!DOMAIN_RE.test(d)) return null
  return d
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

/** vcardArray'den bir alanı çıkar (["vcard",[["fn",{},"text","..."]]]). */
function vcard(entity: Json, field: string): string | null {
  const arr = entity?.vcardArray?.[1]
  if (!Array.isArray(arr)) return null
  for (const row of arr) {
    if (Array.isArray(row) && row[0] === field) {
      const v = row[3]
      if (typeof v === "string") return v
      if (Array.isArray(v)) return v.filter(Boolean).join(", ")
    }
  }
  return null
}

function findEntity(entities: Json[], role: string): Json | null {
  for (const e of entities ?? []) {
    if (Array.isArray(e?.roles) && e.roles.includes(role)) return e
    const nested = e?.entities ? findEntity(e.entities, role) : null
    if (nested) return nested
  }
  return null
}

function eventDate(events: Json[], action: string): string | null {
  const e = (events ?? []).find((x) => x?.eventAction === action)
  return e?.eventDate ?? null
}

export async function GET(request: NextRequest) {
  const raw = new URL(request.url).searchParams.get("domain")
  if (!raw) return NextResponse.json({ error: "domain_required" }, { status: 400 })
  const domain = normalizeDomain(raw)
  if (!domain) return NextResponse.json({ error: "invalid_domain" }, { status: 400 })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "application/rdap+json, application/json", "user-agent": "SentroyWhois/1.0 (+https://tools.sentroy.com)" },
    })

    if (res.status === 404) {
      return NextResponse.json({ error: "not_found", domain }, { status: 404 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: "rdap_unavailable", domain, status: res.status }, { status: 502 })
    }

    // Boyut sınırlı okuma
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "response_too_large" }, { status: 502 })
    const data = JSON.parse(new TextDecoder().decode(buf)) as Json

    const entities: Json[] = data.entities ?? []
    const registrar = findEntity(entities, "registrar")
    const abuse = registrar?.entities ? findEntity(registrar.entities, "abuse") : findEntity(entities, "abuse")
    const registrant = findEntity(entities, "registrant")

    const registrarUrl =
      (registrar?.links ?? []).find((l: Json) => l?.rel === "about" || l?.value)?.href ?? vcard(registrar, "url") ?? null
    const ianaId =
      (registrar?.publicIds ?? []).find((p: Json) => /iana/i.test(p?.type ?? ""))?.identifier ?? null

    const result = {
      domain,
      ldhName: data.ldhName ?? domain.toUpperCase(),
      registrar: registrar
        ? {
            name: vcard(registrar, "fn"),
            ianaId,
            url: registrarUrl,
            abuseEmail: abuse ? vcard(abuse, "email") : null,
            abusePhone: abuse ? vcard(abuse, "tel")?.replace(/^tel:/, "") ?? null : null,
          }
        : null,
      events: {
        registration: eventDate(data.events, "registration"),
        expiration: eventDate(data.events, "expiration"),
        lastChanged: eventDate(data.events, "last changed"),
        transfer: eventDate(data.events, "transfer"),
      },
      status: Array.isArray(data.status) ? (data.status as string[]) : [],
      nameservers: (data.nameservers ?? []).map((n: Json) => (n?.ldhName ?? "").toLowerCase()).filter(Boolean),
      dnssec: typeof data.secureDNS?.delegationSigned === "boolean" ? data.secureDNS.delegationSigned : null,
      registrantOrg: registrant ? vcard(registrant, "org") ?? vcard(registrant, "fn") : null,
    }

    return NextResponse.json(result, { headers: { "cache-control": "public, max-age=300" } })
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError"
    return NextResponse.json({ error: aborted ? "timeout" : "rdap_unavailable" }, { status: 502 })
  } finally {
    clearTimeout(timer)
  }
}

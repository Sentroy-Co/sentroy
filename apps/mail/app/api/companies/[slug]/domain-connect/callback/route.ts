export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { getSentroyForCompany } from "@/lib/sentroy-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const domainId = request.nextUrl.searchParams.get("domainId")
  const error = request.nextUrl.searchParams.get("error")

  // Determine redirect base — find lang from referer or default to "en"
  const referer = request.headers.get("referer") || ""
  const langMatch = referer.match(/\/([a-z]{2})\/d\//)
  const lang = langMatch?.[1] || "en"
  const domainsUrl = `/${lang}/d/${slug}/domains`

  // `nextUrl.origin` standalone'da bind address'i (`0.0.0.0:3001`) verir.
  // Public URL'i env'den al ki tarayıcı doğru subdomain'e yönlensin.
  const publicOrigin =
    process.env.NEXT_PUBLIC_MAIL_APP_URL || request.nextUrl.origin

  if (error) {
    return NextResponse.redirect(
      new URL(`${domainsUrl}?dc_error=1`, publicOrigin),
    )
  }

  // Trigger domain verification
  if (domainId) {
    try {
      const result = await getSentroyForCompany(request, slug)
      if (!("error" in result) || !result.error) {
        await result.sentroy!.domains.verify(domainId)
      }
    } catch {
      // Verification failure is non-fatal — background verifier will retry
    }
  }

  return NextResponse.redirect(
    new URL(`${domainsUrl}?dc_success=1`, publicOrigin),
  )
}

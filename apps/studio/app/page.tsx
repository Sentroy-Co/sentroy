import { redirect } from "next/navigation"
import { headers } from "next/headers"

/**
 * Root URL → locale redirect. Önceden `proxy.ts` (eski `middleware.ts`)
 * üzerinden yapılıyordu; Next 16.2.6 Turbopack bundling sırasında proxy
 * dosyasında panic ("Expected file content for file" /
 * `MiddlewareEndpoint::node_chunk failed`) veriyor. Server Component
 * `redirect()` ile aynı UX, build OK.
 *
 * Accept-Language Turkish → /tr, diğer hepsi → /en.
 */
export default async function RootRedirect() {
  const accept = (await headers()).get("accept-language") ?? ""
  const locale = accept.toLowerCase().startsWith("tr") ? "tr" : "en"
  redirect(`/${locale}`)
}

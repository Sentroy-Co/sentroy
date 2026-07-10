import { buildCurl, buildUrl, type HttpMethod } from "../lib/endpoint-catalog"
import { TOKEN_PLACEHOLDER, SLUG_PLACEHOLDER } from "../lib/placeholders"
import { CodeTabsServer } from "./code-tabs-server"
import type { SupportedLang } from "../lib/highlight"
import { Endpoint } from "./docs-ui"

type EndpointExampleProps = {
  /** HTTP method — drives whether a body is rendered in the cURL. */
  method: HttpMethod
  /** Which gateway prefix the URL is built against. */
  service: "mail" | "storage" | "whatsapp"
  /** Path relative to the company prefix (e.g. `/domains`, `/buckets/{slug}`). */
  path: string
  /** TypeScript snippet shown on the first tab. */
  ts: string
  /** Optional Go SDK snippet. */
  go?: string
  /** Optional Python SDK snippet. */
  python?: string
  /** Optional PHP SDK snippet. */
  php?: string
  /** Optional JSON body — mirrored verbatim into the cURL `--data`. */
  body?: string
  /** Override the default `bash` cURL with a hand-written one (rare). */
  curl?: string
  /** Hide the method/path badge — useful when the parent section already shows one. */
  hideEndpoint?: boolean
}

const SERVICE_PREFIX = {
  mail: "/api/mail/companies/{slug}",
  storage: "/api/storage/companies/{slug}",
  whatsapp: "/api/whatsapp/companies/{slug}",
} as const

/**
 * Multi-tab code block: TypeScript / Go / Python / PHP / cURL, preceded
 * by the request method/path badge. Go/Python/PHP tabs only render when
 * a snippet is supplied; the cURL is generated from the same metadata
 * the cURL generator page uses, so placeholder substitution and shell
 * formatting stay consistent across the site.
 */
export async function EndpointExample({
  method,
  service,
  path,
  ts,
  go,
  python,
  php,
  body,
  curl,
  hideEndpoint,
}: EndpointExampleProps) {
  const url = buildUrl(
    { id: "_", group: "Mail", label: "_", method, path, service },
    SLUG_PLACEHOLDER,
  )
  const generatedCurl =
    curl ??
    buildCurl({
      method,
      url,
      token: TOKEN_PLACEHOLDER,
      body: method === "GET" ? null : (body ?? null),
    })

  type Tab = { label: string; lang: SupportedLang; code: string }
  const tabs: Tab[] = [{ label: "TypeScript", lang: "ts", code: ts }]
  if (go) tabs.push({ label: "Go", lang: "go", code: go })
  if (python) tabs.push({ label: "Python", lang: "python", code: python })
  if (php) tabs.push({ label: "PHP", lang: "php", code: php })
  tabs.push({ label: "cURL", lang: "bash", code: generatedCurl })

  return (
    <>
      {!hideEndpoint ? (
        <Endpoint method={method} path={`${SERVICE_PREFIX[service]}${path}`} />
      ) : null}
      <CodeTabsServer tabs={tabs} />
    </>
  )
}

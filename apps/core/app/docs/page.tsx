import type { Metadata } from "next"
import Link from "next/link"
import { CodeBlock, InlineCode } from "./components/code-block"
import { CodeTabsServer } from "./components/code-tabs-server"
import { Callout, Endpoint, Lede, Para, Section, Sub } from "./components/docs-ui"
import { PageFooter } from "./components/page-footer"

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Get started with the Sentroy platform — install an SDK, authenticate with an access token, and send your first request.",
}

const SDKS = [
  {
    name: "TypeScript / Node.js",
    install: "npm install @sentroy-co/client-sdk",
    href: "https://www.npmjs.com/package/@sentroy-co/client-sdk",
    badge: "npm",
  },
  {
    name: "Go",
    install: "go get github.com/Sentroy-Co/client-sdk/go",
    href: "https://pkg.go.dev/github.com/Sentroy-Co/client-sdk/go",
    badge: "go",
  },
  {
    name: "Python",
    install: "pip install sentroy-client-sdk",
    href: "https://pypi.org/project/sentroy-client-sdk/",
    badge: "pypi",
  },
  {
    name: "PHP",
    install: "composer require sentroy-co/client-sdk",
    href: "https://packagist.org/packages/sentroy-co/client-sdk",
    badge: "packagist",
  },
] as const

export default function DocsOverviewPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sentroy API
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Build on Sentroy</h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            One platform for transactional mail, inboxes, and media storage — accessed through a single
            access token and a single SDK entry point.
          </p>
        </div>
      </header>

      <Section
        id="installation"
        title="Installation"
        description="Pick the SDK that matches your runtime. Every SDK exposes the same resources and method shape — your code looks the same across languages."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {SDKS.map((sdk) => (
            <a
              key={sdk.name}
              href={sdk.href}
              target="_blank"
              rel="noreferrer"
              className="group rounded-xl border border-border p-4 transition hover:border-foreground/40"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-foreground">{sdk.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {sdk.badge}
                </span>
              </div>
              <code className="block truncate font-mono text-[12.5px] text-muted-foreground">{sdk.install}</code>
            </a>
          ))}
          <a
            href="https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/curl/README.md"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-dashed border-border p-4 transition hover:border-foreground/40"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-foreground">cURL</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">raw</span>
            </div>
            <code className="block truncate font-mono text-[12.5px] text-muted-foreground">
              curl -H &quot;Authorization: Bearer stk_…&quot; …
            </code>
          </a>
        </div>
      </Section>

      <Section
        id="quickstart"
        title="Quick start"
        description={
          <>
            Configure a client with your platform URL, company slug, and a Bearer access token. The same
            client handles mail and storage — the SDK routes calls to the right subdomain transparently.
          </>
        }
      >
        <CodeTabsServer
          tabs={[
            {
              label: "TypeScript",
              lang: "ts",
              code: `import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "my-company",
  accessToken: "stk_...",
})

// Send your first email
await sentroy.send.email({
  to: "user@example.com",
  from: "info@example.com",
  domainId: "domain-id",
  subject: "Hello from Sentroy",
  html: "<h1>It works.</h1>",
})`,
            },
            {
              label: "Go",
              lang: "go",
              code: `import sentroy "github.com/Sentroy-Co/client-sdk/go"

client := sentroy.New(sentroy.Config{
    BaseURL:     "https://sentroy.com",
    CompanySlug: "my-company",
    AccessToken: "stk_...",
})

_, err := client.Send.Email(ctx, sentroy.SendInput{
    To:       []string{"user@example.com"},
    From:     "info@example.com",
    DomainID: "domain-id",
    Subject:  "Hello from Sentroy",
    HTML:     "<h1>It works.</h1>",
})`,
            },
            {
              label: "Python",
              lang: "python",
              code: `from sentroy import Sentroy

sentroy = Sentroy(
    base_url="https://sentroy.com",
    company_slug="my-company",
    access_token="stk_...",
)

sentroy.send.email(
    to="user@example.com",
    from_="info@example.com",
    domain_id="domain-id",
    subject="Hello from Sentroy",
    html="<h1>It works.</h1>",
)`,
            },
            {
              label: "PHP",
              lang: "php",
              code: `use Sentroy\\ClientSdk\\Sentroy;

$sentroy = new Sentroy([
    'base_url'     => 'https://sentroy.com',
    'company_slug' => 'my-company',
    'access_token' => 'stk_...',
]);

$sentroy->send->email([
    'to'        => 'user@example.com',
    'from'      => 'info@example.com',
    'domain_id' => 'domain-id',
    'subject'   => 'Hello from Sentroy',
    'html'      => '<h1>It works.</h1>',
]);`,
            },
            {
              label: "cURL",
              lang: "bash",
              code: `curl -X POST https://sentroy.com/api/companies/my-company/send \\
  -H "Authorization: Bearer stk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "user@example.com",
    "from": "info@example.com",
    "domainId": "domain-id",
    "subject": "Hello from Sentroy",
    "html": "<h1>It works.</h1>"
  }'`,
            },
          ]}
        />
        <Callout title="Continue with a resource">
          Mail, storage, and React components each have a dedicated reference page in the sidebar — start with{" "}
          <Link href="/docs/mail">Mail</Link> if you&apos;re sending email, or{" "}
          <Link href="/docs/storage">Storage</Link> for files and media.
        </Callout>
      </Section>

      <Section
        id="authentication"
        title="Authentication"
        description={
          <>
            Every API request authenticates with a Bearer access token. Create one from{" "}
            <strong>Admin → Access Tokens</strong> in your Sentroy dashboard. Tokens are scoped to a single
            company and inherit that company&apos;s permissions.
          </>
        }
      >
        <CodeBlock
          lang="http"
          code={`Authorization: Bearer stk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
        />

        <Sub title="SDK base URL">
          <Para>
            SDKs only need the platform root (<InlineCode>https://sentroy.com</InlineCode>) — the
            <InlineCode>/api/companies/&#123;slug&#125;</InlineCode> prefix is built automatically from your
            <InlineCode>companySlug</InlineCode> config. Calls to mail or storage resources are routed to the
            correct subdomain by the gateway.
          </Para>
        </Sub>

        <Sub title="Raw HTTP base URL">
          <Endpoint method="GET" path="https://sentroy.com/api/companies/{company-slug}" />
          <Para>
            If you&apos;re calling the API directly with cURL or another HTTP client, every endpoint below is
            relative to this base.
          </Para>
        </Sub>

        <Callout variant="warning" title="Token format">
          Access tokens always start with <InlineCode>stk_</InlineCode>. The plaintext value is shown only once
          at creation — if you lose it, rotate it.
        </Callout>
      </Section>

      <Section
        id="errors"
        title="Error handling"
        description="All endpoints return a consistent envelope. SDKs throw a typed error class with the same fields."
      >
        <CodeBlock
          lang="jsonc"
          code={`{
  "data": null,
  "error": "Human-readable error message",
  "statusCode": 401
}`}
        />
        <Sub title="Catching errors in TypeScript">
          <CodeBlock
            lang="ts"
            code={`import { Sentroy, SentroyError } from "@sentroy-co/client-sdk"

try {
  await sentroy.send.email({ /* ... */ })
} catch (err) {
  if (err instanceof SentroyError) {
    console.error(err.statusCode) // 401, 403, 500, etc.
    console.error(err.message)    // Human-readable error
  }
}`}
          />
        </Sub>
        <Sub title="Common status codes">
          <ul className="my-3 list-none space-y-2 text-[14px] text-muted-foreground">
            <li>
              <code className="font-mono text-foreground">400</code> — invalid request payload
            </li>
            <li>
              <code className="font-mono text-foreground">401</code> — missing or invalid token
            </li>
            <li>
              <code className="font-mono text-foreground">403</code> — token lacks the required permission
            </li>
            <li>
              <code className="font-mono text-foreground">404</code> — resource (or company) not found
            </li>
            <li>
              <code className="font-mono text-foreground">409</code> — conflict (duplicate slug, non-empty
              bucket, etc.)
            </li>
            <li>
              <code className="font-mono text-foreground">429</code> — rate limit exceeded
            </li>
            <li>
              <code className="font-mono text-foreground">5xx</code> — Sentroy-side error; safe to retry with
              backoff
            </li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="ai-agents"
        title="For AI agents"
        description="Plain-text mirrors of every SDK README, so coding agents can ingest the full surface in one fetch."
      >
        <Lede>Point your agent at any of the URLs below — they redirect to the canonical Markdown source.</Lede>
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-semibold">SDK</th>
                <th className="px-4 py-2.5 font-semibold">Raw URL</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["TypeScript", "typescript/README.md"],
                ["Go", "go/README.md"],
                ["Python", "python/README.md"],
                ["PHP", "php/README.md"],
                ["cURL", "curl/README.md"],
              ].map(([label, path]) => (
                <tr key={path} className="border-b border-border/60 last:border-b-0">
                  <td className="px-4 py-3 font-medium text-foreground">{label}</td>
                  <td className="px-4 py-3 font-mono text-[12.5px]">
                    <a
                      className="text-foreground underline-offset-2 hover:underline"
                      href={`https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/${path}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      raw.githubusercontent.com/…/{path}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <PageFooter current="/docs" />
    </article>
  )
}

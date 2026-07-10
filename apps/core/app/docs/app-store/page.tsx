import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { Callout, Lede, Para, Section, Sub } from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "Sentroy App Store — publish your app to Sentroy OS",
  description:
    "Publish a third-party app into Sentroy OS as a sandboxed iframe. Manifest format, secure identity handoff via short-lived signed tokens, origin verification, and review process.",
}

const MANIFEST = `{
  "manifestVersion": 1,
  "identity": {
    "id": "resend",
    "name": "Resend",
    "version": "1.0.0",
    "tagline": "Email for developers"
  },
  "appearance": {
    "logoUrl": "https://app.resend.com/logo.png",
    "color": "#0f0f0f",
    "category": "developer-tools",
    "screenshots": [{ "url": "https://…", "alt": "Dashboard", "width": 1280, "height": 800 }]
  },
  "embed": {
    "url": "https://app.resend.com/sentroy",
    "injectedParams": ["lang", "fallbackLang", "theme", "companySlug", "token"],
    "sandbox": { "allowForms": true, "allowPopups": false },
    "minHeight": 480
  },
  "auth": {
    "mode": "token",
    "jwksAudience": "https://app.resend.com"
  },
  "i18n": { "supportedLangs": ["en", "tr"], "fallbackLang": "en" },
  "store": {
    "description": "Send email with a developer-first API.",
    "longDescription": "Longer description, plain text.",
    "privacyUrl": "https://app.resend.com/privacy"
  },
  "developer": { "companySlug": "resend" },
  "pricing": { "model": "free" },
  "capabilities": { "requestsUserIdentity": true }
}`

const VERIFY = `import { createRemoteJWKSet, jwtVerify } from "jose"

// Sentroy publishes its public keys here.
const JWKS = createRemoteJWKSet(new URL("https://auth.sentroy.com/.well-known/jwks.json"))

export async function verifySentroyToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: "https://auth.sentroy.com",
    audience: "https://app.resend.com", // MUST equal your own origin
  })
  if (payload.typ !== "embed+jwt") throw new Error("not an embed token")
  // payload.sub = Sentroy user id, payload.companySlug = active company,
  // payload.email / name / picture present only if you requested those scopes.
  return payload
}`

const PARAMS = `// Inside your embedded page (e.g. https://app.resend.com/sentroy)
const params = new URLSearchParams(location.search)
const token = params.get("token")        // short-lived (<=60s) identity JWT
const lang = params.get("lang")           // active OS language
const company = params.get("companySlug") // active Sentroy company

// Strip the token from the URL so it doesn't linger in history.
if (token) history.replaceState(null, "", location.pathname)`

export default function AppStoreDocsPage() {
  return (
    <article>
      <header className="mb-12">
        <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Guide / App Store
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Publish to the Sentroy App Store</h1>
        <Lede>
          Bring your own web app into Sentroy OS. Your app keeps running on your servers; Sentroy embeds it as a
          sandboxed iframe and hands it a short-lived signed identity token — no passwords, no shared cookies.
        </Lede>
      </header>

      <Section id="overview" title="Overview">
        <Para>
          A Sentroy App Store app is described by a single manifest file (<InlineCode>{"<id>.sentroy-app.json"}</InlineCode>).
          When a user installs it, the app appears in their Sentroy OS and opens in a sandboxed iframe pointed at your{" "}
          <InlineCode>embed.url</InlineCode>. Your app authenticates the user with a token Sentroy injects into the
          iframe URL, then talks to its own backend as usual.
        </Para>
        <Callout variant="info" title="Your code stays yours">
          Sentroy never sees your source. The only thing crossing into your iframe is a ≤60-second signed token — never
          the Sentroy session cookie.
        </Callout>
      </Section>

      <Section id="manifest" title="The manifest">
        <Para>
          Author <InlineCode>{"<id>.sentroy-app.json"}</InlineCode>. The file name must match{" "}
          <InlineCode>identity.id</InlineCode>. The schema is the single source of truth (validated in CI); the key rules:
          all URLs are <InlineCode>https</InlineCode> (no IPs), <InlineCode>identity.version</InlineCode> is strict semver
          and must increase on every update, and for <InlineCode>auth.mode: &quot;token&quot;</InlineCode> the{" "}
          <InlineCode>jwksAudience</InlineCode> origin must equal your <InlineCode>embed.url</InlineCode> origin.
        </Para>
        <CodeBlock lang="json" code={MANIFEST} />
        <Sub id="auth-modes" title="Auth modes">
          <Para>
            <InlineCode>none</InlineCode> — no identity is passed. <InlineCode>token</InlineCode> — Sentroy injects a
            short-lived RS256 JWT (recommended for most apps). <InlineCode>oauth</InlineCode> — full OAuth 2.0 / OIDC
            authorization-code flow for account linking; an OAuth client is created for you on approval and you request
            only the scopes you need.
          </Para>
        </Sub>
      </Section>

      <Section id="submit" title="Submitting your app">
        <Para>
          Two ways, both landing in the same review queue:
        </Para>
        <Para>
          <strong>1. Pull request</strong> — open a PR to{" "}
          <a href="https://github.com/Sentroy-Co/sentroy-apps" className="underline" target="_blank" rel="noopener noreferrer">github.com/Sentroy-Co/sentroy-apps</a>{" "}
          adding <InlineCode>{"apps/<id>.sentroy-app.json"}</InlineCode>. CI validates the manifest against the schema.
        </Para>
        <Para>
          <strong>2. Dashboard</strong> — submit the manifest from your Sentroy company dashboard. Either way{" "}
          <InlineCode>developer.companySlug</InlineCode> must be a Sentroy company you own or administer — this binds
          every app to a verified identity and blocks impersonation.
        </Para>
        <Callout variant="info" title="Private apps">
          You can also upload a manifest privately in your dashboard — it appears only in your own OS, never the public
          store.
        </Callout>
      </Section>

      <Section id="verify-origin" title="Verifying your origin">
        <Para>
          Before an app goes live, Sentroy verifies you control the embed origin. Serve a file at:
        </Para>
        <CodeBlock lang="bash" code={"https://<your-embed-origin>/.well-known/sentroy-app-verification.txt"} />
        <Para>
          containing the token shown in your dashboard. The reviewer fetches it server-side and compares the first line.
        </Para>
      </Section>

      <Section id="embed-token" title="Reading & verifying the embed token">
        <Para>
          When <InlineCode>token</InlineCode> is in your <InlineCode>injectedParams</InlineCode>, Sentroy appends a fresh
          token to the iframe URL on every open. Read it, then verify it against Sentroy&apos;s JWKS.
        </Para>
        <CodeBlock lang="ts" code={PARAMS} />
        <Para>
          Verify the signature (RS256), the <InlineCode>iss</InlineCode>, and that <InlineCode>aud</InlineCode> equals
          your own origin — this rejects tokens minted for any other app.
        </Para>
        <CodeBlock lang="ts" code={VERIFY} />
        <Callout variant="warning" title="Token lifetime">
          The token expires in ≤60 seconds — verify it immediately and establish your own session. To refresh it without
          a reload, <InlineCode>postMessage</InlineCode> <InlineCode>{'{ type: "app:request-token-refresh" }'}</InlineCode>{" "}
          to the parent; Sentroy replies with <InlineCode>{'{ type: "sentroy:token", token }'}</InlineCode>.
        </Callout>
      </Section>

      <Section id="security" title="Security expectations">
        <Para>
          Your app runs in an iframe sandboxed with{" "}
          <InlineCode>allow-scripts allow-same-origin allow-forms</InlineCode> (never top-navigation or modals), and your
          origin is added to Sentroy&apos;s CSP allow-list on approval. Never rely on the token sitting in the URL —
          strip it after reading. All security-relevant values are computed server-side from your reviewed manifest, so
          editing the file at runtime cannot widen your privileges.
        </Para>
      </Section>

      <Section id="review" title="Review & versioning">
        <Para>
          After submission you receive email at each step (received → approved / changes requested). Updates bump{" "}
          <InlineCode>identity.version</InlineCode> (semver, monotonic) and re-enter review; the store keeps a version
          history. <InlineCode>manifestVersion</InlineCode> is a separate concept — it&apos;s the schema contract and you
          should not change it.
        </Para>
      </Section>

      <PageFooter current="/docs/app-store" />
    </article>
  )
}

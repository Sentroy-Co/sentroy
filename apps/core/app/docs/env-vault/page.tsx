import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { Callout, Lede, Para, Section, Sub } from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "Env Vault — config + secrets management",
  description:
    "Sentroy Env Vault is a Doppler / Infisical / AWS Secrets Manager alternative — runtime env management, CLI push/pull/diff, real-time webhook invalidation, public/private split. Bundled with the rest of the Sentroy platform.",
}

export default function EnvVaultDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / Env Vault
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Env Vault
          </h1>
          <Lede>
            Inject env into your deploy with a single bootstrap token; later
            changes don&apos;t need a rebuild. Use{" "}
            <InlineCode>getEnv()</InlineCode> on the server or{" "}
            <InlineCode>useEnv()</InlineCode> on the React side — public/private
            split is automatic.
          </Lede>
        </div>
      </header>

      <Section
        id="overview"
        title="Overview"
        description={
          <>
            Env Vault provides runtime env management for your
            applications. Instead of using <InlineCode>process.env</InlineCode>,
            your app authenticates to Sentroy core with a single API key and
            pulls every registered env. When an admin changes a value, your app
            picks it up after the cache TTL expires — no Docker rebuild
            required.
          </>
        }
      >
        <Sub title="Flow">
          <Para>
            <strong>1.</strong> Create a <InlineCode>project</InlineCode> in the
            Sentroy admin panel (e.g. <InlineCode>my-blog</InlineCode>).<br />
            <strong>2.</strong> Add environments (e.g. <InlineCode>dev</InlineCode>,{" "}
            <InlineCode>prod</InlineCode>) and variables under the project. Each
            variable carries a <InlineCode>public</InlineCode> flag.<br />
            <strong>3.</strong> Generate a token for the project + environment
            pair. The plaintext is shown only once.<br />
            <strong>4.</strong> Set the token as{" "}
            <InlineCode>SENTROY_ENV_API_KEY</InlineCode> in your deploy
            environment.<br />
            <strong>5.</strong> Use <InlineCode>getEnv(&quot;KEY&quot;)</InlineCode>{" "}
            or <InlineCode>useEnv(&quot;KEY&quot;)</InlineCode> in your app.
          </Para>
        </Sub>
      </Section>

      <Section
        id="bootstrap"
        title="Bootstrap"
        description="Single env: SENTROY_ENV_API_KEY. Everything else comes from the vault."
      >
        <CodeBlock
          lang="bash"
          code={`# Coolify (or any deploy environment)
SENTROY_ENV_API_KEY=stk_env_abcdef0123...
# Optional — defaults to https://sentroy.com
SENTROY_ENV_API_URL=https://sentroy.com`}
        />
        <Para>
          That&apos;s it. Every other env (DATABASE_URL, BETTER_AUTH_SECRET,
          NEXT_PUBLIC_TURNSTILE_SITE_KEY, etc.) lives in the Sentroy admin
          panel.
        </Para>
      </Section>

      <Section
        id="install"
        title="Install"
        description="The vault lives under the /vault subpath of @sentroy-co/client-sdk — same package as the mail/storage SDK."
      >
        <CodeBlock
          lang="bash"
          code={`npm install @sentroy-co/client-sdk`}
        />
      </Section>

      <Section
        id="server"
        title="Server-side: getEnv()"
        description="Async, in-memory cache (TTL 5 min). One HTTP fetch on first call — every subsequent call is in-process."
      >
        <CodeBlock
          lang="ts"
          code={`import { getEnv, getEnvOrThrow, preloadEnv } from "@sentroy-co/client-sdk/vault"

// Load early at process boot — fail-fast on missing envs
await preloadEnv()

// Async — returns undefined if the env is missing
const dbUrl = await getEnv("DATABASE_URL")

// Throws if missing — config-validation pattern
const stripeKey = await getEnvOrThrow("STRIPE_SECRET_KEY")`}
        />
        <Sub title="Cache">
          <Para>
            Default TTL is 5 minutes. For webhook- or admin-driven invalidation
            use <InlineCode>refreshEnvCache()</InlineCode>. To change the TTL at
            runtime use <InlineCode>setEnvCacheTTL(seconds)</InlineCode>.
          </Para>
        </Sub>
      </Section>

      <Section
        id="react"
        title="React: useEnv()"
        description="Inject public envs from a server component during SSR; the client useEnv() hook reads them synchronously."
      >
        <CodeBlock
          lang="tsx"
          code={`// app/layout.tsx (server component)
import { getPublicEnvs } from "@sentroy-co/client-sdk/vault"
import { EnvProvider } from "@sentroy-co/client-sdk/vault/react"

export default async function RootLayout({ children }) {
  const envs = await getPublicEnvs()
  return (
    <html>
      <body>
        <EnvProvider envs={envs}>{children}</EnvProvider>
      </body>
    </html>
  )
}`}
        />
        <CodeBlock
          lang="tsx"
          code={`// any client component
"use client"
import { useEnv } from "@sentroy-co/client-sdk/vault/react"

export function CaptchaWidget() {
  const siteKey = useEnv("TURNSTILE_SITE_KEY")
  if (!siteKey) return null
  return <Turnstile siteKey={siteKey} />
}`}
        />
        <Callout variant="warning">
          <strong>Public/private split:</strong> useEnv() only sees variables
          with <InlineCode>public: true</InlineCode>. Never pass{" "}
          <InlineCode>getAllEnvs()</InlineCode> to EnvProvider — server-only
          secrets would leak into the browser bundle.
        </Callout>
      </Section>

      <Section
        id="cli"
        title="CLI"
        description="Sync a local .env file to the vault from your terminal or CI."
      >
        <Para>
          The SDK ships a <InlineCode>sentroy</InlineCode> binary. After
          install it&apos;s available on <InlineCode>$PATH</InlineCode>;{" "}
          <InlineCode>npx sentroy ...</InlineCode> works without a global
          install. Auth uses the same{" "}
          <InlineCode>SENTROY_ENV_API_KEY</InlineCode> as{" "}
          <InlineCode>getEnv()</InlineCode> (or pass{" "}
          <InlineCode>--token=stk_env_...</InlineCode>). The token&apos;s
          (project, environment) scope is implicit.
        </Para>
        <CodeBlock
          lang="bash"
          code={`# Push local file to the vault. --delete-missing makes it a full sync;
# without it, push is upsert-only. The CLI prompts before deletes.
sentroy env push .env.production --delete-missing

# Show the diff but write nothing.
sentroy env push .env.production --dry-run

# Pull the vault into a local file. --force overwrites.
sentroy env pull .env.staging --force

# List keys (add --values for KEY=value, --public-only to filter).
sentroy env list --values`}
        />
        <Callout variant="warning">
          <strong>Write permission required:</strong>{" "}
          <InlineCode>push</InlineCode> needs a token generated with the{" "}
          <strong>Write permission</strong> toggle on. <InlineCode>pull</InlineCode>,{" "}
          <InlineCode>list</InlineCode>, and <InlineCode>diff</InlineCode> only
          need read.
        </Callout>
      </Section>

      <Section
        id="api"
        title="REST API"
        description="Direct access via curl/fetch, without the SDK."
      >
        <Sub title="GET /api/env-vault/fetch">
          <Para>
            Returns every env in the token&apos;s scope (public + private). For
            server-side use.
          </Para>
          <CodeBlock
            lang="bash"
            code={`curl -H "Authorization: Bearer stk_env_..." \\
  https://sentroy.com/api/env-vault/fetch`}
          />
        </Sub>
        <Sub title="GET /api/env-vault/public">
          <Para>
            Only variables flagged <InlineCode>public: true</InlineCode>.
            Browser-safe.
          </Para>
          <CodeBlock
            lang="bash"
            code={`curl -H "Authorization: Bearer stk_env_..." \\
  https://sentroy.com/api/env-vault/public`}
          />
        </Sub>
      </Section>

      <Section
        id="webhooks"
        title="Webhooks"
        description="Real-time invalidation — skip the 5 min cache TTL when a value changes."
      >
        <Para>
          Configure a webhook on a project + environment in the vault
          dashboard. Whenever any variable changes (create, update, or
          delete), Sentroy POSTs to your URL with an HMAC-SHA256 signature.
          The default SDK handler verifies the signature and calls{" "}
          <InlineCode>refreshEnvCache()</InlineCode> — the next{" "}
          <InlineCode>getEnv()</InlineCode> hits a fresh fetch.
        </Para>
        <CodeBlock
          lang="ts"
          code={`// app/api/sentroy/vault-webhook/route.ts
import { createVaultWebhookHandler } from "@sentroy-co/client-sdk/vault"

export const POST = createVaultWebhookHandler({
  secret: process.env.SENTROY_VAULT_WEBHOOK_SECRET!,
})`}
        />
        <Para>
          The receiver URL goes into the dashboard; the secret comes back
          once at create-time and is set as{" "}
          <InlineCode>SENTROY_VAULT_WEBHOOK_SECRET</InlineCode> in the
          consuming app.
        </Para>
        <Sub title="Payload">
          <CodeBlock
            lang="json"
            code={`{
  "event": "vault.variable.changed",
  "project": "<projectId>",
  "environment": "prod",
  "action": "create" | "update" | "delete",
  "keys": ["DATABASE_URL", "..."],
  "timestamp": 1731430000000
}`}
          />
          <Para>
            Headers: <InlineCode>X-Sentroy-Signature: sha256=&lt;hex&gt;</InlineCode>{" "}
            (HMAC over the raw body),{" "}
            <InlineCode>X-Sentroy-Event: vault.variable.changed</InlineCode>,{" "}
            <InlineCode>X-Sentroy-Webhook-Id</InlineCode>. Delivery is
            fire-and-forget with a 5 sec timeout — last status + error are
            recorded in the dashboard for visibility but failed deliveries
            are not retried automatically.
          </Para>
        </Sub>
        <Sub title="Custom handler">
          <Para>
            Override the default cache-clear with{" "}
            <InlineCode>onChange</InlineCode> — useful for targeted
            invalidation, structured logging, or downstream notifications.
          </Para>
          <CodeBlock
            lang="ts"
            code={`export const POST = createVaultWebhookHandler({
  secret: process.env.SENTROY_VAULT_WEBHOOK_SECRET!,
  async onChange(payload) {
    console.log("vault changed", payload.action, payload.keys)
    await refreshEnvCache()
  },
})`}
          />
        </Sub>
        <Callout variant="warning">
          The signature includes a timestamp that must be within the last
          5 min (configurable via <InlineCode>maxAgeMs</InlineCode>). This
          guards against replays of an intercepted delivery.
        </Callout>
      </Section>

      <Section
        id="encryption"
        title="Encryption"
        description="Variable values are encrypted at rest with AES-256-GCM."
      >
        <Para>
          The master key lives on Sentroy core in the{" "}
          <InlineCode>SENTROY_ENV_MASTER_KEY</InlineCode> env. Plaintext is
          never written to the database — only ciphertext + nonce + auth tag
          (v1:iv:tag:cipher base64). Decryption happens in the token-auth fetch
          response.
        </Para>
        <CodeBlock
          lang="bash"
          code={`# Generate a master key (one-time, store in Coolify env)
openssl rand -base64 32
# Add to platform: SENTROY_ENV_MASTER_KEY=<output>`}
        />
        <Callout variant="warning">
          If the master key is lost, every existing ciphertext becomes
          unrecoverable. Keep a backup somewhere safe (e.g. 1Password vault,
          AWS Secrets Manager).
        </Callout>
      </Section>

      <Section
        id="audit"
        title="Audit log"
        description="Every change records who/what/when — never the value itself."
      >
        <Para>
          The audit log never stores the value itself; it writes a{" "}
          <InlineCode>sha256(plaintext)</InlineCode> checksum as before/after.
          That makes &quot;did the value change?&quot; comparable, while a log
          compromise will not leak any plaintext.
        </Para>
      </Section>

      <PageFooter current="/docs/env-vault" />
    </article>
  )
}

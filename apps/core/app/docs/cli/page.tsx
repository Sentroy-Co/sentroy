import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { CodeTabsServer } from "../components/code-tabs-server"
import {
  Callout,
  Endpoint,
  Lede,
  Para,
  PropsTable,
  Section,
  Sub,
} from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "CLI",
  description:
    "Script Sentroy from the terminal — env vault sync, mail templates, storage buckets, audit logs, and AI skill install — without a single line of TypeScript.",
}

export default function CliDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / CLI
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            CLI
          </h1>
          <Lede>
            <InlineCode>sentroy</InlineCode> is the official Sentroy command-line
            interface — a single binary that ships with{" "}
            <InlineCode>@sentroy-co/client-sdk</InlineCode>. Use it for ad-hoc
            inspection, CI/CD scripts, AI-agent automation, and one-shot
            recipes that would otherwise require a tiny throwaway Node project.
          </Lede>
        </div>
      </header>

      <Section
        id="overview"
        title="Overview"
        description={
          <>
            The CLI is a thin wrapper around the same REST endpoints the SDK
            uses. Every dashboard read operation has a CLI equivalent, and most
            writes do too. Output is{" "}
            <InlineCode>table</InlineCode> by default for human eyes, or{" "}
            <InlineCode>--output=json</InlineCode> for piping into{" "}
            <InlineCode>jq</InlineCode>, GitHub Actions, or an LLM tool.
          </>
        }
      >
        <Para>
          <strong>Why a CLI?</strong> Three audiences:
        </Para>
        <Para>
          <strong>1. Shell scripting</strong> — pull the inbox of a transactional
          domain every morning and pipe the deltas to Slack.<br />
          <strong>2. CI/CD</strong> — pull the Env Vault before integration tests
          so the test runner sees production-shaped config without committing
          secrets.<br />
          <strong>3. AI agents</strong> — Claude / Cursor / Windsurf can shell
          out to <InlineCode>sentroy</InlineCode> through their built-in Bash
          tool. Combined with the Sentroy skill (
          <InlineCode>sentroy ai install</InlineCode>), agents get production
          observability without an SDK roundtrip.
        </Para>
      </Section>

      <Section
        id="install"
        title="Install"
        description="The CLI is the bin entry of the official SDK package. No separate install — choose local, global, or one-off npx."
      >
        <CodeTabsServer
          tabs={[
            {
              label: "Project-local",
              lang: "bash",
              code: `# Install alongside the SDK (recommended for CI)
npm install @sentroy-co/client-sdk

# Then either:
npx sentroy --help
# …or add a script in package.json:
#   "scripts": { "env:pull": "sentroy env pull .env.local" }`,
            },
            {
              label: "Global",
              lang: "bash",
              code: `# Available everywhere on $PATH
npm install -g @sentroy-co/client-sdk
sentroy --help`,
            },
            {
              label: "Zero-install",
              lang: "bash",
              code: `# No install at all — npx fetches and runs
npx -y @sentroy-co/client-sdk sentroy mail templates list`,
            },
          ]}
        />
        <Callout variant="info">
          The binary name is <InlineCode>sentroy</InlineCode> (lowercase, single
          word). After install run <InlineCode>sentroy --help</InlineCode> to
          discover every subcommand — this page documents the stable ones.
        </Callout>
      </Section>

      <Section
        id="auth"
        title="Authentication"
        description="Three env vars cover every subcommand. Flag forms exist for one-off overrides and CI matrix jobs."
      >
        <Para>
          The CLI accepts the same{" "}
          <InlineCode>stk_…</InlineCode> Bearer tokens the SDK uses. Tokens are
          company-scoped — every call needs a token <em>and</em> the company
          slug that token belongs to. For{" "}
          <InlineCode>sentroy env …</InlineCode> commands, swap the company
          token for a vault-scoped <InlineCode>SENTROY_ENV_API_KEY</InlineCode>{" "}
          instead (the project + environment is implicit in the token).
        </Para>
        <Sub id="auth-env" title="Environment variables">
          <PropsTable
            rows={[
              {
                name: "SENTROY_API_KEY",
                type: "string (stk_…)",
                required: true,
                description: (
                  <>
                    Bearer access token generated under{" "}
                    <strong>Company &rarr; API keys</strong>. Returned plaintext
                    only once at create time.
                  </>
                ),
              },
              {
                name: "SENTROY_COMPANY_SLUG",
                type: "string",
                required: true,
                description: (
                  <>
                    The URL slug of the company the token belongs to (e.g.{" "}
                    <InlineCode>acme</InlineCode>). Read from the company
                    switcher in the dashboard.
                  </>
                ),
              },
              {
                name: "SENTROY_API_URL",
                type: "string",
                description: (
                  <>
                    Platform root URL. Defaults to{" "}
                    <InlineCode>https://sentroy.com</InlineCode>. Override for
                    staging or local-dev (
                    <InlineCode>http://localhost:3000</InlineCode>).
                  </>
                ),
              },
              {
                name: "SENTROY_ENV_API_KEY",
                type: "string (stk_env_…)",
                description: (
                  <>
                    Vault-only token used by every{" "}
                    <InlineCode>sentroy env …</InlineCode> subcommand. Scope
                    (project + environment) is encoded in the token itself —
                    no slug needed.
                  </>
                ),
              },
            ]}
          />
        </Sub>
        <Sub id="auth-flags" title="Flag overrides">
          <PropsTable
            rows={[
              {
                name: "--token",
                type: "string",
                description: (
                  <>Overrides <InlineCode>SENTROY_API_KEY</InlineCode>.</>
                ),
              },
              {
                name: "--company-slug",
                type: "string",
                description: (
                  <>
                    Overrides <InlineCode>SENTROY_COMPANY_SLUG</InlineCode>.
                  </>
                ),
              },
              {
                name: "--url",
                type: "string",
                description: (
                  <>
                    Overrides <InlineCode>SENTROY_API_URL</InlineCode>. Handy
                    for CI matrices that hit staging and prod from the same
                    job.
                  </>
                ),
              },
              {
                name: "--output",
                type: "table | json",
                description: (
                  <>
                    Global. Default <InlineCode>table</InlineCode>;{" "}
                    <InlineCode>json</InlineCode> emits one JSON document on
                    stdout for piping into <InlineCode>jq</InlineCode>.
                  </>
                ),
              },
            ]}
          />
        </Sub>
        <Callout variant="warning">
          <strong>Token storage:</strong> <InlineCode>stk_…</InlineCode> tokens
          are returned plaintext <em>only on create</em>. The dashboard shows
          the prefix later but cannot recover the full string — store it
          immediately in 1Password, Coolify, GitHub Actions secrets, or your
          AI agent&apos;s config.
        </Callout>
      </Section>

      <Section
        id="output"
        title="Output formats"
        description="The same command, two shapes — pick the one your consumer prefers."
      >
        <Para>
          <InlineCode>--output=table</InlineCode> (default) prints a
          human-readable ASCII table with ANSI colors when stdout is a TTY.
          <InlineCode>--output=json</InlineCode> emits one JSON document on a
          single line for unambiguous parsing. Tables are for humans; JSON is
          for everything else.
        </Para>
        <CodeBlock
          lang="bash"
          code={`# Human-readable
sentroy mail templates list

# Pipe into jq
sentroy mail templates list --output=json | jq '.data[] | .name'

# Or grab a single field
ID=$(sentroy mail templates list --output=json | jq -r '.data[0].id')
sentroy mail templates get "$ID" --output=json | jq '.subject'`}
        />
        <Callout variant="info">
          When stdout is a pipe, table formatting auto-disables colors but
          keeps the column layout. For scripting always set{" "}
          <InlineCode>--output=json</InlineCode> — column widths are not part
          of the API contract and may change between releases.
        </Callout>
      </Section>

      <Section
        id="env-vault"
        title="Env Vault"
        description="Sync .env files between your project and the Sentroy vault. Full reference: /docs/env-vault."
      >
        <Para>
          The <InlineCode>env</InlineCode> subcommand uses{" "}
          <InlineCode>SENTROY_ENV_API_KEY</InlineCode> — a separate, narrower
          token type. The token already carries{" "}
          <InlineCode>{`{project, environment}`}</InlineCode>; no slug needed.
        </Para>
        <Sub id="env-push" title="push — upsert local file to vault">
          <Endpoint method="POST" path="/api/env-vault/push" />
          <CodeBlock
            lang="bash"
            code={`# Upsert only — vault keys absent from .env are kept
sentroy env push .env.production

# Full sync — vault keys absent from .env are deleted (prompts first)
sentroy env push .env.production --delete-missing

# Dry-run — print the diff without writing
sentroy env push .env.production --dry-run`}
          />
        </Sub>
        <Sub id="env-pull" title="pull — write vault to local file">
          <Endpoint method="GET" path="/api/env-vault/fetch" />
          <CodeBlock
            lang="bash"
            code={`# Refuse to overwrite an existing file by default
sentroy env pull .env.local

# --force overwrites; --public-only fetches the browser-safe subset that
# strips secrets — useful for .env.public files committed to the repo
sentroy env pull .env.public --force --public-only`}
          />
        </Sub>
        <Sub id="env-list" title="list — print vault keys">
          <CodeBlock
            lang="bash"
            code={`sentroy env list                  # keys only
sentroy env list --values         # KEY=value lines (decrypted)
sentroy env list --public-only    # browser-safe subset`}
          />
        </Sub>
        <Sub id="env-diff" title="diff — compare local file with vault">
          <CodeBlock
            lang="bash"
            code={`# Exit code 0 if identical, 1 if any add/update/delete
sentroy env diff .env.production`}
          />
          <Para>
            Use the exit code in pre-deploy hooks to fail fast when a developer
            forgets to push their local change.
          </Para>
        </Sub>
        <Callout variant="warning">
          Write commands (<InlineCode>push</InlineCode>) require a token with
          the <strong>Write</strong> permission toggled on at creation time.
          Read-only tokens can <InlineCode>pull</InlineCode>,{" "}
          <InlineCode>list</InlineCode>, and <InlineCode>diff</InlineCode>.
        </Callout>
      </Section>

      <Section
        id="mail"
        title="Mail"
        description="Every mail dashboard surface is mirrored as a CLI subcommand. Auth uses SENTROY_API_KEY + SENTROY_COMPANY_SLUG."
      >
        <Sub id="mail-templates" title="templates list / get">
          <Endpoint method="GET" path="/api/mail/companies/[slug]/templates" />
          <CodeBlock
            lang="bash"
            code={`sentroy mail templates list
# Columns: ID | NAME | SUBJECT | DOMAIN | CATEGORY | CREATED
# JSON item: { id, name, subject, domainId, category, createdAt }

sentroy mail templates get tpl_a1f9 --output=json`}
          />
        </Sub>
        <Sub id="mail-templates-create" title="templates create / update / delete">
          <Endpoint method="POST" path="/api/mail/companies/[slug]/templates" />
          <Para>
            Write commands need a token with the <InlineCode>templates.manage</InlineCode> permission. The body
            (MJML or raw HTML) comes from <InlineCode>--mjml-file</InlineCode>, inline{" "}
            <InlineCode>--mjml</InlineCode>, or piped stdin. <InlineCode>--domain</InlineCode> is the verified
            sending domain id. Localized <InlineCode>--name</InlineCode> / <InlineCode>--subject</InlineCode>{" "}
            accept either a plain string or a JSON object (<InlineCode>{`{"en":"…","tr":"…"}`}</InlineCode>).
          </Para>
          <CodeBlock
            lang="bash"
            code={`# create from a file
sentroy mail templates create \\
  --name=Welcome \\
  --subject="Welcome, {firstName}!" \\
  --domain=dom_123 \\
  --mjml-file=welcome.mjml

# create from stdin with localized fields
cat welcome.mjml | sentroy mail templates create \\
  --name='{"en":"Welcome","tr":"Hos geldin"}' \\
  --subject='{"en":"Hi {firstName}","tr":"Merhaba {firstName}"}' \\
  --domain=dom_123

# partial update (any of --name / --subject / --mjml / --mjml-file)
sentroy mail templates update tpl_a1f9 --subject="Welcome aboard, {firstName}!"

# delete
sentroy mail templates delete tpl_a1f9`}
          />
          <Callout variant="info" title="Variables are auto-extracted">
            Placeholders in the body (<InlineCode>{"{firstName}"}</InlineCode>,{" "}
            <InlineCode>{"{#items}…{/items}"}</InlineCode>) are parsed server-side — you never pass a{" "}
            <InlineCode>variables</InlineCode> list. See{" "}
            <a href="/docs/mail#template-variables">Template variables</a> for the full syntax.
          </Callout>
        </Sub>
        <Sub id="mail-domains" title="domains list">
          <Endpoint method="GET" path="/api/mail/companies/[slug]/domains" />
          <CodeBlock
            lang="bash"
            code={`sentroy mail domains list
# Columns: ID | DOMAIN | STATUS | ASSIGNED | CREATED
# JSON item: { id, domain, status, isAssigned, createdAt }`}
          />
        </Sub>
        <Sub id="mail-mailboxes" title="mailboxes list">
          <Endpoint method="GET" path="/api/mail/companies/[slug]/mailboxes" />
          <CodeBlock
            lang="bash"
            code={`sentroy mail mailboxes list
# Columns: ID | EMAIL | DOMAIN | CATCHALL | CREATED
# JSON item: { id, email, domainId, isCatchAll, createdAt }`}
          />
        </Sub>
        <Sub id="mail-inbox" title="inbox list — filterable feed">
          <Endpoint method="GET" path="/api/mail/companies/[slug]/inbox" />
          <PropsTable
            rows={[
              {
                name: "--mailbox",
                type: "email",
                description: "Only messages delivered to this mailbox.",
              },
              {
                name: "--folder",
                type: "string",
                description: (
                  <>
                    Restrict to a folder (e.g. <InlineCode>inbox</InlineCode>,{" "}
                    <InlineCode>spam</InlineCode>,{" "}
                    <InlineCode>archive</InlineCode>).
                  </>
                ),
              },
              {
                name: "--unread",
                type: "flag",
                description: "Only messages without a read receipt.",
              },
              {
                name: "--q",
                type: "string",
                description: "Full-text search over subject + body.",
              },
              {
                name: "--page",
                type: "number",
                description: "Page index (1-based).",
              },
              {
                name: "--limit",
                type: "number",
                description: "Default 50, max 500.",
              },
            ]}
          />
          <CodeBlock
            lang="bash"
            code={`sentroy mail inbox list --mailbox hello@mail.acme.com --unread --limit 50`}
          />
        </Sub>
        <Sub id="mail-suppressions" title="suppressions list">
          <Endpoint
            method="GET"
            path="/api/mail/companies/[slug]/suppressions"
          />
          <CodeBlock
            lang="bash"
            code={`sentroy mail suppressions list --output=json | jq '.data | length'
# Columns: ID | EMAIL | REASON | DOMAIN | CREATED
# JSON item: { id, email, reason, domainId, createdAt }`}
          />
        </Sub>
        <Sub id="mail-logs" title="logs list / get">
          <Endpoint method="GET" path="/api/mail/companies/[slug]/logs" />
          <CodeBlock
            lang="bash"
            code={`# Last 100 sends — columns: ID | MESSAGE | TO | STATUS | DOMAIN | CREATED
sentroy mail logs list --limit 100

# Failures only, bounded by date range (ISO timestamps; flags --from / --to)
sentroy mail logs list --status failed --from 2026-05-29 --to 2026-05-30

# Full event timeline for a single send
sentroy mail logs get log_8af2 --output=json
# JSON item: { id, messageId, to, status, domainId, createdAt }`}
          />
        </Sub>
        <Sub id="mail-webhooks" title="webhooks list">
          <Endpoint method="GET" path="/api/mail/companies/[slug]/webhooks" />
          <CodeBlock
            lang="bash"
            code={`sentroy mail webhooks list
# Columns: ID | URL | DOMAIN | ACTIVE
# JSON item: { id, url, events, domainId, active }`}
          />
        </Sub>
        <Sub id="mail-analytics" title="analytics">
          <Endpoint method="GET" path="/api/mail/companies/[slug]/analytics" />
          <CodeBlock
            lang="bash"
            code={`# 7-day aggregate (flag is --days=<n>, NOT --since)
sentroy mail analytics --days=7

# JSON shape (--output=json):
# { "windowDays": 7,
#   "overview": { "sent", "delivered", "bounced", "complained", "opened", "clicked" },
#   "daily":   [ /* per-day buckets */ ],
#   "domains": [ /* per-domain rollups */ ] }`}
          />
        </Sub>
      </Section>

      <Section
        id="storage"
        title="Storage"
        description="Bucket and media inspection. Uploads still go through the SDK (multipart pool); the CLI is read + lightweight admin."
      >
        <Sub id="storage-buckets" title="buckets list / get">
          <Endpoint method="GET" path="/api/storage/companies/[slug]/buckets" />
          <CodeBlock
            lang="bash"
            code={`sentroy storage buckets list
# Columns: ID | NAME | SLUG | PUBLIC | USED | FILES | CREATED

sentroy storage buckets get avatars --output=json`}
          />
        </Sub>
        <Sub id="storage-media" title="media list / get">
          <Endpoint
            method="GET"
            path="/api/storage/companies/[slug]/buckets/[bucket]/media"
          />
          <CodeBlock
            lang="bash"
            code={`# media list takes the bucketSlug as a positional arg
sentroy storage media list avatars --limit 20
# Columns: ID | NAME | TYPE | MIME | SIZE | FOLDER | PUBLIC

# media get requires BOTH bucketSlug AND mediaId
sentroy storage media get avatars med_3f2a --output=json`}
          />
        </Sub>
        <Sub id="storage-usage" title="usage">
          <CodeBlock
            lang="bash"
            code={`# Storage rollup for the company — quota + per-bucket + byType + time series + recent uploads
sentroy storage usage

# Response shape (--output=json):
# { "quota":   { "used": 2503671808, "limit": 107374182400, "remaining": 104870510592 },
#   "buckets": [ { "id": "bkt_a1f2", "name": "Avatars", "slug": "avatars",
#                  "storageUsed": 327155712, "fileCount": 1204 } ],
#   "byType":  { "image": { "count": 9012, "size": 1872310912 },
#                "video": { "count": 102,  "size": 631360896  } },
#   "timeSeries": [ { "date": "2026-05-29", "size": 41943040, "count": 21 } ],
#   "recent":  [ /* most recent Media[] */ ] }`}
          />
        </Sub>
        <Sub id="storage-quota" title="quota">
          <CodeBlock
            lang="bash"
            code={`# Plan-level storage cap + headroom (bytes)
sentroy storage quota --output=json
# {
#   "used":      2503671808,
#   "limit":     107374182400,
#   "remaining": 104870510592
# }

# Convert to GB client-side as needed:
sentroy storage quota --output=json | jq '.used / 1e9'`}
          />
        </Sub>
      </Section>

      <Section
        id="whatsapp"
        title="WhatsApp"
        description="Send template messages, manage templates and audiences, and read send logs from the terminal — same stk_ token."
      >
        <Sub id="whatsapp-numbers" title="numbers list">
          <Endpoint method="GET" path="/api/whatsapp/companies/[slug]/numbers" />
          <CodeBlock
            lang="bash"
            code={`sentroy whatsapp numbers list
# Columns: SESSION | PHONE | LABEL | STATUS | CONNECTED`}
          />
        </Sub>
        <Sub id="whatsapp-templates" title="templates list / create / delete">
          <CodeBlock
            lang="bash"
            code={`sentroy whatsapp templates list

# create — body via --body, --body-file, or piped stdin
sentroy whatsapp templates create --name "Order shipped" \\
  --body "Hi {{name}}, your order {{orderNo}} has shipped!"

sentroy whatsapp templates get tpl_123 --output=json
sentroy whatsapp templates delete tpl_123`}
          />
        </Sub>
        <Sub id="whatsapp-audiences" title="audiences list">
          <CodeBlock
            lang="bash"
            code={`sentroy whatsapp audiences list
# Columns: ID | NAME | RECIPIENTS | CREATED`}
          />
        </Sub>
        <Sub id="whatsapp-send" title="send — to one recipient or an audience">
          <Endpoint method="POST" path="/api/whatsapp/companies/[slug]/send" />
          <CodeBlock
            lang="bash"
            code={`# single recipient (variables as JSON)
sentroy whatsapp send --to +905551112233 --template tpl_123 \\
  --vars '{"name":"Ada","orderNo":"1042"}'

# whole audience (bulk), from a specific connected number
sentroy whatsapp send --from +905550000000 --audience aud_9 --template tpl_123`}
          />
        </Sub>
        <Sub id="whatsapp-logs" title="logs list">
          <CodeBlock
            lang="bash"
            code={`sentroy whatsapp logs list --status sent --limit 50
# Columns: TO | STATUS | TEMPLATE | ERROR | AT`}
          />
        </Sub>
      </Section>

      <Section
        id="ai"
        title="AI Skill install"
        description="One-shot installer that drops the Sentroy skill file into the right place for your AI editor."
      >
        <Para>
          The skill teaches Claude / Cursor / Windsurf how the SDK and CLI fit
          together — endpoint shapes, auth model, common recipes. Full
          reference: <InlineCode>/docs/ai-skills</InlineCode>.
        </Para>
        <CodeBlock
          lang="bash"
          code={`# Autodetect: scans the cwd for .claude/, .cursor/, .windsurf/, AGENTS.md
sentroy ai install

# Target specific editors
sentroy ai install --claude --cursor

# All four targets at once
sentroy ai install --claude --cursor --windsurf --agents`}
        />
        <Callout variant="info">
          The installer writes the skill, then prints the path it touched.
          Re-run any time to refresh after an SDK upgrade — content is
          idempotent.
        </Callout>
      </Section>

      <Section
        id="scripting"
        title="Scripting recipes"
        description="Real patterns we run in production. Copy, paste, adapt."
      >
        <Sub id="scripting-daily" title="Daily bounce report to Slack">
          <Para>
            Cron job: every morning, post yesterday&apos;s bounced sends to a
            Slack channel. Pure shell — no Node, no SDK.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "Bash + jq",
                lang: "bash",
                code: `#!/usr/bin/env bash
set -euo pipefail

# Bound the window with ISO timestamps (CLI takes --from / --to)
FROM=$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')
TO=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

COUNT=$(sentroy mail logs list \\
  --status failed \\
  --from "$FROM" \\
  --to "$TO" \\
  --output=json | jq '.data | length')

if [[ "$COUNT" -gt 0 ]]; then
  curl -sS -X POST "$SLACK_WEBHOOK_URL" \\
    -H "Content-Type: application/json" \\
    -d "{\\"text\\": \\":warning: $COUNT mail bounces in the last 24h\\"}"
fi`,
              },
              {
                label: "Node + SDK",
                lang: "ts",
                code: `import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: process.env.SENTROY_COMPANY_SLUG!,
  accessToken: process.env.SENTROY_API_KEY!,
})

const to = new Date().toISOString()
const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const logs = await sentroy.logs.list({ status: "failed", from, to })
if (logs.data.length === 0) process.exit(0)

await fetch(process.env.SLACK_WEBHOOK_URL!, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: \`:warning: \${logs.data.length} mail bounces in the last 24h\`,
  }),
})`,
              },
            ]}
          />
        </Sub>
        <Sub id="scripting-ci" title="CI/CD: pull env before tests">
          <Para>
            GitHub Actions step that fetches production-shaped env from the
            vault, runs integration tests against it, and cleans up. No
            secrets committed to the repo.
          </Para>
          <CodeBlock
            lang="bash"
            code={`# .github/workflows/integration.yml — step body
- name: Pull Sentroy vault
  env:
    SENTROY_ENV_API_KEY: \${{ secrets.SENTROY_ENV_API_KEY_STAGING }}
  run: npx -y @sentroy-co/client-sdk sentroy env pull .env.test --force

- name: Run integration tests
  run: bun run test:integration

- name: Cleanup
  if: always()
  run: rm -f .env.test`}
          />
        </Sub>
        <Sub id="scripting-monitor" title="Storage cost guard">
          <Para>
            Nightly check that storage utilization hasn&apos;t crossed a plan
            threshold. Exits non-zero so the cron host can page you.
            <InlineCode>storage quota</InlineCode> returns{" "}
            <InlineCode>{`{ used, limit, remaining }`}</InlineCode> in bytes —
            convert to GB client-side.
          </Para>
          <CodeBlock
            lang="bash"
            code={`#!/usr/bin/env bash
THRESHOLD_GB=80

USED_GB=$(sentroy storage quota --output=json | jq '.used / 1e9')

awk -v u="$USED_GB" -v t="$THRESHOLD_GB" 'BEGIN { exit !(u > t) }' && {
  echo "storage \${USED_GB}GB exceeds \${THRESHOLD_GB}GB threshold" >&2
  exit 1
}`}
          />
        </Sub>
      </Section>

      <Section
        id="troubleshooting"
        title="Troubleshooting"
        description="The five errors you'll actually hit, with the fix on the same line."
      >
        <Sub id="ts-no-token" title="Error: SENTROY_API_KEY is not set">
          <Para>
            No token resolved from env or flags. Either export{" "}
            <InlineCode>SENTROY_API_KEY=stk_…</InlineCode> or pass{" "}
            <InlineCode>--token=stk_…</InlineCode> on the call. For{" "}
            <InlineCode>sentroy env …</InlineCode> the variable is{" "}
            <InlineCode>SENTROY_ENV_API_KEY</InlineCode> (vault-scoped, not
            company-scoped).
          </Para>
        </Sub>
        <Sub id="ts-no-slug" title="Error: SENTROY_COMPANY_SLUG is not set">
          <Para>
            Token is present but the company slug isn&apos;t. Set{" "}
            <InlineCode>SENTROY_COMPANY_SLUG=acme</InlineCode> or pass{" "}
            <InlineCode>--company-slug=acme</InlineCode>. The slug is visible
            in the dashboard URL: <InlineCode>sentroy.com/d/acme/…</InlineCode>.
          </Para>
        </Sub>
        <Sub id="ts-401" title="401 Unauthorized">
          <Para>
            The token is wrong, revoked, or expired. In the dashboard go to{" "}
            <strong>Company &rarr; API keys</strong> and verify the prefix (the
            first 12 chars) against what you have locally — if it doesn&apos;t
            match, the token was rotated. Generate a fresh one and update
            wherever you store it.
          </Para>
        </Sub>
        <Sub id="ts-403" title="403 Forbidden">
          <Para>
            Token is valid but lacks the permission needed for this command.
            Open the token in the dashboard, toggle the missing permission on
            (e.g. <InlineCode>templates.manage</InlineCode> for{" "}
            <InlineCode>mail templates create</InlineCode>), and retry.
            Read-only tokens can list and get; write commands need the matching{" "}
            <InlineCode>.manage</InlineCode> permission.
          </Para>
        </Sub>
        <Sub id="ts-404" title="404 Not Found">
          <Para>
            Usually the wrong company slug, occasionally a typo&apos;d resource
            id. Run <InlineCode>sentroy mail templates list</InlineCode> (or
            equivalent) to confirm the resource exists in the company the
            token belongs to — tokens from another company will 404, not 403.
          </Para>
        </Sub>
        <Sub id="ts-debug" title="Verbose mode">
          <Para>
            A first-class <InlineCode>--verbose</InlineCode> flag is on the
            roadmap. Until then, lean on Node&apos;s built-in HTTP tracer to
            see raw <InlineCode>fetch</InlineCode> calls, or pipe through{" "}
            <InlineCode>tee</InlineCode> to capture stdout/stderr alongside
            the command output.
          </Para>
          <CodeBlock
            lang="bash"
            code={`# Node's built-in HTTP debug output
NODE_DEBUG=http sentroy mail templates list

# Tee stdout + stderr to a log for an issue report
sentroy mail templates list --output=json 2>&1 | tee /tmp/sentroy-cli.log`}
          />
        </Sub>
      </Section>

      <PageFooter current="/docs/cli" />
    </article>
  )
}

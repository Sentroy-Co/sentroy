import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { CodeTabsServer } from "../components/code-tabs-server"
import { Callout, Lede, Para, Section, Sub } from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "Status Pages",
  description:
    "Atlassian Statuspage-style public status pages — components + HTTP probe checks + manual/auto incidents + scheduled maintenance + subscribers (email, Telegram, webhook). Auto-restart targets recover failing services automatically.",
}

export default function StatusPagesDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / Status Pages
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Status Pages
          </h1>
          <Lede>
            Your public status page goes live in minutes. Define components +
            HTTP probe checks; the worker probes every 30 seconds and opens
            an auto-incident on sustained failure (optionally firing a
            restart target). Your end users subscribe by email, Telegram, or
            webhook — incident updates ship to them automatically.
          </Lede>
        </div>
      </header>

      <Section
        id="setup"
        title="Setup"
        description="This lives on status.sentroy.com (not auth.sentroy.com). Get your first page live in 1 minute."
      >
        <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
          <li>
            Visit{" "}
            <a
              href="https://status.sentroy.com/en/d"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline-offset-2 hover:underline"
            >
              status.sentroy.com/d
            </a>{" "}
            → log in with your Sentroy account → pick your company.
          </li>
          <li>
            <span className="text-foreground">Create the status page</span> —
            the wizard asks for a name and a public slug (e.g.{" "}
            <InlineCode>my-app</InlineCode>). Public URL becomes{" "}
            <InlineCode>https://status.sentroy.com/p/my-app</InlineCode>.
          </li>
          <li>
            <span className="text-foreground">Add components</span> — the
            user-facing service groups (API, Database, Web App). Each
            component is monitored by one or more HTTP checks.
          </li>
          <li>
            <span className="text-foreground">Define HTTP checks</span> — per
            component: probe URL + interval (30s-3600s) + expected status
            range + optional degraded-latency threshold + optional
            auto-restart target binding.
          </li>
          <li>
            <span className="text-foreground">Settings → Branding</span> —
            display name, primary color, logo URL, optional logo link, and
            tagline. Live preview reflects every change immediately.
          </li>
        </ol>
        <Callout variant="info" title="One Sentroy company → one status page">
          <Para>
            1:1 mapping. If you need multiple independent status pages,
            create separate Sentroy companies for each.
          </Para>
        </Callout>
      </Section>

      <Section
        id="components-checks"
        title="Components & checks"
        description="Each user-visible service on the public page is a component. Component status is derived from the worst severity across its checks."
      >
        <Sub id="component-status" title="Status derivation">
          <Para>
            For each component, given its bound checks:
          </Para>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>
              any check <InlineCode>down</InlineCode> → component is{" "}
              <strong>down</strong> (red)
            </li>
            <li>
              any check <InlineCode>degraded</InlineCode> (responds 2xx but
              slow) → <strong>degraded</strong> (amber)
            </li>
            <li>
              every check <InlineCode>no-data</InlineCode> → component is{" "}
              <strong>no-data</strong> (gray — never probed yet)
            </li>
            <li>otherwise → <strong>operational</strong> (green)</li>
            <li>
              if an active maintenance window covers this component, the
              status is overridden to <strong>maintenance</strong> (blue).
              Downtime during maintenance does NOT count against uptime.
            </li>
          </ul>
        </Sub>

        <Sub id="check-config" title="HTTP check fields">
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>
              <InlineCode>url</InlineCode> + <InlineCode>method</InlineCode>{" "}
              (GET/POST/HEAD)
            </li>
            <li>
              <InlineCode>intervalSeconds</InlineCode> — 30 minimum, 3600 maximum
            </li>
            <li>
              <InlineCode>expectedStatusMin/Max</InlineCode> — defaults
              200-299; define your own success range
            </li>
            <li>
              <InlineCode>expectedBodyContains</InlineCode> — optional; if
              the response body lacks this string, marked down
            </li>
            <li>
              <InlineCode>timeoutMs</InlineCode> +{" "}
              <InlineCode>degradedLatencyMs</InlineCode> — timeout exceeds
              triggers down; degradedLatency triggers degraded
            </li>
            <li>
              <InlineCode>insecureSkipTlsVerify</InlineCode> — dev only
            </li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="incidents"
        title="Incidents"
        description="Communicate outages to your users — open one manually or let the worker do it for you."
      >
        <Para>Two types:</Para>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground font-medium">Manual</span> —
            dashboard Incidents tab → "New incident". Provide title, impact
            (minor/major/critical), affected components, and an initial
            update message (TR + EN). Status:
            investigating → identified → monitoring → resolved.
          </li>
          <li>
            <span className="text-foreground font-medium">Auto</span> — the
            worker opens an incident when a check sees 3+ consecutive
            failures. It auto-resolves after 30 minutes of recovered
            operation. Auto incidents carry a{" "}
            <InlineCode>source: "auto"</InlineCode> badge; you can still
            post manual updates or resolve them yourself.
          </li>
        </ul>

        <Sub id="incident-timeline" title="Timeline updates">
          <Para>
            Every status transition + commentary is pushed as a new update.
            Update bodies are localized ({"{ tr, en }"}) — the public page
            renders the user's browser locale.
          </Para>
        </Sub>
      </Section>

      <Section
        id="maintenance"
        title="Maintenance windows"
        description="Announce planned downtime in advance. Subscribers get notified, a banner appears on the public page, and uptime stats are unaffected."
      >
        <Para>
          Dashboard Maintenance tab → "Schedule maintenance". Set start/end,
          affected components, and a title + description (TR + EN). State
          machine:
        </Para>
        <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
          <li>
            <InlineCode>scheduled</InlineCode> — future start time. A
            reminder email is sent 1 hour before.
          </li>
          <li>
            <InlineCode>in_progress</InlineCode> — UI "Start now" button or
            automatic when scheduledStart passes. Subscribers receive the
            "started" notification.
          </li>
          <li>
            <InlineCode>completed</InlineCode> — UI "Mark complete" button.
            Subscribers receive the "completed" notification.
          </li>
          <li>
            <InlineCode>cancelled</InlineCode> — cancelled before starting.
          </li>
        </ul>
      </Section>

      <Section
        id="restart-targets"
        title="Restart targets"
        description="Endpoints the worker calls automatically when a check fails N times in a row. Three target types: HTTP, SSH, and Coolify built-in."
      >
        <Sub id="restart-http" title="HTTP target">
          <Para>
            Your own /restart route, a Coolify webhook, or any HTTP endpoint.
            POST or GET, optional encrypted auth header, optional body,
            expected status range, timeout.
          </Para>
        </Sub>
        <Sub id="restart-ssh" title="SSH target">
          <Para>
            The worker SSHes into a remote host with your private key (PEM,
            stored AES-256-GCM encrypted) and runs a single command (e.g.{" "}
            <InlineCode>docker restart api-server</InlineCode>). Optional
            passphrase. Exit code 0 = success.
          </Para>
        </Sub>
        <Sub id="restart-coolify" title="Coolify built-in target">
          <Para>
            The worker calls Coolify's{" "}
            <InlineCode>GET /api/v1/deploy?uuid=...&amp;force=true</InlineCode>{" "}
            endpoint with your API token (encrypted). Coolify queues the
            redeploy.
          </Para>
        </Sub>
        <Para>
          Bind a target to a check from Checks tab → check edit →
          "Auto-restart on failure" section → pick the target + threshold
          (N consecutive failures) + cooldown (minimum seconds between
          restarts; default 600 = 10 min).
        </Para>
        <Callout variant="warning" title="Credentials are write-only">
          <Para>
            Auth headers, private keys, and API tokens are AES-256-GCM
            encrypted at rest. The dashboard never reads them back — only a
            "Set / Rotate / Clear" three-state. The worker decrypts at
            trigger time and uses the value in the request.
          </Para>
        </Callout>
        <Para>
          The "test fire" button (⚡) in the dashboard manually triggers an
          HTTP target without going through threshold/cooldown — useful for
          verifying setup. SSH and Coolify targets only fire from scheduled
          execution (no manual test in v1).
        </Para>
      </Section>

      <Section
        id="subscribers"
        title="Subscribers"
        description="Your users subscribe on the public page by email, Telegram, or webhook. Each incident update + maintenance event triggers a notification automatically."
      >
        <Sub id="subscribers-channels" title="Three channels">
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>
              <strong>Email</strong> — double opt-in. The user enters an
              address, gets a confirmation link, clicks it, and is verified.
              Every notification carries a one-click "Unsubscribe" link.
            </li>
            <li>
              <strong>Telegram</strong> — enter a chat ID and a bot token
              from <InlineCode>@BotFather</InlineCode>. The chat owner must
              send <InlineCode>/start</InlineCode> to the bot first. Sentroy
              sends a confirmation message to verify; the bot token is
              stored AES-256-GCM encrypted. No verification email step.
            </li>
            <li>
              <strong>Webhook</strong> — server-to-server. Sentroy POSTs
              HMAC-SHA256 signed payloads to your URL. No verification step
              (URL owner has implicit consent).
            </li>
          </ul>
        </Sub>
        <Sub id="subscribers-filters" title="Topic + component filters">
          <Para>
            From the subscribe dialog, users can pick:
          </Para>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>
              <strong>Topic</strong> — everything / incidents only /
              maintenance only
            </li>
            <li>
              <strong>Components</strong> — only notify for events that
              affect these specific components (empty = all components)
            </li>
          </ul>
          <Para>
            Users can change these later from{" "}
            <InlineCode>/p/[slug]/preferences?token=...</InlineCode> (token
            is in every notification email footer).
          </Para>
        </Sub>
        <Sub id="subscribers-webhook" title="Webhook signup example">
          <CodeBlock
            lang="bash"
            code={`curl -X POST https://status.sentroy.com/api/v1/status/my-app/subscribe \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "webhook",
    "webhookUrl": "https://your-app.example.com/sentroy-status-webhook"
  }'
# Response: { "managementToken": "...", "webhookSecret": "swhs_..." }
# managementToken is the HMAC secret; shown once, store it now.`}
          />
          <Para>Sample webhook payload (incident update):</Para>
          <CodeBlock
            lang="json"
            code={`{
  "event": "incident.updated",
  "pageSlug": "my-app",
  "data": {
    "incidentId": "...",
    "incidentTitle": { "tr": "...", "en": "..." },
    "impact": "major",
    "affectedComponentIds": ["..."],
    "update": {
      "id": "...",
      "status": "monitoring",
      "body": { "tr": "...", "en": "..." },
      "createdAt": "2026-05-17T12:34:56Z"
    }
  },
  "timestamp": "2026-05-17T12:34:56.789Z"
}`}
          />
        </Sub>
        <Sub id="subscribers-events" title="Event types">
          <Para>
            Sent as the <InlineCode>X-Sentroy-Event</InlineCode> header on
            webhook deliveries:
          </Para>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>
              <InlineCode>incident.updated</InlineCode> — new timeline
              update (investigating / identified / monitoring)
            </li>
            <li>
              <InlineCode>incident.resolved</InlineCode> — incident closed
            </li>
            <li>
              <InlineCode>maintenance.scheduled</InlineCode> — new
              maintenance window created
            </li>
            <li>
              <InlineCode>maintenance.reminder</InlineCode> — 1 hour before
              start
            </li>
            <li>
              <InlineCode>maintenance.started</InlineCode> — window begins
            </li>
            <li>
              <InlineCode>maintenance.completed</InlineCode> — window ends
            </li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="snapshot-api"
        title="Public snapshot API"
        description="JSON snapshot of your status page — CORS-open, no auth required. Use it for embed widgets, monitoring dashboards, or your own UI."
      >
        <Para>
          <InlineCode>GET /api/v1/status/[slug]</InlineCode> — 30s ISR
          cache. Pass <InlineCode>?lang=tr</InlineCode> or send an{" "}
          <InlineCode>Accept-Language</InlineCode> header to get incident
          and maintenance text in the requested locale (defaults to{" "}
          <InlineCode>en</InlineCode>).
        </Para>
        <CodeTabsServer
          tabs={[
            {
              label: "cURL",
              lang: "bash" as const,
              code: `curl -s https://status.sentroy.com/api/v1/status/my-app?lang=en | jq`,
            },
            {
              label: "JavaScript",
              lang: "js" as const,
              code: `const res = await fetch("https://status.sentroy.com/api/v1/status/my-app?lang=en")
const snapshot = await res.json()
console.log(snapshot.overall) // "operational" | "degraded" | "down" | "maintenance" | "no-data"`,
            },
            {
              label: "Python",
              lang: "python" as const,
              code: `import requests
r = requests.get("https://status.sentroy.com/api/v1/status/my-app", params={"lang": "en"})
snapshot = r.json()
print(snapshot["overall"])`,
            },
          ]}
        />
        <Para>Response shape:</Para>
        <CodeBlock
          lang="json"
          code={`{
  "page": {
    "name": "My App",
    "slug": "my-app",
    "branding": {
      "displayName": "My App Status",
      "primaryColor": "#3b82f6",
      "logoUrl": null,
      "logoLinkUrl": null,
      "tagline": null
    },
    "customDomain": null,
    "subscribersEnabled": true
  },
  "overall": "operational",
  "components": [
    {
      "id": "...",
      "name": "API",
      "status": "operational",
      "uptime24h": 99.95,
      "uptime30d": 99.99,
      "lastCheckedAt": "2026-05-18T12:34:56Z",
      "dailyHistory": [
        { "date": "2026-02-17", "status": "operational" },
        ...90 entries
      ],
      "checks": [
        { "id": "...", "name": "Health endpoint", "status": "operational", "lastLatencyMs": 142, "lastCheckedAt": "..." }
      ]
    }
  ],
  "activeIncidents": [
    {
      "id": "...",
      "title": "Mail delivery delays",
      "status": "monitoring",
      "impact": "major",
      "affectedComponentIds": ["..."],
      "startedAt": "...",
      "updates": [{ "id": "...", "status": "monitoring", "body": "Fix deployed; watching.", "createdAt": "..." }]
    }
  ],
  "upcomingMaintenances": [],
  "pastIncidents": [
    { "id": "...", "title": "...", "impact": "minor", "startedAt": "...", "resolvedAt": "...", "affectedComponentIds": [] }
  ],
  "generatedAt": "2026-05-18T12:34:58Z",
  "windowHours": 24
}`}
        />
      </Section>

      <Section
        id="embed"
        title="Embed widget"
        description="Embed your status badge in your own site with an iframe. Locale-aware (?lang=), light/dark mode automatic."
      >
        <Para>
          The dashboard Overview → "Embed widget" panel shows the full
          snippet with your slug. Typical usage:
        </Para>
        <CodeBlock
          lang="html"
          code={`<iframe
  src="https://status.sentroy.com/p/my-app/embed"
  width="320"
  height="80"
  style="border:0"
  loading="lazy"
></iframe>`}
        />
        <Callout variant="info" title="Embed origin allow-list">
          <Para>
            Add the origins that may embed your widget under Settings →
            "Allowed embed origins" (e.g.{" "}
            <InlineCode>https://my-app.com</InlineCode>). Leaving the list
            empty disables embedding.
          </Para>
        </Callout>
      </Section>

      <Section
        id="webhook-signature"
        title="Webhook signature verification"
        description="Sentroy signs every webhook payload with HMAC-SHA256. Your endpoint MUST verify the signature."
      >
        <Para>
          Sentroy signs each payload with the subscriber's{" "}
          <InlineCode>managementToken</InlineCode> using HMAC-SHA256. Check
          the <InlineCode>X-Sentroy-Signature: sha256=&lt;hex&gt;</InlineCode>{" "}
          header.
        </Para>
        <CodeTabsServer
          tabs={[
            {
              label: "Node.js",
              lang: "js" as const,
              code: `import { createHmac, timingSafeEqual } from "node:crypto"

function verifySentroyWebhook(rawBody, signatureHeader, secret) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  const provided = (signatureHeader || "").replace(/^sha256=/, "")
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
}

// Express example:
app.post("/sentroy-status-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifySentroyWebhook(
    req.body, // RAW buffer — verify BEFORE JSON.parse
    req.headers["x-sentroy-signature"],
    process.env.SENTROY_WEBHOOK_SECRET, // managementToken from signup response
  )
  if (!ok) return res.status(401).end()

  const event = JSON.parse(req.body.toString())
  // ... your logic
  res.json({ ok: true })
})`,
            },
            {
              label: "Python",
              lang: "python" as const,
              code: `import hmac, hashlib

def verify_sentroy_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    provided = (signature_header or "").removeprefix("sha256=")
    return hmac.compare_digest(expected, provided)

# FastAPI example:
@app.post("/sentroy-status-webhook")
async def webhook(request: Request):
    raw = await request.body()
    if not verify_sentroy_webhook(raw, request.headers.get("x-sentroy-signature", ""), SECRET):
        raise HTTPException(401)
    event = json.loads(raw)
    # ... your logic
    return {"ok": True}`,
            },
          ]}
        />
        <Callout variant="warning" title="Retry policy">
          <Para>
            HTTP 5xx or 429 → 3 attempts (0 / 2s / 10s backoff). 4xx (except
            429) → single attempt. Your endpoint must respond 2xx within{" "}
            {`<=`} 10 seconds; otherwise the delivery is marked failed.
          </Para>
        </Callout>
      </Section>

      <PageFooter current="/docs/status-pages" />
    </article>
  )
}

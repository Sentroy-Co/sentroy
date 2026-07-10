import type { Metadata } from "next"
import { CodeBlock } from "../../components/code-block"
import { Callout, Lede, Para, Section, Sub } from "../../components/docs-ui"
import { PageFooter } from "../../components/page-footer"

export const metadata: Metadata = {
  title: "Sentroy vs Mailgun — transactional email API comparison",
  description:
    "Side-by-side comparison: Sentroy (managed, bundled with storage + auth + vault) vs Mailgun (managed SMTP + API, high-volume sender). Migration guide for transactional email APIs.",
}

export default function MailgunComparePage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="mb-3 inline-block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comparison
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Sentroy vs Mailgun</h1>
          <Lede>
            Mailgun is a long-standing, high-volume managed mail platform. Sentroy is a fully managed
            platform where mail is bundled with storage, auth, and env management. This page is an honest
            side-by-side so you can pick the right one — and a migration snippet if you decide to switch.
          </Lede>
        </div>
      </header>

      <Section
        id="quick-comparison"
        title="Quick comparison"
        description="The five questions most teams care about when picking a transactional email vendor."
      >
        <div className="my-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-semibold">&nbsp;</th>
                <th className="px-4 py-2.5 font-semibold">Sentroy</th>
                <th className="px-4 py-2.5 font-semibold">Mailgun</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Pricing model</td>
                <td className="px-4 py-3 text-muted-foreground">Flat platform tier; send volume not metered per email</td>
                <td className="px-4 py-3 text-muted-foreground">Per-email tiered (Foundation / Growth / Scale plans)</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Open formats</td>
                <td className="px-4 py-3 text-muted-foreground">MJML templates, raw MIME, IMAP-backed inbox</td>
                <td className="px-4 py-3 text-muted-foreground">Handlebars templates, raw HTML, route receiver</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Lock-in</td>
                <td className="px-4 py-3 text-muted-foreground">Low — standards-based, exportable</td>
                <td className="px-4 py-3 text-muted-foreground">Moderate — proprietary API, region-locked dashboards</td>
              </tr>
              <tr className="align-top">
                <td className="px-4 py-3 font-medium text-foreground">Bundled with other products</td>
                <td className="px-4 py-3 text-muted-foreground">Storage + auth + env vault + status pages, one tenant</td>
                <td className="px-4 py-3 text-muted-foreground">Email-focused (validate, inbox placement add-ons)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="same"
        title="What is the same"
        description="The places these two products meaningfully overlap."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>Both expose REST APIs and SMTP for transactional send.</li>
          <li>Both handle DKIM, SPF, and DMARC verification.</li>
          <li>Both ship per-domain webhooks with HMAC-signed payloads.</li>
          <li>Both support template variables, attachments, and bulk-friendly recipient arrays.</li>
          <li>Both expose suppressions and bounce / complaint handling.</li>
          <li>Both maintain a queryable mail log for delivery debugging.</li>
        </ul>
      </Section>

      <Section
        id="different"
        title="What is different"
        description="Honest differences in both directions."
      >
        <Sub title="Where Sentroy is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>Multilingual templates as a first-class field shape; no application-side locale switching needed.</li>
            <li>IMAP-backed inbox API — read replies, list folders, mark-as-read, thread by subject, all from the same client.</li>
            <li>Same access token reaches storage / auth / env vault — one credential, one billing line.</li>
            <li>Flat platform pricing — high-volume bursts don&apos;t spike the bill.</li>
          </ul>
        </Sub>

        <Sub title="Where Mailgun is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>Massive scale operator — petabyte-class send infrastructure across multiple regions.</li>
            <li>Inbox placement and email validation services available as paid add-ons.</li>
            <li>Email parsing &quot;routes&quot; for incoming mail handling — mature, well-documented.</li>
            <li>EU and US regional accounts for data residency.</li>
            <li>Longer track record on regulated industry compliance (HIPAA BAAs, etc.).</li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="pick-sentroy"
        title="When to pick Sentroy"
        description="Concrete situations where Sentroy is the better call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You want a bundled platform — email plus storage, auth, and config — instead of stitching four vendors.</li>
          <li>You ship multilingual transactional email and want translations inside the template, not your app.</li>
          <li>You need an inbox API for replies, not just a send API — support / reply-flow products benefit.</li>
        </ul>
      </Section>

      <Section
        id="stick-with-mailgun"
        title="When to stick with Mailgun"
        description="Cases where staying on Mailgun is the right call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You send millions of emails per day and need a vendor with proven multi-region throughput at that scale.</li>
          <li>You depend on Mailgun&apos;s validation or inbox-placement add-ons that don&apos;t have a 1:1 equivalent yet.</li>
          <li>You have a signed HIPAA BAA or a long-standing reputation IP pool you don&apos;t want to migrate.</li>
        </ul>
        <Callout title="No salt in the wound">
          Mailgun is a solid choice at high volume. If sub-second-per-domain throughput at millions of sends a
          day is your bottleneck, the migration cost won&apos;t pay back yet.
        </Callout>
      </Section>

      <Section
        id="migration"
        title="Migration"
        description="One operation, both APIs side by side."
      >
        <Para>Sending a transactional email with template variables:</Para>

        <CodeBlock
          lang="ts"
          filename="before.ts — Mailgun"
          code={`import formData from "form-data"
import Mailgun from "mailgun.js"

const mailgun = new Mailgun(formData)
const mg = mailgun.client({ username: "api", key: process.env.MAILGUN_API_KEY! })

await mg.messages.create("acme.dev", {
  from: "Acme <onboarding@acme.dev>",
  to: "user@example.com",
  subject: "Welcome to Acme",
  template: "welcome",
  "h:X-Mailgun-Variables": JSON.stringify({ name: "Jane" }),
})`}
        />

        <CodeBlock
          lang="ts"
          filename="after.ts — Sentroy"
          code={`import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "acme",
  accessToken: process.env.SENTROY_ACCESS_TOKEN!,
})

await sentroy.send.email({
  from: "onboarding@acme.dev",
  to: "user@example.com",
  subject: "Welcome to Acme",
  domainId: "<acme-domain-id>",
  templateId: "<welcome-template-id>",
  variables: { name: "Jane" },
})`}
        />

        <Para>
          Mailgun&apos;s <code>h:X-Mailgun-Variables</code> header becomes a typed
          <code> variables </code> object on Sentroy; both feed the same template substitution at send time.
        </Para>
      </Section>

      <PageFooter current="/docs/compare/mailgun" />
    </article>
  )
}

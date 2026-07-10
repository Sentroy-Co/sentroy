import type { Metadata } from "next"
import { CodeBlock } from "../../components/code-block"
import { Callout, Lede, Para, Section, Sub } from "../../components/docs-ui"
import { PageFooter } from "../../components/page-footer"

export const metadata: Metadata = {
  title: "Sentroy vs Resend — transactional email API comparison",
  description:
    "Side-by-side comparison: Sentroy (managed, bundled with storage + auth + vault) vs Resend (managed, mail-only). Migration guide for transactional email APIs.",
}

export default function ResendComparePage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="mb-3 inline-block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comparison
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Sentroy vs Resend</h1>
          <Lede>
            Resend is a polished managed email API. Sentroy is a fully managed platform where transactional email is
            one of several bundled services (mail, storage, auth, env vault). This page is an honest side-by-side
            so you can pick the right one for your team — and a migration snippet if you decide to switch.
          </Lede>
        </div>
      </header>

      <Section
        id="quick-comparison"
        title="Quick comparison"
        description="The five questions most teams actually care about when picking a transactional email vendor."
      >
        <div className="my-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-semibold">&nbsp;</th>
                <th className="px-4 py-2.5 font-semibold">Sentroy</th>
                <th className="px-4 py-2.5 font-semibold">Resend</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Pricing model</td>
                <td className="px-4 py-3 text-muted-foreground">Flat platform tier; mail volume not metered per send</td>
                <td className="px-4 py-3 text-muted-foreground">Per-email metered ($/email above free tier)</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Open formats</td>
                <td className="px-4 py-3 text-muted-foreground">MJML templates, raw MIME, IMAP-backed inbox</td>
                <td className="px-4 py-3 text-muted-foreground">React Email components, raw HTML</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Lock-in</td>
                <td className="px-4 py-3 text-muted-foreground">Low — standards-based, exportable</td>
                <td className="px-4 py-3 text-muted-foreground">Moderate — proprietary API + dashboard</td>
              </tr>
              <tr className="align-top">
                <td className="px-4 py-3 font-medium text-foreground">Bundled with other products</td>
                <td className="px-4 py-3 text-muted-foreground">Storage + auth + env vault + status pages, one tenant</td>
                <td className="px-4 py-3 text-muted-foreground">Email-only; pair other services yourself</td>
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
          <li>Both expose a clean REST API for transactional send with Bearer-token auth.</li>
          <li>Both handle DKIM, SPF, and DMARC for verified domains.</li>
          <li>Both deliver webhook events for <code>sent</code>, <code>bounced</code>, <code>opened</code>, <code>clicked</code>, and <code>unsubscribed</code>.</li>
          <li>Both support per-domain webhook scoping with HMAC-signed payloads.</li>
          <li>Both have first-class TypeScript SDKs with full typings.</li>
          <li>Both let you template once and reuse across sends.</li>
        </ul>
      </Section>

      <Section
        id="different"
        title="What is different"
        description="Honest differences in both directions — neither product is strictly better."
      >
        <Sub title="Where Sentroy is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>Multilingual templates as a first-class shape (<code>{`{tr, en, ...}`}</code> per field) — no extra plumbing to ship locale-aware email.</li>
            <li>IMAP-backed inbox API for reading replies, not just sending. Threading, folders, mark-as-read all included.</li>
            <li>Same access token also reaches storage, auth projects, and env vault — one credential per company.</li>
            <li>Flat pricing — send volume isn&apos;t the meter, so high-volume bursts don&apos;t spike the bill.</li>
          </ul>
        </Sub>

        <Sub title="Where Resend is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>Larger ecosystem of pre-built React Email templates and integrations.</li>
            <li>Longer track record on deliverability — more years of IP warmup and reputation history.</li>
            <li>Generous free tier for early-stage projects (3k emails / month at the time of writing).</li>
            <li>More polished dashboard for non-developers reviewing delivery metrics.</li>
            <li>SOC 2 Type II audited; some regulated buyers require this checkbox.</li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="pick-sentroy"
        title="When to pick Sentroy"
        description="Concrete situations where Sentroy is the better call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You want one vendor for email + file storage + auth, and you don&apos;t want to wire three SDKs and three billing relationships together.</li>
          <li>You ship a multilingual product and want template translations to live in the template itself, not in your application code.</li>
          <li>You need both send and inbox in the same API — e.g. a support inbox that reads replies and threads them with the original transactional send.</li>
        </ul>
      </Section>

      <Section
        id="stick-with-resend"
        title="When to stick with Resend"
        description="Cases where staying on Resend is the right call — we'd rather you pick the right tool than churn after a month."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You only need email and you already have storage / auth solved elsewhere — the bundle isn&apos;t a draw.</li>
          <li>You&apos;ve invested heavily in React Email components and your team prefers JSX over MJML.</li>
          <li>You need a vendor with a multi-year audited deliverability record on day one of a regulated launch.</li>
        </ul>
        <Callout title="No salt in the wound">
          Resend ships a good product. If the bundle isn&apos;t a draw and your sending volume fits their free tier
          comfortably, staying put is rational.
        </Callout>
      </Section>

      <Section
        id="migration"
        title="Migration"
        description="One operation, both APIs side by side. Most ports take an afternoon — the SDK shape is intentionally familiar."
      >
        <Para>Sending a transactional email with a template and variables:</Para>

        <CodeBlock
          lang="ts"
          filename="before.ts — Resend"
          code={`import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

await resend.emails.send({
  from: "Acme <onboarding@acme.dev>",
  to: "user@example.com",
  subject: "Welcome to Acme",
  react: WelcomeEmail({ name: "Jane" }),
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
          The Sentroy template lives on the server, so the body markup ships once and renders with whichever
          variables you pass at send time. Multilingual templates auto-pick the locale via the
          <code> lang </code> field.
        </Para>
      </Section>

      <PageFooter current="/docs/compare/resend" />
    </article>
  )
}

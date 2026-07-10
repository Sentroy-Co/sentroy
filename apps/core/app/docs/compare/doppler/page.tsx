import type { Metadata } from "next"
import { CodeBlock } from "../../components/code-block"
import { Callout, Lede, Para, Section, Sub } from "../../components/docs-ui"
import { PageFooter } from "../../components/page-footer"

export const metadata: Metadata = {
  title: "Sentroy vs Doppler — config and secrets management comparison",
  description:
    "Side-by-side comparison: Sentroy Env Vault (managed, bundled with mail + storage + auth) vs Doppler (managed secrets manager). Migration guide for runtime environment variable management.",
}

export default function DopplerComparePage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="mb-3 inline-block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comparison
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Sentroy vs Doppler</h1>
          <Lede>
            Doppler is a focused, polished secrets manager. Sentroy Env Vault is a managed alternative bundled
            with the rest of the Sentroy platform — runtime env injection, CLI push/pull/diff, webhook-based
            invalidation. This page is an honest side-by-side so you can pick the right one — and a migration
            snippet if you decide to switch.
          </Lede>
        </div>
      </header>

      <Section
        id="quick-comparison"
        title="Quick comparison"
        description="The five questions most teams care about when picking a secrets / config vendor."
      >
        <div className="my-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-semibold">&nbsp;</th>
                <th className="px-4 py-2.5 font-semibold">Sentroy</th>
                <th className="px-4 py-2.5 font-semibold">Doppler</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Pricing model</td>
                <td className="px-4 py-3 text-muted-foreground">Flat platform tier; secrets count not metered</td>
                <td className="px-4 py-3 text-muted-foreground">Per-seat (Developer free → Team / Enterprise tiers)</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Open formats</td>
                <td className="px-4 py-3 text-muted-foreground">Standard .env import/export; JSON/YAML/Docker formats on read</td>
                <td className="px-4 py-3 text-muted-foreground">Standard .env + JSON/YAML/Docker on read</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Lock-in</td>
                <td className="px-4 py-3 text-muted-foreground">Low — .env import/export, public/private split is metadata</td>
                <td className="px-4 py-3 text-muted-foreground">Low — easy export, but per-seat billing scales with team</td>
              </tr>
              <tr className="align-top">
                <td className="px-4 py-3 font-medium text-foreground">Bundled with other products</td>
                <td className="px-4 py-3 text-muted-foreground">Mail + storage + auth, one tenant, one access token</td>
                <td className="px-4 py-3 text-muted-foreground">Secrets-only; pair other services yourself</td>
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
          <li>Both let you centralize env per project / environment (dev, staging, prod).</li>
          <li>Both support CLI <code>push</code> / <code>pull</code> / <code>diff</code> workflows.</li>
          <li>Both ship an audit log of changes and rollbacks.</li>
          <li>Both support webhook-based invalidation so deploys can pick up changes without a rebuild.</li>
          <li>Both expose a server-side runtime fetch so values can change without redeploying.</li>
          <li>Both support .env import on day one and re-export on the way out.</li>
        </ul>
      </Section>

      <Section
        id="different"
        title="What is different"
        description="Honest differences in both directions."
      >
        <Sub title="Where Sentroy is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>Bundled with mail, storage, and auth — one access token, one billing line, one company tenant.</li>
            <li>No per-seat pricing — adding a developer to the team doesn&apos;t bump the bill.</li>
            <li>Public/private split is first-class: <code>useEnv()</code> on the React side only ever sees the public bucket.</li>
            <li><code>getEnv()</code> server helper + <code>useEnv()</code> React hook ship in the same package.</li>
          </ul>
        </Sub>

        <Sub title="Where Doppler is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>Mature integration catalog — GitHub Actions, Vercel, AWS Secrets Manager sync, Kubernetes operator, Terraform.</li>
            <li>Service token rotation policies and IP allowlisting on higher tiers.</li>
            <li>Branch-based config inheritance — useful for review apps and ephemeral environments.</li>
            <li>SOC 2 Type II / ISO 27001 audited; some regulated buyers require this checkbox.</li>
            <li>Longer track record as a dedicated secrets vendor — focused product surface.</li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="pick-sentroy"
        title="When to pick Sentroy"
        description="Concrete situations where Sentroy is the better call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You already use Sentroy for mail / storage / auth — adding env to the same tenant is one less vendor to manage.</li>
          <li>Your team is growing and per-seat secrets pricing is becoming a planning concern.</li>
          <li>You want one helper (<code>getEnv()</code> / <code>useEnv()</code>) that handles server / client split without ceremony.</li>
        </ul>
      </Section>

      <Section
        id="stick-with-doppler"
        title="When to stick with Doppler"
        description="Cases where staying on Doppler is the right call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You depend on the Doppler Kubernetes operator or one of their first-party integrations (Terraform, AWS SM sync) and the parity isn&apos;t there yet.</li>
          <li>You need branch-based config inheritance for review apps as a turnkey feature.</li>
          <li>Your compliance team requires a vendor with SOC 2 Type II as a published checkbox today.</li>
        </ul>
        <Callout title="No salt in the wound">
          Doppler is a focused, well-built product. If your integrations catalog or compliance posture rules
          things, the bundle isn&apos;t enough of a draw.
        </Callout>
      </Section>

      <Section
        id="migration"
        title="Migration"
        description="One operation, both SDKs side by side."
      >
        <Para>Read a secret at runtime from a Node.js server:</Para>

        <CodeBlock
          lang="ts"
          filename="before.ts — Doppler"
          code={`import "dopplersdk"
import { DopplerSDK } from "@dopplerhq/node-sdk"

const doppler = new DopplerSDK({
  accessToken: process.env.DOPPLER_TOKEN!,
})

const { value } = await doppler.secrets.get(
  "acme",      // project
  "prd",       // config
  "DATABASE_URL",
)

const db = connect(value.raw!)`}
        />

        <CodeBlock
          lang="ts"
          filename="after.ts — Sentroy"
          code={`import { getEnv } from "@sentroy-co/env-vault"

// One call returns the merged public + private env for this deploy.
// Bootstrap token comes from process.env.SENTROY_ENV_BOOTSTRAP at startup.
const env = await getEnv()

const db = connect(env.DATABASE_URL)`}
        />

        <Para>
          The Sentroy bootstrap token is set once per deploy. From then on, env-vault changes propagate via
          webhook invalidation — the next <code>getEnv()</code> call returns fresh values without a redeploy.
        </Para>
      </Section>

      <PageFooter current="/docs/compare/doppler" />
    </article>
  )
}

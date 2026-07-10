import type { Metadata } from "next"
import { CodeBlock } from "../../components/code-block"
import { Callout, Lede, Para, Section, Sub } from "../../components/docs-ui"
import { PageFooter } from "../../components/page-footer"

export const metadata: Metadata = {
  title: "Sentroy vs Firebase Auth — auth-as-a-service comparison",
  description:
    "Side-by-side comparison: Sentroy Auth Projects (managed, no per-MAU pricing) vs Firebase Auth (managed, MAU-priced, GCP-locked). Migration guide for end-user authentication.",
}

export default function FirebaseAuthComparePage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="mb-3 inline-block font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comparison
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Sentroy vs Firebase Auth</h1>
          <Lede>
            Firebase Auth is the long-time default for end-user authentication in mobile and web apps. Sentroy
            Auth Projects is a managed alternative — per-app user pools, JWT/JWKS, MFA, social login — bundled
            with the rest of the Sentroy platform. This page is an honest comparison and migration snippet.
          </Lede>
        </div>
      </header>

      <Section
        id="quick-comparison"
        title="Quick comparison"
        description="The five questions most teams care about when picking an auth provider."
      >
        <div className="my-5 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-semibold">&nbsp;</th>
                <th className="px-4 py-2.5 font-semibold">Sentroy</th>
                <th className="px-4 py-2.5 font-semibold">Firebase Auth</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Pricing model</td>
                <td className="px-4 py-3 text-muted-foreground">Flat platform tier — MAU not metered</td>
                <td className="px-4 py-3 text-muted-foreground">Free up to 50k MAU, then per-MAU + per-SMS</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Open formats</td>
                <td className="px-4 py-3 text-muted-foreground">Standard JWT (RS256) + JWKS, OIDC-compliant</td>
                <td className="px-4 py-3 text-muted-foreground">Standard JWT + JWKS, OIDC-style claims</td>
              </tr>
              <tr className="border-b border-border/60 align-top">
                <td className="px-4 py-3 font-medium text-foreground">Lock-in</td>
                <td className="px-4 py-3 text-muted-foreground">Low — export users (incl. password hashes), portable JWT</td>
                <td className="px-4 py-3 text-muted-foreground">High — GCP ecosystem; hash export possible but friction-heavy</td>
              </tr>
              <tr className="align-top">
                <td className="px-4 py-3 font-medium text-foreground">Bundled with other products</td>
                <td className="px-4 py-3 text-muted-foreground">Mail + storage + env vault, same tenant</td>
                <td className="px-4 py-3 text-muted-foreground">Firestore + Cloud Functions + Storage (Google ecosystem)</td>
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
          <li>Both ship per-app end-user pools with email/password, social, and magic-link login.</li>
          <li>Both issue JWT access tokens with refresh-token rotation.</li>
          <li>Both publish JWKS endpoints for token verification on your backend.</li>
          <li>Both support TOTP / SMS MFA (Sentroy supports TOTP today; SMS via integration).</li>
          <li>Both expose a self-service <code>/me</code> account-management surface.</li>
          <li>Both ship React, React Native, and web SDKs.</li>
        </ul>
      </Section>

      <Section
        id="different"
        title="What is different"
        description="Honest differences in both directions."
      >
        <Sub title="Where Sentroy is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>No per-MAU pricing — you don&apos;t pay more as your user base grows.</li>
            <li>Bundled with mail (verification + reset emails go through the same platform) and storage (avatar uploads).</li>
            <li>Per-project RS256 keypair stored in your DB, published on a per-project JWKS endpoint — no shared Google signing keys.</li>
            <li>Webhook delivery on auth lifecycle events (signup, login, MFA enrollment, password reset) — same shape as the rest of the platform.</li>
          </ul>
        </Sub>

        <Sub title="Where Firebase Auth is different">
          <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
            <li>Deep integration with Firestore security rules, Cloud Functions triggers, and Realtime Database.</li>
            <li>Phone-number login with carrier-grade SMS delivery infrastructure built in.</li>
            <li>Pre-built mobile UI (FirebaseUI) for iOS, Android, and web — battle-tested.</li>
            <li>App Check for client-attestation, useful for abuse mitigation on mobile.</li>
            <li>Google&apos;s identity ecosystem on day one — Workspace SSO, Identity Platform upgrade path.</li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="pick-sentroy"
        title="When to pick Sentroy"
        description="Concrete situations where Sentroy is the better call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>You expect to cross 50k MAU within a year and the Firebase per-MAU bill becomes a planning concern.</li>
          <li>You need to keep user data on EU infrastructure (or any specific jurisdiction) without ceremony.</li>
          <li>You want auth verification / password-reset emails to ship through your own verified domain on the same platform.</li>
          <li>You already use Sentroy for mail or storage — sharing one access token and one company tenant is cleaner than wiring two SDKs.</li>
        </ul>
      </Section>

      <Section
        id="stick-with-firebase"
        title="When to stick with Firebase Auth"
        description="Cases where staying on Firebase is the right call."
      >
        <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-muted-foreground">
          <li>Your app is deeply tied to Firestore security rules or Cloud Functions auth triggers — re-wiring those costs more than the migration saves.</li>
          <li>You rely on phone-number login at high volume and need Google&apos;s SMS routing.</li>
          <li>You&apos;re below 50k MAU and Firebase is effectively free; the bundle isn&apos;t a draw yet.</li>
        </ul>
        <Callout title="No salt in the wound">
          Firebase Auth is mature and well-supported. If you live inside the GCP ecosystem and the MAU ceiling
          isn&apos;t in sight, staying is rational.
        </Callout>
      </Section>

      <Section
        id="migration"
        title="Migration"
        description="One operation, both SDKs side by side."
      >
        <Para>Email/password signup on the client:</Para>

        <CodeBlock
          lang="ts"
          filename="before.ts — Firebase Auth"
          code={`import { initializeApp } from "firebase/app"
import {
  getAuth,
  createUserWithEmailAndPassword,
} from "firebase/auth"

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: "acme.firebaseapp.com",
  projectId: "acme",
})

const auth = getAuth(app)
const cred = await createUserWithEmailAndPassword(
  auth,
  "user@example.com",
  "correct horse battery staple",
)
console.log(await cred.user.getIdToken())`}
        />

        <CodeBlock
          lang="ts"
          filename="after.ts — Sentroy"
          code={`import { SentroyAuth } from "@sentroy-co/auth-sdk"

const auth = new SentroyAuth({
  baseUrl: "https://auth.sentroy.com",
  projectSlug: "acme",
  publishableKey: process.env.NEXT_PUBLIC_SENTROY_AUTH_PUB_KEY!,
})

const { user, accessToken } = await auth.signup({
  email: "user@example.com",
  password: "correct horse battery staple",
})
console.log(accessToken)`}
        />

        <Para>
          The returned <code>accessToken</code> is a standard RS256 JWT — verify it on your backend with the
          per-project JWKS endpoint at <code>/api/v1/auth/&lt;slug&gt;/jwks.json</code>. No vendor SDK required
          on the server.
        </Para>
      </Section>

      <PageFooter current="/docs/compare/firebase-auth" />
    </article>
  )
}

import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { CodeTabsServer } from "../components/code-tabs-server"
import { Callout, Endpoint, Lede, Para, Section, Sub } from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "Auth Projects — auth-as-a-service",
  description:
    "Sentroy Auth Projects is a Firebase Auth / Auth0 / Clerk alternative — per-app end-user pools with JWT/JWKS, MFA, social login, refresh-token rotation, React + RN SDKs. No per-MAU pricing.",
}

export default function AuthProjectsDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / Auth Projects
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Auth Projects
          </h1>
          <Lede>
            A Firebase Auth alternative — host your own app&rsquo;s end-user
            pool on Sentroy. Email/password, 6 social provider federation
            (Google, GitHub, Facebook, Microsoft, X, Apple), passkey
            (WebAuthn), TOTP MFA, magic link, invitation flow, webhook
            delivery, self-service account management, and Sentroy-hosted
            UI included. Per-project RS256 JWT + JWKS publish + RFC 9700
            refresh token rotation.
          </Lede>
        </div>
      </header>

      <Section
        id="vs-oauth"
        title='"Sign in with Sentroy" vs Auth Project'
        description="The two products solve different problems — decide which one is right for you before you start."
      >
        <div className="my-4 overflow-hidden rounded-md border text-sm">
          <table className="w-full">
            <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left"></th>
                <th className="px-4 py-2 text-left">Sign in with Sentroy</th>
                <th className="px-4 py-2 text-left">Auth Project</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-xs">
                  User base
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Already has a Sentroy account
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Your own user pool (Sentroy doesn&rsquo;t know it)
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-xs">Pattern</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  OAuth 2.0 / OIDC federation
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Direct signup/login API + SDK
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-xs">Flow</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Redirect → consent → callback
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Form submit → token returned
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-xs">JWT</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Sentroy global key (HS/RS256)
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Per-project RS256 + JWKS
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-xs">Branding</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Sentroy consent screen
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Entirely yours (logo, color, copy)
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-xs">Similar product</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Sign in with Google/Apple
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Firebase Auth, Auth0, Clerk
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium text-xs">SDK</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  Any OAuth lib (NextAuth, Authlib)
                </td>
                <td className="px-4 py-2 text-muted-foreground text-xs">
                  <InlineCode>@sentroy-co/client-sdk/auth</InlineCode>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Para>
          <strong>Quick decision:</strong> If you want your users to sign in
          with an existing Sentroy account (e.g. an internal tool) →{" "}
          <a href="/docs/auth" className="underline">Sign in with Sentroy</a>.
          If you want to host your own user pool from scratch (consumer
          product, multi-tenant SaaS) → Auth Project, this page.
        </Para>
      </Section>

      <Section
        id="setup"
        title="Setup"
        description="Create an Auth Project in the Sentroy dashboard — then wire the SDK into your backend."
      >
        <Para>
          <strong>1.</strong> Log in to{" "}
          <InlineCode>auth.sentroy.com</InlineCode> and create a new project
          from the <strong>Auth Projects</strong> sidebar entry. The wizard
          walks you through these steps:
        </Para>
        <ul className="my-4 ml-6 list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            <strong>Name + Slug</strong> — the slug appears in public URLs
            (<InlineCode>auth.sentroy.com/p/&lt;slug&gt;</InlineCode>) and
            can&rsquo;t be changed later.
          </li>
          <li>
            <strong>Branding</strong> — primary color + display name +
            logo URL. Becomes your brand identity in the mail templates and
            on the verify-email / reset-password / login / signup landing
            pages.
          </li>
          <li>
            <strong>Email verification</strong> — when enabled, a user
            can&rsquo;t log in after signup until they click the mail link.
          </li>
          <li>
            <strong>Magic link</strong> — passwordless login flow.
          </li>
          <li>
            <strong>Allowed origins (CORS)</strong> — the origins that will
            call the public auth API from the browser. If left empty, only
            server-to-server usage is allowed (browser CORS is rejected).
          </li>
          <li>
            <strong>Social providers</strong> — Google / GitHub / Facebook
            / Microsoft / X / Apple credentials (each optional). When
            triggered, a Sentroy-hosted authorize URL is generated.
          </li>
        </ul>
        <Para>
          The create response shows the{" "}
          <strong>plaintext API key</strong>{" "}
          (<InlineCode>aps_...</InlineCode>) once — copy it into your RP
          backend&rsquo;s env (e.g.{" "}
          <InlineCode>SENTROY_AUTH_API_KEY</InlineCode>). Only the hash
          stays in the DB; you can&rsquo;t recover the plaintext. If it
          leaks, rotate it from the dashboard.
        </Para>
        <Callout variant="warning">
          <strong>Don&rsquo;t put the master API key in the browser.</strong>{" "}
          <InlineCode>aps_</InlineCode> is server-only — the RP&rsquo;s
          master credential. It is authorized for all user operations and
          lives in the RP&rsquo;s backend env. The browser SDK also consumes
          this key (like Firebase&rsquo;s admin SDK pattern) — a
          browser-safe public key tier is coming in v2.
        </Callout>
      </Section>

      <Section
        id="quickstart"
        title="Quickstart"
        description="Install the SDK, initialize the project, run your first signup."
      >
        <Para>
          <strong>npm:</strong>{" "}
          <InlineCode>npm install @sentroy-co/client-sdk</InlineCode>
          {" "}(v2.13.9+ — auth module included)
        </Para>
        <Para>
          For passkey support, an optional peer dep:{" "}
          <InlineCode>npm install @simplewebauthn/browser</InlineCode>
        </Para>
        <CodeTabsServer
          tabs={[
            {
              label: "TypeScript (Browser)",
              lang: "ts",
              code: `// app/lib/sentroy-auth.ts
import { SentroyAuth } from "@sentroy-co/client-sdk/auth"

export const auth = new SentroyAuth({
  projectSlug: "acme-app",
  apiKey: process.env.NEXT_PUBLIC_SENTROY_AUTH_API_KEY!,
  storage: "localStorage", // "memory" | "localStorage" | custom adapter
})

// Firebase-style subscription
auth.onAuthStateChanged((user) => {
  console.log(user ? "signed in: " + user.email : "signed out")
})

// Signup — if emailVerification is on, no tokens are returned, a mail is sent
await auth.signUp({ email: "alice@example.com", password: "hunter2-strong" })

// Login — MFA-aware discriminated union
const out = await auth.signIn({
  email: "alice@example.com",
  password: "hunter2-strong",
  rememberMe: true, // extends the refresh token TTL (30d → 90d)
})

if (out.kind === "mfa") {
  // Prompt the user for a TOTP code or recovery code
  const code = prompt("MFA code")
  await auth.verifyMfa({ mfaToken: out.data.mfaToken, code })
} else {
  // out.data.user, out.data.accessToken ready
  console.log("logged in:", out.data.user)
}

await auth.signOut()`,
            },
            {
              label: "React",
              lang: "tsx",
              code: `// app/providers.tsx
"use client"
import { SentroyAuthProvider } from "@sentroy-co/client-sdk/auth/react"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SentroyAuthProvider
      projectSlug="acme-app"
      apiKey={process.env.NEXT_PUBLIC_SENTROY_AUTH_API_KEY!}
      // auto-consume the social-login redirect fragment (default true)
      autoConsumeFragment
    >
      {children}
    </SentroyAuthProvider>
  )
}

// app/account/page.tsx
"use client"
import { useAuth } from "@sentroy-co/client-sdk/auth/react"

export default function Account() {
  const { user, loading, signIn, signOut } = useAuth()

  if (loading) return <Spinner />
  if (!user) return <SignInForm onSubmit={signIn} />

  return (
    <div>
      <h1>Hi, {user.displayName ?? user.email}</h1>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  )
}`,
            },
            {
              label: "Server admin (Node)",
              lang: "ts",
              code: `// app/api/me/route.ts (Next.js — verify access token server-side)
import { SentroyAuthAdmin } from "@sentroy-co/client-sdk/auth/admin"

const admin = new SentroyAuthAdmin({
  projectSlug: "acme-app",
  apiKey: process.env.SENTROY_AUTH_API_KEY!,
  jwksCacheTtl: 3600, // seconds, default 1h
})

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\\s+/, "")
  if (!token) return Response.json({ error: "no_token" }, { status: 401 })

  try {
    const claims = await admin.verifyIdToken(token)
    return Response.json({ user: claims })
  } catch {
    return Response.json({ error: "invalid_token" }, { status: 401 })
  }
}

// Server-side signup (the RP's onboarding flow)
const res = await admin.users.create({
  email: "bob@example.com",
  password: "tempPass123",
  metadata: { plan: "trial", inviter: "alice" },
})

// Server-side signin (for a cookie-based session)
const out = await admin.users.signIn({ email, password })
if (out.kind === "tokens") {
  setCookie("at", out.data.accessToken, { httpOnly: true })
}`,
            },
            {
              label: "cURL",
              lang: "bash",
              code: `# 1. Signup (RP backend → Sentroy)
curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/signup \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"alice@example.com","password":"hunter2-strong","displayName":"Alice"}'

# 2. Login
curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/login \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"alice@example.com","password":"hunter2-strong"}'
# → { accessToken, refreshToken, user } or { mfaRequired, mfaToken }

# 3. Refresh (RFC 9700 family rotation)
curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/refresh \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -d '{"refreshToken":"apt_..."}'

# 4. /me (with the user's access token)
curl https://auth.sentroy.com/api/v1/auth/acme-app/me \\
  -H "Authorization: Bearer <access-token>"`,
            },
          ]}
        />
      </Section>

      <Section
        id="sdk-react"
        title="React SDK"
        description="@sentroy-co/client-sdk/auth/react — Provider + 5 reactive hook."
      >
        <Para>
          <InlineCode>SentroyAuthProvider</InlineCode> holds a single SDK
          instance; all hooks run through it. On mount the provider restores
          from storage and consumes the social-login fragment (if present).
        </Para>
        <div className="my-4 overflow-hidden rounded-md border text-sm">
          <table className="w-full">
            <thead className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Hook</th>
                <th className="px-3 py-2 text-left">Returns</th>
                <th className="px-3 py-2 text-left">Usage</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">useAuth()</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <InlineCode>{`{ auth, user, loading, signIn, signUp, signOut, sendPasswordReset, verifyEmail, verifyMfa, sendMagicLink, consumeMagicLink, acceptInvitation, socialAuthorizeUrl, consumeRedirectFragment }`}</InlineCode>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  All auth actions + reactive user state
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">useUser()</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <InlineCode>SentroyAuthUser | null</InlineCode>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  When you only need the current user
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">useSessions()</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <InlineCode>{`{ sessions, loading, error, refresh, revoke }`}</InlineCode>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  Active session list — security/devices page
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">useActivity()</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <InlineCode>{`{ activity, loading, error, refresh }`}</InlineCode>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  Audit log — login/password-change/MFA/etc
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">useMfa()</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <InlineCode>{`{ status, loading, error, refresh, enrollTotp, verifyTotpEnrollment, disableTotp }`}</InlineCode>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  TOTP enrollment + status
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono text-xs">usePasskeys()</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <InlineCode>{`{ passkeys, loading, error, refresh, register, remove }`}</InlineCode>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  Passkey list/register/delete (WebAuthn)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeBlock
          lang="tsx"
          code={`"use client"
import { useAuth, useSessions, useMfa, usePasskeys } from "@sentroy-co/client-sdk/auth/react"

export function SecurityPage() {
  const { user } = useAuth()
  const { sessions, revoke } = useSessions()
  const { status, enrollTotp, verifyTotpEnrollment, disableTotp } = useMfa()
  const { passkeys, register, remove } = usePasskeys()

  return (
    <div>
      <h2>Active sessions</h2>
      {sessions?.map((s) => (
        <div key={s.id}>
          {s.userAgent} · {s.ip}
          <button onClick={() => revoke(s.id)}>Revoke</button>
        </div>
      ))}

      <h2>Two-factor auth</h2>
      {status?.enrolled ? (
        <button onClick={() => disableTotp(currentPassword)}>Disable TOTP</button>
      ) : (
        <button onClick={async () => {
          const { secret, otpauthUri } = await enrollTotp()
          // Render a QR code from otpauthUri; the user enters the 6-digit code:
          await verifyTotpEnrollment(code)
        }}>Enroll TOTP</button>
      )}

      <h2>Passkeys</h2>
      <button onClick={() => register("MacBook Touch ID")}>Add passkey</button>
      {passkeys?.map((p) => (
        <div key={p.id}>
          {p.deviceName} <button onClick={() => remove(p.id)}>Remove</button>
        </div>
      ))}
    </div>
  )
}`}
        />
      </Section>

      <Section
        id="react-native"
        title="React Native / Expo"
        description="@sentroy-co/client-sdk/auth works on Expo — you just pass a storage adapter. WebAuthn passkeys are web-only."
      >
        <Para>
          The SDK is built on a platform-agnostic core; React Native has no{" "}
          <InlineCode>localStorage</InlineCode>, so a{" "}
          <strong>storage adapter</strong> must be provided. Two common
          options: AsyncStorage (fast, not encrypted) or SecureStore (iOS
          Keychain / Android Keystore — recommended for long-lived secrets
          like the refresh token). For social login,{" "}
          <InlineCode>expo-web-browser</InlineCode> is used (in-app browser
          session).
        </Para>
        <Para>
          <strong>Install:</strong>{" "}
          <InlineCode>
            expo install @react-native-async-storage/async-storage
            expo-secure-store expo-web-browser
          </InlineCode>
        </Para>
        <CodeTabsServer
          tabs={[
            {
              label: "AsyncStorage",
              lang: "ts",
              code: `// app/lib/sentroy-auth.ts
import AsyncStorage from "@react-native-async-storage/async-storage"
import { SentroyAuth, type SentroyAuthStorage } from "@sentroy-co/client-sdk/auth"

function createAsyncStorageAdapter(): SentroyAuthStorage {
  return {
    getItem: (key) => AsyncStorage.getItem(key),
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    removeItem: (key) => AsyncStorage.removeItem(key),
  }
}

export const auth = new SentroyAuth({
  projectSlug: "acme-app",
  apiKey: process.env.EXPO_PUBLIC_SENTROY_AUTH_API_KEY!,
  storage: createAsyncStorageAdapter(),
})

// Same SDK API — signIn/signUp/onAuthStateChanged are identical to Web:
auth.onAuthStateChanged((user) => {
  console.log(user ? "signed in " + user.email : "signed out")
})`,
            },
            {
              label: "SecureStore",
              lang: "ts",
              code: `// app/lib/sentroy-auth.ts
import * as SecureStore from "expo-secure-store"
import { SentroyAuth, type SentroyAuthStorage } from "@sentroy-co/client-sdk/auth"

// iOS Keychain / Android Keystore — recommended for the refreshToken
function createSecureStoreAdapter(): SentroyAuthStorage {
  return {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      }),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  }
}

export const auth = new SentroyAuth({
  projectSlug: "acme-app",
  apiKey: process.env.EXPO_PUBLIC_SENTROY_AUTH_API_KEY!,
  storage: createSecureStoreAdapter(),
})`,
            },
            {
              label: "Social login",
              lang: "ts",
              code: `// app/screens/SignInScreen.tsx
import * as WebBrowser from "expo-web-browser"
import { auth } from "../lib/sentroy-auth"

WebBrowser.maybeCompleteAuthSession()

export async function signInWithGoogle() {
  const redirectUri = "myapp://auth/callback" // app.config.ts scheme

  const url = auth.socialAuthorizeUrl("google", {
    redirectUri,
    rememberMe: true,
  })

  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri)
  if (result.type !== "success") return

  // Sentroy returns access_token + refresh_token in the fragment
  const fragment = result.url.split("#")[1] ?? ""
  const params = new URLSearchParams(fragment)
  const accessToken = params.get("access_token")
  const refreshToken = params.get("refresh_token")
  if (!accessToken || !refreshToken) return

  await auth.setSession({ accessToken, refreshToken })
  // → onAuthStateChanged fires, user state updates globally
}`,
            },
          ]}
        />
        <Sub id="rn-deep-links" title="Deep link configuration">
          <Para>
            For <InlineCode>expo-web-browser</InlineCode> to return to your
            app from the in-app session, a scheme must be defined in{" "}
            <InlineCode>app.config.ts</InlineCode>. The{" "}
            <InlineCode>myapp://auth/callback</InlineCode> URL resolves to the
            app&rsquo;s deep link handler:
          </Para>
          <CodeBlock
            lang="ts"
            code={`// app.config.ts
export default {
  expo: {
    name: "Acme",
    slug: "acme-app",
    scheme: "myapp", // <-- this makes myapp://... URLs open in the app
    ios: { bundleIdentifier: "com.acme.app" },
    android: { package: "com.acme.app" },
  },
}`}
          />
          <Para>
            In the Sentroy dashboard you need to add{" "}
            <InlineCode>myapp://</InlineCode> to the{" "}
            <strong>Allowed origins</strong> list (in RN the origin is
            scheme-based; the full URL is not whitelisted).
          </Para>
        </Sub>
        <Sub id="rn-loading" title="Hydration race — loading guard">
          <Para>
            On first mount the SDK rehydrates the token from storage — this
            is async. If you don&rsquo;t show a splash/spinner, the user
            briefly sees &ldquo;signed-out&rdquo; and then instantly flips to
            &ldquo;signed-in&rdquo;. <InlineCode>useAuth().loading</InlineCode>{" "}
            exists for exactly this:
          </Para>
          <CodeBlock
            lang="tsx"
            code={`// app/App.tsx
import { SentroyAuthProvider, useAuth } from "@sentroy-co/client-sdk/auth/react"
import { ActivityIndicator, View } from "react-native"
import { auth } from "./lib/sentroy-auth"

function Root() {
  const { user, loading } = useAuth()

  if (loading) {
    // Storage hasn't rehydrated yet — show a splash
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    )
  }

  return user ? <HomeStack /> : <AuthStack />
}

export default function App() {
  return (
    <SentroyAuthProvider client={auth}>
      <Root />
    </SentroyAuthProvider>
  )
}`}
          />
        </Sub>
        <Sub id="rn-gotchas" title="React Native gotchas">
          <Callout variant="warning">
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong>Don&rsquo;t import SentroyAuthAdmin.</strong> The admin
                package uses Node-only crypto (jose/JWKS verify); the RN
                bundler throws an &ldquo;Unable to resolve node:crypto&rdquo;
                error. Do JWT verification on your own backend.
              </li>
              <li>
                <strong>Passkey not supported.</strong>{" "}
                <InlineCode>@simplewebauthn/browser</InlineCode> requires the
                WebAuthn DOM API — not available in RN. An Expo module for
                iOS 17+ / Android 14+ native passkey APIs is planned for v2.
              </li>
              <li>
                <strong>File upload format differs.</strong> RN has no{" "}
                <InlineCode>File</InlineCode> object. Put the image picker
                result directly into multipart:{" "}
                <InlineCode>{`{ uri, name: "avatar.jpg", type: "image/jpeg" }`}</InlineCode>.
                The SDK passes <InlineCode>fetch</InlineCode> through
                transparently.
              </li>
              <li>
                <strong>RN &lt;0.71 polyfill:</strong> no{" "}
                <InlineCode>atob</InlineCode> — for JWT decoding, import{" "}
                <InlineCode>react-native-quick-base64</InlineCode> or{" "}
                <InlineCode>core-js/stable/atob</InlineCode> in your entry.
              </li>
              <li>
                <strong>RN &lt;0.74 polyfill:</strong>{" "}
                <InlineCode>TextEncoder</InlineCode> is absent in Hermes
                &lt;0.74 — not critical since there&rsquo;s no
                passkey/WebAuthn, but some utility paths call it. Add the{" "}
                <InlineCode>text-encoding</InlineCode> shim. Expo SDK 50+ uses
                Hermes 0.74+, so no polyfill is needed.
              </li>
            </ul>
          </Callout>
        </Sub>
      </Section>

      <Section
        id="framework-setup"
        title="Framework setup recipes"
        description="The provider/init pattern for every popular framework — a copy-paste starting point."
      >
        <Para>
          The SDK usage API is the same across all frameworks; the only thing
          that changes is how you wrap the provider into your app shell. The
          recipes below show the fastest path.
        </Para>
        <CodeTabsServer
          tabs={[
            {
              label: "Next.js (App Router)",
              lang: "tsx",
              code: `// app/providers.tsx — Provider client component
"use client"
import { SentroyAuthProvider } from "@sentroy-co/client-sdk/auth/react"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SentroyAuthProvider
      projectSlug="acme-app"
      apiKey={process.env.NEXT_PUBLIC_SENTROY_AUTH_API_KEY!}
      autoConsumeFragment
    >
      {children}
    </SentroyAuthProvider>
  )
}

// app/layout.tsx — Server component wraps Providers
import { Providers } from "./providers"
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

// app/account/page.tsx — useAuth in any client component
"use client"
import { useAuth } from "@sentroy-co/client-sdk/auth/react"
export default function Account() {
  const { user, loading, signOut } = useAuth()
  if (loading) return <p>Loading…</p>
  if (!user) return <a href="/login">Sign in</a>
  return <button onClick={() => signOut()}>Sign out {user.email}</button>
}`,
            },
            {
              label: "Next.js (Pages Router)",
              lang: "tsx",
              code: `// pages/_app.tsx
import type { AppProps } from "next/app"
import { SentroyAuthProvider } from "@sentroy-co/client-sdk/auth/react"

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SentroyAuthProvider
      projectSlug="acme-app"
      apiKey={process.env.NEXT_PUBLIC_SENTROY_AUTH_API_KEY!}
      autoConsumeFragment
    >
      <Component {...pageProps} />
    </SentroyAuthProvider>
  )
}`,
            },
            {
              label: "Vite + React",
              lang: "tsx",
              code: `// src/main.tsx
import React from "react"
import ReactDOM from "react-dom/client"
import { SentroyAuthProvider } from "@sentroy-co/client-sdk/auth/react"
import App from "./App"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SentroyAuthProvider
      projectSlug="acme-app"
      apiKey={import.meta.env.VITE_SENTROY_AUTH_API_KEY}
      autoConsumeFragment
    >
      <App />
    </SentroyAuthProvider>
  </React.StrictMode>,
)`,
            },
            {
              label: "Remix",
              lang: "tsx",
              code: `// app/root.tsx
import { Outlet } from "@remix-run/react"
import { SentroyAuthProvider } from "@sentroy-co/client-sdk/auth/react"

export default function App() {
  return (
    <html lang="en">
      <head><Links /><Meta /></head>
      <body>
        <SentroyAuthProvider
          projectSlug="acme-app"
          apiKey={window.ENV.SENTROY_AUTH_API_KEY}
          autoConsumeFragment
        >
          <Outlet />
        </SentroyAuthProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}`,
            },
            {
              label: "SvelteKit (consumer only)",
              lang: "ts",
              code: `// src/lib/auth.ts — SDK TS-only (we don't have Svelte hooks)
import { SentroyAuth } from "@sentroy-co/client-sdk/auth"
import { writable } from "svelte/store"

export const auth = new SentroyAuth({
  projectSlug: "acme-app",
  apiKey: import.meta.env.VITE_SENTROY_AUTH_API_KEY,
  storage: "localStorage",
})

// Reactive user store — Svelte side
export const user = writable(auth.getCurrentUserSync())
auth.onAuthStateChanged((u) => user.set(u))

// src/routes/+page.svelte
// <script>
//   import { user } from "$lib/auth"
//   import { auth } from "$lib/auth"
// </script>
// {#if $user}
//   Hi {$user.email} <button on:click={() => auth.signOut()}>Sign out</button>
// {/if}`,
            },
            {
              label: "Vanilla JS",
              lang: "html",
              code: `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Acme</title></head>
  <body>
    <div id="status">Loading…</div>
    <button id="signout" hidden>Sign out</button>

    <script type="module">
      import { SentroyAuth } from "https://esm.sh/@sentroy-co/client-sdk/auth"

      const auth = new SentroyAuth({
        projectSlug: "acme-app",
        apiKey: "aps_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        storage: "localStorage",
      })

      const status = document.getElementById("status")
      const signoutBtn = document.getElementById("signout")
      signoutBtn.addEventListener("click", () => auth.signOut())

      auth.onAuthStateChanged((user) => {
        status.textContent = user ? "Signed in as " + user.email : "Signed out"
        signoutBtn.hidden = !user
      })
    </script>
  </body>
</html>`,
            },
          ]}
        />
      </Section>

      <Section
        id="social"
        title="Social federation"
        description="6 provider — Google, GitHub, Facebook, Microsoft, X (Twitter), Apple. Per-project credentials, Sentroy-hosted callback."
      >
        <Para>
          For each provider the RP defines its own OAuth client in the
          dashboard (clientId + secret; for Apple teamId/keyId/p8 privateKey).
          The Sentroy callback URL is fixed for every provider:{" "}
          <InlineCode>https://auth.sentroy.com/api/v1/auth/&lt;slug&gt;/social/&lt;provider&gt;/callback</InlineCode>
        </Para>
        <Sub title="Provider notes">
          <ul className="my-2 ml-6 list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              <strong>Google / GitHub / Facebook</strong> — standart OAuth 2.0,
              authorization code + email scope.
            </li>
            <li>
              <strong>Microsoft</strong> — Microsoft Graph; tenant defaults to
              <InlineCode>common</InlineCode>, a tenant UUID for B2B Entra.
            </li>
            <li>
              <strong>X (Twitter)</strong> — OAuth 2.0 + PKCE (S256). The API
              tier doesn&rsquo;t return an email; Sentroy generates a{" "}
              <InlineCode>&lt;username&gt;@x.local</InlineCode> placeholder
              (the user can update the email later).
            </li>
            <li>
              <strong>Apple Sign In</strong> — ECDSA P-256 client_secret JWT
              (Sentroy signs it at runtime on every authorize), Apple&rsquo;s
              <InlineCode>response_mode=form_post</InlineCode> flow.
            </li>
          </ul>
        </Sub>
        <Sub title="Authorize flow (browser)">
          <CodeBlock
            lang="tsx"
            code={`// SDK helper: generate the redirect URL
import { useAuth } from "@sentroy-co/client-sdk/auth/react"

function SocialButtons() {
  const { socialAuthorizeUrl } = useAuth()
  const go = (provider: "google" | "github" | "apple") => {
    window.location.href = socialAuthorizeUrl(provider, {
      redirectUri: window.location.origin + "/auth/callback",
      rememberMe: true,
    })
  }
  return (
    <>
      <button onClick={() => go("google")}>Continue with Google</button>
      <button onClick={() => go("github")}>Continue with GitHub</button>
      <button onClick={() => go("apple")}>Continue with Apple</button>
    </>
  )
}

// Callback page — Sentroy returns access_token+refresh_token in the fragment
// SentroyAuthProvider auto-consumes it with autoConsumeFragment=true.
// Manual: await auth.consumeRedirectFragment()`}
          />
        </Sub>
        <Sub title="Authorize endpoint (manual)">
          <CodeBlock
            lang="bash"
            code={`# The browser is redirected to this URL with GET (no apiKey required)
GET https://auth.sentroy.com/api/v1/auth/acme-app/social/google/authorize?
  redirectUri=https://app.example.com/auth/callback&
  rememberMe=1

# Sentroy redirects to the provider → handles the callback itself →
# sends the user to redirectUri, fragment:
#   #access_token=eyJ...&refresh_token=apt_...&token_type=Bearer&expires_in=3600`}
          />
        </Sub>
      </Section>

      <Section
        id="magic-link"
        title="Magic link"
        description="Passwordless login — clicking the link delivered by email establishes a session."
      >
        <Para>
          <InlineCode>magicLinkEnabled: true</InlineCode> must be set in the
          project settings. Email enumeration protection: the request always
          returns 200 (no mail is sent if no account exists).
        </Para>
        <CodeBlock
          lang="ts"
          code={`// 1. Instead of a login form — request a magic link
await auth.sendMagicLink({
  email: "alice@example.com",
  redirectUri: "https://app.example.com/welcome",
})

// 2. Mail link: https://auth.sentroy.com/p/acme-app/magic?token=...
//    The Sentroy-hosted page consumes it, OR the RP does on its own page:

// 3. The RP's /auth/magic callback page:
const tokenFromUrl = new URLSearchParams(location.search).get("token")!
const { user } = await auth.consumeMagicLink(tokenFromUrl)
// → session established, user state updated`}
        />
      </Section>

      <Section
        id="mfa"
        title="MFA (TOTP)"
        description="RFC 6238 time-based OTP — compatible with Google Authenticator, 1Password, Authy."
      >
        <Para>
          Flow:{" "}
          <InlineCode>enrollTotp()</InlineCode> →{" "}
          <InlineCode>verifyTotpEnrollment(code)</InlineCode>{" "}
          → on the user&rsquo;s next login, <InlineCode>signIn</InlineCode>{" "}
          returns <InlineCode>kind: &quot;mfa&quot;</InlineCode> →{" "}
          <InlineCode>verifyMfa({"{"} mfaToken, code {"}"})</InlineCode>.
        </Para>
        <CodeBlock
          lang="ts"
          code={`// 1. Enrollment — the user adds the QR to their Authenticator app
const { secret, otpauthUri } = await auth.mfa.enrollTotp()
// otpauthUri = "otpauth://totp/Acme:alice@example.com?secret=...&issuer=Acme"
// Pass this to a QR code component; after the user scans it:

// 2. Enrollment confirm — with the 6-digit code
const { recoveryCodes } = await auth.mfa.verifyTotpEnrollment("123456")
// recoveryCodes: 10 one-time-use codes — SHOW them to the user and tell them to download/store them
// (in the forgot-totp flow, one of these codes is used for a recovery sign-in)

// 3. Next login flow — discriminated union
const out = await auth.signIn({ email, password })
if (out.kind === "mfa") {
  const code = prompt("6-digit code")
  await auth.verifyMfa({ mfaToken: out.data.mfaToken, code })
  // or: await auth.verifyMfa({ mfaToken, recoveryCode: "..." })
}

// Disable — re-auth with the current password
await auth.mfa.disableTotp("currentPassword")`}
        />
        <Para>
          Status check: <InlineCode>await auth.mfa.getStatus()</InlineCode> →
          <InlineCode>{`{ enrolled, factorType, verifiedAt, recoveryCodesRemaining }`}</InlineCode>.
        </Para>
      </Section>

      <Section
        id="passkey"
        title="Passkey / WebAuthn"
        description="Passwordless, phishing-resistant authentication — Touch ID, Face ID, hardware key."
      >
        <Callout variant="info">
          Passkey needs an optional peer dependency:{" "}
          <InlineCode>npm install @simplewebauthn/browser</InlineCode>
        </Callout>
        <Para>
          Two flows: <strong>register</strong> (adding a new passkey for a
          signed-in user) and <strong>authenticate</strong> (sign-in with a
          passkey).
        </Para>
        <CodeBlock
          lang="ts"
          code={`// A registered user adds a new passkey
await auth.passkey.register("MacBook Touch ID")
// → browser WebAuthn prompt; on success it's added to the passkey list

// List + delete
const keys = await auth.passkey.list()
// [{ id, credentialIdPrefix, deviceName, transports, lastUsedAt, createdAt }]
await auth.passkey.delete(keys[0].id)

// Passwordless sign-in
const { user } = await auth.passkey.authenticate({
  email: "alice@example.com", // optional — if present, that user's passkeys are allow-listed
  rememberMe: true,
})
// → session established`}
        />
        <Para>
          React: the <InlineCode>usePasskeys()</InlineCode> hook provides
          list + register + remove reactively (automatic refresh after a
          mutation).
        </Para>
      </Section>

      <Section
        id="invitation"
        title="Invitation flow"
        description="An admin invites someone else into your user pool — activation + password set via a mail link."
      >
        <Para>
          An invitation is sent from the <strong>Users</strong> page in the
          dashboard via <em>Invite user</em>. The invited user receives a
          mail:{" "}
          <InlineCode>https://auth.sentroy.com/p/&lt;slug&gt;/invitation?token=...</InlineCode>
          (Sentroy-hosted), or the RP can consume it on its own page.
        </Para>
        <CodeBlock
          lang="ts"
          code={`// The RP's /invitation/accept page — the token comes from the URL
const token = new URLSearchParams(location.search).get("token")!

const { user } = await auth.acceptInvitation({
  token,
  password: "newPasswordChosen",
  displayName: "Alice",
})
// → account created + session established, redirect home`}
        />
        <Para>
          To generate an invitation with the server-side admin SDK, the
          dashboard endpoint is used (<InlineCode>POST /api/companies/{`{slug}`}/auth-projects/{`{id}`}/invitations</InlineCode>{" "}
          — cookie auth). An invite-create endpoint in the public API layer
          with <InlineCode>aps_</InlineCode> is planned for v2.
        </Para>
      </Section>

      <Section
        id="self-service"
        title="Self-service /me endpoints"
        description="Users managing their own account — change password/email, delete account, view sessions/activity."
      >
        <Para>
          All <InlineCode>/me/*</InlineCode> endpoints are authenticated with
          the user&rsquo;s access token (user JWT). Calling them via the SDK:
        </Para>
        <CodeBlock
          lang="ts"
          code={`// Profile + membership
const me = await auth.getCurrentUser()                     // live DB read
const sessions = await auth.listSessions()                  // active sessions
await auth.revokeSession(sessionId)                         // close a specific session

// Change password — revokes all sessions + clears the local session
await auth.changePassword({ currentPassword, newPassword })

// Change email — a confirmation mail goes to the new address
await auth.requestEmailChange({ newEmail, currentPassword })
// When the user clicks the mail:
await auth.confirmEmailChange(tokenFromMailLink)
// → email update + revoke all sessions + local clear

// Delete account — two-step (confirmation mail)
await auth.requestAccountDeletion(currentPassword)
// Mail link:
await auth.confirmAccountDeletion(tokenFromMailLink)
// → account hard-delete, clear the local session

// Activity log — login/password-change/email-change/MFA/passkey/social events
const activity = await auth.getActivity()
// [{ id, action, ipAddress, createdAt, details }]`}
        />
        <Para>
          React: using the <InlineCode>useSessions()</InlineCode> and{" "}
          <InlineCode>useActivity()</InlineCode> hooks is the cleanest —
          automatic refresh after a mutation.
        </Para>
      </Section>

      <Section
        id="user-data"
        title="User data management"
        description="Sentroy keeps the auth essentials; app-specific data lives in your DB — strategy and sync pattern."
      >
        <Para>
          Sentroy stores only the fields <em>required</em> for auth: id,
          email, emailVerified, displayName, image, locale, metadata
          (~16KB cap), createdAt, lastLoginAt, lastLoginIp. Your
          subscriptions, orders, posts, user-preference JSON — these stay{" "}
          <strong>in your DB</strong> and are foreign-keyed to Sentroy via the{" "}
          <InlineCode>sub</InlineCode> claim (= user.id).
        </Para>
        <Sub id="user-data-schema" title="Sentroy vs you — who keeps what">
          <div className="my-4 overflow-hidden rounded-md border text-xs">
            <table className="w-full">
              <thead className="border-b bg-muted/40 font-medium uppercase tracking-wider text-[10px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Sentroy owns</th>
                  <th className="px-3 py-2 text-left">You own (mirror in your DB)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2 text-muted-foreground">
                    <InlineCode>id</InlineCode> — JWT <InlineCode>sub</InlineCode> claim
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <InlineCode>users.sentroy_user_id</InlineCode> (FK, indexed,
                    unique)
                  </td>
                </tr>
                <tr className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2 text-muted-foreground">
                    <InlineCode>email</InlineCode>, <InlineCode>emailVerified</InlineCode>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Subscription, billing, plan, role, permissions
                  </td>
                </tr>
                <tr className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2 text-muted-foreground">
                    <InlineCode>displayName</InlineCode>, <InlineCode>image</InlineCode>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    User-generated content (posts, comments, files)
                  </td>
                </tr>
                <tr className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2 text-muted-foreground">
                    <InlineCode>locale</InlineCode> (UI hint)
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    App preferences, notification settings, theme
                  </td>
                </tr>
                <tr className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2 text-muted-foreground">
                    <InlineCode>metadata</InlineCode> — JSON ≤16KB cap, small flags
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Profile detail, address, phone, social handles (bulk)
                  </td>
                </tr>
                <tr className="border-b last:border-b-0 align-top">
                  <td className="px-3 py-2 text-muted-foreground">
                    <InlineCode>lastLoginAt</InlineCode>, <InlineCode>lastLoginIp</InlineCode>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Activity log, audit trail (app-specific events)
                  </td>
                </tr>
                <tr className="align-top">
                  <td className="px-3 py-2 text-muted-foreground">
                    Sessions, MFA factors, passkeys, recovery codes
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    Anything &gt;16KB or relational (orders, projects, teams)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Para>
            <strong>Rule:</strong> if it isn&rsquo;t useful as a JWT claim or
            doesn&rsquo;t directly touch the authentication UX — keep it in
            your DB.
          </Para>
        </Sub>
        <Sub id="user-data-sync" title="Source-of-truth + webhook mirror">
          <Para>
            Standard pattern: in the <InlineCode>user.signup</InlineCode>{" "}
            webhook, create a row in your own <InlineCode>users</InlineCode>{" "}
            table with <InlineCode>sentroy_user_id</InlineCode> as the join
            key. In the <InlineCode>user.account-deleted</InlineCode> webhook,
            cascade delete (or soft-delete, depending on GDPR):
          </Para>
          <CodeBlock
            lang="ts"
            code={`// app/api/webhooks/sentroy-auth/route.ts
import { createHmac, timingSafeEqual } from "node:crypto"
import { db } from "@/lib/db"

export async function POST(req: Request) {
  const sig = req.headers.get("X-Sentroy-Signature") ?? ""
  const body = await req.text()
  const expected =
    "sha256=" +
    createHmac("sha256", process.env.SENTROY_WEBHOOK_SECRET!)
      .update(body)
      .digest("hex")
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return new Response("bad signature", { status: 401 })
  }

  const event = JSON.parse(body) as
    | { event: "user.signup"; data: { userId: string; email: string } }
    | { event: "user.account-deleted"; data: { userId: string } }
    | { event: "user.email-changed"; data: { userId: string; email: string } }

  switch (event.event) {
    case "user.signup":
      await db.user.create({
        data: {
          sentroyUserId: event.data.userId,
          email: event.data.email,
          createdAt: new Date(),
        },
      })
      break
    case "user.email-changed":
      await db.user.update({
        where: { sentroyUserId: event.data.userId },
        data: { email: event.data.email },
      })
      break
    case "user.account-deleted":
      // Cascade delete — orders, posts, comments, all FKs
      await db.user.delete({ where: { sentroyUserId: event.data.userId } })
      break
  }

  return new Response(null, { status: 200 })
}`}
          />
          <Para>
            <strong>First request (lazy provisioning):</strong> if the
            webhook arrives late or is missed, do an{" "}
            <InlineCode>upsert</InlineCode> on the first authenticated API
            request when the row is missing. You already have the JWT{" "}
            <InlineCode>sub</InlineCode> + email.
          </Para>
        </Sub>
        <Sub id="user-data-metadata" title="user.metadata — when to use it?">
          <Para>
            <InlineCode>metadata</InlineCode> is for small flags that go into
            the JWT or touch the auth UX during signup: onboarding state,
            plan tier (custom claim target), invitation source, marketing
            opt-in.
          </Para>
          <CodeBlock
            lang="ts"
            code={`// Good usage
await auth.signUp({
  email: "alice@example.com",
  password: "...",
  metadata: {
    onboarded: false,           // app routes to the onboarding wizard
    plan: "trial",              // custom claim → copied into the JWT
    invitedBy: "alice@x.com",   // attribution
    marketingOptIn: true,
  },
})

// BAD usage — don't send bulk data to Sentroy
await auth.updateProfile({
  metadata: {
    addressBook: [...],         // 50KB JSON — exceeds the 16KB cap
    sessionHistory: [...],       // an append-only log isn't Sentroy's job
    creditCardLast4: "4242",    // PCI scope target, keep it in your own DB
  },
})`}
          />
          <Callout variant="warning">
            <strong>Never put in metadata:</strong> passwords/secrets, full
            credit card, social security, health data, or PII that
            isn&rsquo;t required for the auth UX. Metadata is stored in the DB
            in plaintext (encrypted at-rest at the disk level, not the
            application level).
          </Callout>
        </Sub>
        <Sub id="user-data-gdpr" title="GDPR — right to erasure + portability">
          <Para>
            On the Sentroy side the user has <em>self-service</em> account
            deletion:{" "}
            <InlineCode>POST /api/v1/auth/&lt;slug&gt;/me/account/delete-request</InlineCode>
            {" "}→ confirmation mail →{" "}
            <InlineCode>delete-confirm</InlineCode> hard-delete. A webhook
            fires; your DB cleanup is handled by the sync handler above.
          </Para>
          <Para>
            <strong>Full data export (GDPR Article 20):</strong> on the
            Sentroy side <InlineCode>GET /me</InlineCode> returns JSON; on
            your side, join on <InlineCode>sentroy_user_id</InlineCode> and
            serialize all of the user&rsquo;s rows to JSON — email it or offer
            a download button via a signed URL.
          </Para>
          <CodeBlock
            lang="ts"
            code={`// app/api/me/export/route.ts
import { db } from "@/lib/db"
import { admin } from "@/lib/sentroy-admin"

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\\s+/, "")
  const claims = await admin.verifyIdToken(token!)
  const sentroyMe = await admin.users.get(claims.sub) // live profile
  const ourRows = await db.user.findUnique({
    where: { sentroyUserId: claims.sub },
    include: { orders: true, posts: true, preferences: true },
  })

  return Response.json({
    sentroy: sentroyMe,
    application: ourRows,
    exportedAt: new Date().toISOString(),
  })
}`}
          />
        </Sub>
        <Sub id="user-data-retention" title="Inactive user cleanup">
          <Para>
            Sentroy currently <strong>does not</strong> auto-prune inactive
            users. If you want auto-cleanup: CSV export from the dashboard{" "}
            <strong>Users</strong> page →{" "}
            <InlineCode>lastLoginAt &lt; 18 months ago</InlineCode> filter →
            batch{" "}
            <InlineCode>admin.users.delete(id)</InlineCode> with the
            server-to-server admin SDK. An &ldquo;auto-delete after N days
            inactive&rdquo; policy is planned for v2.
          </Para>
          <Para>
            <strong>Common soft-inactivity pattern:</strong> send a mail
            warning (&ldquo;90 days inactive — log in to keep account&rdquo;),
            wait another 30 days, then delete. Your application triggers the
            mail (Sentroy&rsquo;s activity webhook + a cron job).
          </Para>
        </Sub>
      </Section>

      <Section
        id="hosted-ui"
        title="Sentroy-hosted UI"
        description="For those who want to avoid writing forms — branded login/signup/verify/reset pages."
      >
        <Para>
          For each project, Sentroy automatically hosts these pages (with
          your branding applied):
        </Para>
        <div className="my-4 overflow-hidden rounded-md border text-xs">
          <table className="w-full">
            <thead className="border-b bg-muted/40 font-medium uppercase tracking-wider text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Path</th>
                <th className="px-3 py-2 text-left">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">/p/&lt;slug&gt;/login</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Email+password + social + magic link + MFA in one form
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">/p/&lt;slug&gt;/signup</td>
                <td className="px-3 py-2 text-muted-foreground">
                  New account form
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">/p/&lt;slug&gt;/verify-email</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Mail link landing (token consume)
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">/p/&lt;slug&gt;/reset-password</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Password reset form
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">/p/&lt;slug&gt;/magic</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Magic link consume
                </td>
              </tr>
              <tr className="border-b last:border-b-0">
                <td className="px-3 py-2 font-mono">/p/&lt;slug&gt;/invitation</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Invitation accept + password set
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-mono">/p/&lt;slug&gt;/account</td>
                <td className="px-3 py-2 text-muted-foreground">
                  Self-service account (sessions, MFA, passkey, email/password
                  change, delete account)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Para>
          The RP redirects back to its own page by adding a{" "}
          <InlineCode>?redirectUri=...</InlineCode> param. Auth tokens are
          returned in the fragment (the RP&rsquo;s SDK picks them up with{" "}
          <InlineCode>consumeRedirectFragment()</InlineCode>).
        </Para>
      </Section>

      <Section
        id="webhooks"
        title="Webhooks"
        description="Auth events (signup, login, password-changed, etc.) HTTP POSTed to your endpoint."
      >
        <Para>
          Create from the <strong>Webhooks</strong> tab in the dashboard. An
          HMAC-SHA256 secret is generated for each webhook (plaintext shown
          once). You subscribe to topics, or if left empty, all are sent.
        </Para>
        <Sub title="Topics">
          <ul className="my-2 ml-6 list-disc space-y-1 text-sm text-muted-foreground">
            <li><InlineCode>user.signup</InlineCode> — new registration</li>
            <li><InlineCode>user.login</InlineCode> — successful login (every time)</li>
            <li><InlineCode>user.password-changed</InlineCode> — self-service change or reset</li>
            <li><InlineCode>user.email-changed</InlineCode> — confirmed email change</li>
            <li><InlineCode>user.account-locked</InlineCode> — 5 failed logins → 15min lock</li>
            <li><InlineCode>user.account-deleted</InlineCode> — self-service or admin</li>
          </ul>
        </Sub>
        <Sub title="Payload format">
          <CodeBlock
            lang="json"
            code={`POST https://yourapp.com/webhooks/sentroy-auth
Content-Type: application/json
User-Agent: sentroy-auth-webhook/1.0
X-Sentroy-Event: user.signup
X-Sentroy-Signature: sha256=<hex-hmac>
X-Sentroy-Delivery-Id: dlv_<random>

{
  "event": "user.signup",
  "timestamp": "2026-05-18T12:34:56.789Z",
  "data": {
    "userId": "...",
    "email": "alice@example.com",
    "emailVerified": false,
    "provider": "email" // or "google" | "github" | ...
  }
}`}
          />
        </Sub>
        <Sub title="Signature verify (Node)">
          <CodeBlock
            lang="ts"
            code={`import { createHmac, timingSafeEqual } from "node:crypto"

export async function POST(req: Request) {
  const sig = req.headers.get("X-Sentroy-Signature") // "sha256=..."
  const body = await req.text()
  const expected = "sha256=" + createHmac("sha256", process.env.SENTROY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex")

  const a = Buffer.from(sig ?? "")
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("bad signature", { status: 401 })
  }

  const event = JSON.parse(body)
  // ... process event.data
  return new Response(null, { status: 200 })
}`}
          />
        </Sub>
        <Para>
          <strong>Retry:</strong> 3 attempts (0s / 2s / 10s backoff). 4xx
          (except 429) → deterministic fail, no retry. 5xx and network
          errors → retry. All attempts are logged to the{" "}
          <InlineCode>auth_project_webhook_deliveries</InlineCode>{" "}
          collection with a 30-day TTL; visible in the dashboard
          <em> Webhook deliveries </em> tab.
        </Para>
      </Section>

      <Section
        id="endpoints"
        title="REST endpoints"
        description="If you're not using the SDK, direct HTTP — all endpoints live under /api/v1/auth/[slug]/..."
      >
        <Para>
          <strong>Auth modes:</strong>{" "}
          <InlineCode>aps_</InlineCode> = project API key (server-only
          master),{" "}
          <InlineCode>user</InlineCode> = end-user access token,{" "}
          <InlineCode>none</InlineCode> = single-use token (already secret).
        </Para>
        <div className="my-4 overflow-hidden rounded-md border text-xs">
          <table className="w-full">
            <thead className="border-b bg-muted/40 font-medium uppercase tracking-wider text-[10px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-left">Path</th>
                <th className="px-3 py-2 text-left">Auth</th>
                <th className="px-3 py-2 text-left">Use</th>
              </tr>
            </thead>
            <tbody>
              <Row method="POST" path="/signup" auth="aps_" use="New user" />
              <Row method="POST" path="/login" auth="aps_" use="Tokens or MFA challenge" />
              <Row method="POST" path="/login/mfa/verify" auth="aps_" use="TOTP code or recovery code" />
              <Row method="POST" path="/refresh" auth="aps_" use="Token rotation (RFC 9700)" />
              <Row method="POST" path="/logout" auth="aps_" use="Refresh token revoke" />
              <Row method="POST" path="/verify-email" auth="none" use="Email verify token consume" />
              <Row method="POST" path="/password-reset/request" auth="aps_" use="Send reset mail" />
              <Row method="POST" path="/password-reset/confirm" auth="none" use="Token + new password" />
              <Row method="POST" path="/magic-link/request" auth="aps_" use="Send magic mail" />
              <Row method="POST" path="/magic-link/consume" auth="aps_" use="Magic token → login" />
              <Row method="POST" path="/invitation/accept" auth="aps_" use="Invitation token + password" />
              <Row method="GET" path="/social/{provider}/authorize" auth="none" use="OAuth redirect URL" />
              <Row method="GET/POST" path="/social/{provider}/callback" auth="none" use="Provider callback (Apple POST)" />
              <Row method="POST" path="/passkey/authenticate/begin" auth="aps_" use="WebAuthn challenge" />
              <Row method="POST" path="/passkey/authenticate/complete" auth="aps_" use="Assertion → login" />
              <Row method="GET" path="/me" auth="user" use="Profil (live DB)" />
              <Row method="GET" path="/me/sessions" auth="user" use="Active sessions" />
              <Row method="DELETE" path="/me/sessions/{id}" auth="user" use="Session revoke" />
              <Row method="POST" path="/me/password" auth="user" use="Change password" />
              <Row method="POST" path="/me/email/change-request" auth="user" use="Email change mail" />
              <Row method="POST" path="/me/email/change-confirm" auth="user" use="Email change via token" />
              <Row method="POST" path="/me/account/delete-request" auth="user" use="Delete account mail" />
              <Row method="POST" path="/me/account/delete-confirm" auth="none" use="Hard-delete via token" />
              <Row method="GET" path="/me/activity" auth="user" use="Audit log" />
              <Row method="GET" path="/me/mfa" auth="user" use="MFA status" />
              <Row method="POST" path="/me/mfa/totp/enroll" auth="user" use="TOTP secret + URI" />
              <Row method="POST" path="/me/mfa/totp/verify-enrollment" auth="user" use="Code + recovery codes" />
              <Row method="POST" path="/me/mfa/totp/disable" auth="user" use="Re-auth + TOTP off" />
              <Row method="GET" path="/me/passkey" auth="user" use="Passkey list" />
              <Row method="DELETE" path="/me/passkey/{id}" auth="user" use="Passkey delete" />
              <Row method="POST" path="/me/passkey/register/begin" auth="user" use="WebAuthn create challenge" />
              <Row method="POST" path="/me/passkey/register/complete" auth="user" use="Save attestation" />
              <Row method="GET" path="/userinfo" auth="user" use="OIDC userinfo (claims)" />
              <Row method="GET" path="/jwks.json" auth="none" use="Project public key set" />
            </tbody>
          </table>
        </div>

        <Para>
          Below are TypeScript SDK / cURL / Python examples for the 8 most
          frequently used endpoints. <InlineCode>aps_</InlineCode> = project
          master API key (server-only),{" "}
          <InlineCode>&lt;access-token&gt;</InlineCode> = end-user JWT. All
          paths live under{" "}
          <InlineCode>https://auth.sentroy.com/api/v1/auth/&lt;your-project-slug&gt;/...</InlineCode>.
        </Para>

        <Sub id="endpoint-signup" title="POST /signup — new user">
          <Endpoint method="POST" path="/api/v1/auth/{slug}/signup" />
          <Para>
            Body: <InlineCode>email</InlineCode> (required, string),{" "}
            <InlineCode>password</InlineCode> (required, ≥8 chars,
            HIBP-checked), <InlineCode>displayName</InlineCode> (optional),{" "}
            <InlineCode>locale</InlineCode> (optional, "tr"/"en"),{" "}
            <InlineCode>metadata</InlineCode> (optional, JSON ≤16KB).
            If email verification is on, the response returns no token — a
            mail link is expected.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `import { SentroyAuth } from "@sentroy-co/client-sdk/auth"

const auth = new SentroyAuth({
  projectSlug: "acme-app",
  apiKey: process.env.SENTROY_AUTH_API_KEY!,
})

const out = await auth.signUp({
  email: "alice@example.com",
  password: "hunter2-strong",
  displayName: "Alice",
  metadata: { plan: "trial" },
})
// if emailVerification is on: out.kind === "verification-required"
// if off: out.kind === "tokens" → out.data.accessToken ready`,
              },
              {
                label: "cURL",
                lang: "bash",
                code: `curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/signup \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "alice@example.com",
    "password": "hunter2-strong",
    "displayName": "Alice",
    "metadata": {"plan": "trial"}
  }'`,
              },
              {
                label: "Python",
                lang: "python",
                code: `import os
import requests

resp = requests.post(
    "https://auth.sentroy.com/api/v1/auth/acme-app/signup",
    headers={"Authorization": f"Bearer {os.environ['SENTROY_AUTH_API_KEY']}"},
    json={
        "email": "alice@example.com",
        "password": "hunter2-strong",
        "displayName": "Alice",
        "metadata": {"plan": "trial"},
    },
    timeout=10,
)
resp.raise_for_status()
data = resp.json()
# data["kind"] == "tokens" → data["data"]["accessToken"]
# data["kind"] == "verification-required" → mail sent`,
              },
            ]}
          />
        </Sub>

        <Sub id="endpoint-login" title="POST /login — tokens or MFA challenge">
          <Endpoint method="POST" path="/api/v1/auth/{slug}/login" />
          <Para>
            Body: <InlineCode>email</InlineCode>, <InlineCode>password</InlineCode>{" "}
            (required), <InlineCode>rememberMe</InlineCode> (optional bool;
            refresh TTL 30d → 90d). Response discriminated union: if MFA is
            enrolled, <InlineCode>kind: "mfa"</InlineCode> +{" "}
            <InlineCode>mfaToken</InlineCode> is returned, then{" "}
            <InlineCode>/login/mfa/verify</InlineCode> is called.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `const out = await auth.signIn({
  email: "alice@example.com",
  password: "hunter2-strong",
  rememberMe: true,
})

if (out.kind === "mfa") {
  const code = prompt("6-digit code from authenticator app")!
  await auth.verifyMfa({ mfaToken: out.data.mfaToken, code })
} else {
  // out.data.user, out.data.accessToken, out.data.refreshToken
  console.log("Signed in:", out.data.user.email)
}`,
              },
              {
                label: "cURL",
                lang: "bash",
                code: `# Step 1 — login
curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/login \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"alice@example.com","password":"hunter2-strong","rememberMe":true}'

# If MFA is returned:
# { "kind": "mfa", "data": { "mfaToken": "mft_..." } }
#
# Step 2 — MFA verify
curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/login/mfa/verify \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"mfaToken":"mft_...","code":"123456"}'`,
              },
              {
                label: "Python",
                lang: "python",
                code: `import os, requests

base = "https://auth.sentroy.com/api/v1/auth/acme-app"
headers = {"Authorization": f"Bearer {os.environ['SENTROY_AUTH_API_KEY']}"}

resp = requests.post(
    f"{base}/login",
    headers=headers,
    json={"email": "alice@example.com", "password": "hunter2-strong", "rememberMe": True},
    timeout=10,
)
out = resp.json()

if out["kind"] == "mfa":
    code = input("MFA code: ")
    resp = requests.post(
        f"{base}/login/mfa/verify",
        headers=headers,
        json={"mfaToken": out["data"]["mfaToken"], "code": code},
        timeout=10,
    )
    out = resp.json()

access_token = out["data"]["accessToken"]
refresh_token = out["data"]["refreshToken"]`,
              },
            ]}
          />
        </Sub>

        <Sub id="endpoint-refresh" title="POST /refresh — rotation">
          <Endpoint method="POST" path="/api/v1/auth/{slug}/refresh" />
          <Para>
            RFC 9700 family-based rotation. The old refresh token is used
            once; a second use triggers reuse detection and the entire family
            is revoked. A new access + refresh pair is returned.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `// The SDK refreshes automatically — no manual call needed:
const me = await auth.getCurrentUser() // on a 401 the SDK refreshes + retries internally

// Manual (for a custom backend):
const { accessToken, refreshToken } = await auth.refresh(currentRefreshToken)`,
              },
              {
                label: "cURL",
                lang: "bash",
                code: `curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/refresh \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"refreshToken":"apt_xxxxxxxx"}'
# → { "accessToken": "...", "refreshToken": "apt_new...", "expiresIn": 3600 }`,
              },
              {
                label: "Python",
                lang: "python",
                code: `import os, requests

resp = requests.post(
    "https://auth.sentroy.com/api/v1/auth/acme-app/refresh",
    headers={"Authorization": f"Bearer {os.environ['SENTROY_AUTH_API_KEY']}"},
    json={"refreshToken": refresh_token},  # the old token
    timeout=10,
)
data = resp.json()
new_access = data["accessToken"]
new_refresh = data["refreshToken"]  # discard the old one, store this`,
              },
            ]}
          />
        </Sub>

        <Sub id="endpoint-logout" title="POST /logout — refresh revoke">
          <Endpoint method="POST" path="/api/v1/auth/{slug}/logout" />
          <Para>
            Revokes the refresh token (and its family root). The access token
            stays valid until its TTL expires (1 hour) — for critical logouts
            where you also need to blacklist the access token, use{" "}
            <InlineCode>POST /me/sessions/&lt;id&gt; DELETE</InlineCode>.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `await auth.signOut()
// → POST /logout + clear local storage + onAuthStateChanged(null) fire`,
              },
              {
                label: "cURL",
                lang: "bash",
                code: `curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/logout \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"refreshToken":"apt_xxxxxxxx"}'`,
              },
              {
                label: "Python",
                lang: "python",
                code: `import os, requests

requests.post(
    "https://auth.sentroy.com/api/v1/auth/acme-app/logout",
    headers={"Authorization": f"Bearer {os.environ['SENTROY_AUTH_API_KEY']}"},
    json={"refreshToken": refresh_token},
    timeout=10,
)
# Delete access + refresh from the local store`,
              },
            ]}
          />
        </Sub>

        <Sub id="endpoint-userinfo" title="GET /userinfo — OIDC claims">
          <Endpoint method="GET" path="/api/v1/auth/{slug}/userinfo" />
          <Para>
            OIDC standard userinfo endpoint. Auth: <strong>end-user access
            token</strong> (Bearer JWT). <InlineCode>aps_</InlineCode> is not
            accepted here. The difference from{" "}
            <InlineCode>GET /me</InlineCode>:{" "}
            <InlineCode>/userinfo</InlineCode> returns OIDC claim names
            (<InlineCode>sub</InlineCode>, <InlineCode>email_verified</InlineCode>),{" "}
            <InlineCode>/me</InlineCode> returns the SDK profile shape.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `// If you use the SDK, auth.getCurrentUser() is enough (SDK shape).
// If you want the OIDC claim shape, raw fetch:
const accessToken = auth.getAccessToken()
const resp = await fetch(
  "https://auth.sentroy.com/api/v1/auth/acme-app/userinfo",
  { headers: { Authorization: \`Bearer \${accessToken}\` } }
)
const claims = await resp.json()
// { sub, email, email_verified, name, picture, locale, ... }`,
              },
              {
                label: "cURL",
                lang: "bash",
                code: `curl https://auth.sentroy.com/api/v1/auth/acme-app/userinfo \\
  -H "Authorization: Bearer <user-access-token>"`,
              },
              {
                label: "Python",
                lang: "python",
                code: `import requests

resp = requests.get(
    "https://auth.sentroy.com/api/v1/auth/acme-app/userinfo",
    headers={"Authorization": f"Bearer {user_access_token}"},
    timeout=10,
)
claims = resp.json()
# claims["sub"], claims["email"], claims["email_verified"], ...`,
              },
            ]}
          />
        </Sub>

        <Sub id="endpoint-verify-email" title="POST /verify-email — token consume">
          <Endpoint method="POST" path="/api/v1/auth/{slug}/verify-email" />
          <Para>
            Auth: <strong>none</strong> — the token is already secret
            (single-use, short-lived). Body: <InlineCode>token</InlineCode>{" "}
            (required, from the mail link). On success it returns{" "}
            <InlineCode>emailVerified: true</InlineCode> + auto-login tokens.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `// On the /verify-email landing page:
const token = new URLSearchParams(location.search).get("token")!
const { user, accessToken } = await auth.verifyEmail(token)
// → emailVerified=true + signed in`,
              },
              {
                label: "cURL",
                lang: "bash",
                code: `curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/verify-email \\
  -H "Content-Type: application/json" \\
  -d '{"token":"vrf_xxxxxxxx"}'
# 200: { user, accessToken, refreshToken }
# 400: { error: "invalid_token" } | "expired_token" | "already_used"`,
              },
              {
                label: "Python",
                lang: "python",
                code: `import requests

resp = requests.post(
    "https://auth.sentroy.com/api/v1/auth/acme-app/verify-email",
    json={"token": mail_link_token},
    timeout=10,
)
resp.raise_for_status()
data = resp.json()
# data["accessToken"], data["refreshToken"], data["user"]`,
              },
            ]}
          />
        </Sub>

        <Sub id="endpoint-password-reset" title="POST /password-reset/{request,confirm}">
          <Endpoint method="POST" path="/api/v1/auth/{slug}/password-reset/request" />
          <Endpoint method="POST" path="/api/v1/auth/{slug}/password-reset/confirm" />
          <Para>
            Two steps: <strong>request</strong> (send mail — email
            enumeration protection, always 200) → the user clicks the mail
            link → <strong>confirm</strong> (token + new password, the new
            password is HIBP-checked). On a successful confirm, all sessions
            are revoked + auto-login.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `// 1. Request reset
await auth.sendPasswordReset({
  email: "alice@example.com",
  redirectUri: "https://app.example.com/reset",
})
// → always success (silent no-op if no account)

// 2. On the /reset page, from the token URL param:
const token = new URLSearchParams(location.search).get("token")!
const { user, accessToken } = await auth.confirmPasswordReset({
  token,
  newPassword: "newSecurePass123",
})`,
              },
              {
                label: "cURL",
                lang: "bash",
                code: `# Step 1 — Request reset mail
curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/password-reset/request \\
  -H "Authorization: Bearer $SENTROY_AUTH_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"alice@example.com","redirectUri":"https://app.example.com/reset"}'

# Step 2 — New password + token
curl -X POST https://auth.sentroy.com/api/v1/auth/acme-app/password-reset/confirm \\
  -H "Content-Type: application/json" \\
  -d '{"token":"rst_xxxxxxxx","newPassword":"newSecurePass123"}'`,
              },
              {
                label: "Python",
                lang: "python",
                code: `import os, requests

base = "https://auth.sentroy.com/api/v1/auth/acme-app"

# Step 1
requests.post(
    f"{base}/password-reset/request",
    headers={"Authorization": f"Bearer {os.environ['SENTROY_AUTH_API_KEY']}"},
    json={
        "email": "alice@example.com",
        "redirectUri": "https://app.example.com/reset",
    },
    timeout=10,
)

# Step 2 (no auth — token already secret)
resp = requests.post(
    f"{base}/password-reset/confirm",
    json={"token": link_token, "newPassword": "newSecurePass123"},
    timeout=10,
)
data = resp.json()  # auto-login tokens`,
              },
            ]}
          />
        </Sub>

        <Sub id="endpoint-jwks" title="GET /jwks.json — for server-side verify">
          <Endpoint method="GET" path="/api/v1/auth/{slug}/jwks.json" />
          <Para>
            Public RSA key set (per-project). Auth: <strong>none</strong> —
            public key. When your RP backend verifies the JWT, it caches this
            endpoint (default TTL 1h, aligned with the rotation grace) and
            matches by <InlineCode>kid</InlineCode>. The SDK&rsquo;s{" "}
            <InlineCode>SentroyAuthAdmin.verifyIdToken</InlineCode>{" "}
            method handles this automatically.
          </Para>
          <CodeTabsServer
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `import { SentroyAuthAdmin } from "@sentroy-co/client-sdk/auth/admin"

const admin = new SentroyAuthAdmin({
  projectSlug: "acme-app",
  apiKey: process.env.SENTROY_AUTH_API_KEY!,
  jwksCacheTtl: 3600, // seconds — default 1h
})

// JWKS auto fetch + cache + kid match + signature verify
const claims = await admin.verifyIdToken(accessToken)
// claims.sub, claims.email, claims.iss, claims.aud, claims.exp

// Manual JWKS pull (debugging / custom verify):
const jwks = await fetch(
  "https://auth.sentroy.com/api/v1/auth/acme-app/jwks.json"
).then((r) => r.json())
// { keys: [{ kty: "RSA", kid: "...", n: "...", e: "AQAB", alg: "RS256" }, ...] }`,
              },
              {
                label: "cURL",
                lang: "bash",
                code: `curl https://auth.sentroy.com/api/v1/auth/acme-app/jwks.json
# {
#   "keys": [
#     { "kty": "RSA", "kid": "aps-key-1", "use": "sig", "alg": "RS256",
#       "n": "0vx7agoebGcQS...", "e": "AQAB" },
#     { "kty": "RSA", "kid": "aps-key-0", "use": "sig", "alg": "RS256",
#       "n": "...", "e": "AQAB" }   # old key — verify-only during the grace period
#   ]
# }`,
              },
              {
                label: "Python",
                lang: "python",
                code: `# pip install python-jose[cryptography] requests
import requests
from jose import jwt
from functools import lru_cache

JWKS_URL = "https://auth.sentroy.com/api/v1/auth/acme-app/jwks.json"

@lru_cache(maxsize=1)
def get_jwks():
    return requests.get(JWKS_URL, timeout=5).json()

def verify_access_token(token: str) -> dict:
    jwks = get_jwks()
    header = jwt.get_unverified_header(token)
    key = next(k for k in jwks["keys"] if k["kid"] == header["kid"])
    claims = jwt.decode(
        token,
        key,
        algorithms=["RS256"],
        audience="aps_a1b2c3d4e5f6",
        issuer="https://auth.sentroy.com/p/acme-app",
    )
    return claims

# Invalidate the cache after 1h (in production use Redis, etc.)`,
              },
            ]}
          />
        </Sub>
      </Section>

      <Section
        id="jwt"
        title="ID token claims"
        description="The access token is an RS256-signed JWT — with a per-project key."
      >
        <Para>
          The SDK&rsquo;s <InlineCode>verifyIdToken()</InlineCode> method
          fetches the JWKS, matches by <InlineCode>kid</InlineCode>, and
          checks the signature + <InlineCode>iss</InlineCode> +{" "}
          <InlineCode>aud</InlineCode> + <InlineCode>exp</InlineCode>. The JWKS
          cache TTL defaults to 1 hour (aligned with the rotation grace
          period); manual invalidation:{" "}
          <InlineCode>admin.invalidateJwksCache()</InlineCode>.
        </Para>
        <CodeBlock
          lang="json"
          code={`{
  "sub": "auth-project-user-id",      // user id
  "email": "alice@example.com",
  "email_verified": true,
  "name": "Alice",                    // displayName
  "picture": "https://...",           // image URL
  "iss": "https://auth.sentroy.com/p/acme-app",
  "aud": "aps_a1b2c3d4e5f6",          // project API key prefix
  "iat": 1733000000,
  "exp": 1733003600,                  // 1 hour TTL

  // If customClaims are set:
  "plan": "pro",                      // staticClaims
  "orgId": "org_xyz"                  // fromMetadata
}`}
        />
      </Section>

      <Section
        id="custom-claims"
        title="Custom JWT claims"
        description="Add fields to the access token from user metadata or static values — the RP backend uses them without an extra DB call."
      >
        <Para>
          Configure from <strong>Settings → Custom claims</strong> in the
          dashboard. Two types:
        </Para>
        <ul className="my-4 ml-6 list-disc space-y-2 text-sm">
          <li>
            <strong>From metadata</strong> — whitelist top-level keys; that
            key in user.metadata is copied into the JWT. Example:
            user.metadata.orgId = "org_xyz" + whitelist ["orgId"] → the{" "}
            <InlineCode>orgId</InlineCode> claim is set.
          </li>
          <li>
            <strong>Static claims</strong> — added to every user as a
            constant (e.g. project version tag, deployment env).{" "}
            <InlineCode>aud</InlineCode>/<InlineCode>iss</InlineCode>/
            <InlineCode>sub</InlineCode> can&rsquo;t be overridden.
          </li>
        </ul>
        <Para>
          Update metadata: edit in the user detail in the dashboard, or{" "}
          <InlineCode>PATCH /api/companies/{`{slug}`}/auth-projects/{`{id}`}/users/{`{userId}`}</InlineCode>.
        </Para>
      </Section>

      <Section
        id="mail"
        title="Email templates"
        description="Verify/reset/magic/invitation/new-device-alert/account-locked mails are sent with your project branding."
      >
        <Para>
          Mails go out from Sentroy&rsquo;s system mail platform via{" "}
          <InlineCode>noreply@auth.sentroy.com</InlineCode> (custom
          from-domain in v2). Default templates are in the tr + en locales.
          An override can be written for each template from the{" "}
          <strong>Dashboard → Emails</strong> tab (LocalizedField — TR/EN
          tabs, the same widget):
        </Para>
        <ul className="my-4 ml-6 list-disc space-y-1 text-sm">
          <li><InlineCode>verify-email</InlineCode></li>
          <li><InlineCode>password-reset</InlineCode></li>
          <li><InlineCode>magic-link</InlineCode></li>
          <li><InlineCode>invitation</InlineCode></li>
          <li><InlineCode>new-device-alert</InlineCode> — when lastLoginIp changes</li>
          <li><InlineCode>account-locked</InlineCode> — 5 failed login lockout</li>
          <li><InlineCode>email-change-confirm</InlineCode></li>
          <li><InlineCode>account-delete-confirm</InlineCode></li>
        </ul>
        <Para>
          If there&rsquo;s no override, the Sentroy default template is
          rendered (with the project branding placeholders). Placeholders:
        </Para>
        <ul className="my-4 ml-6 list-disc space-y-1 text-sm">
          <li><InlineCode>{`{projectName}`}</InlineCode> — branding.displayName</li>
          <li><InlineCode>{`{primaryColor}`}</InlineCode> — CTA button color</li>
          <li><InlineCode>{`{logoUrl}`}</InlineCode> — logo (text fallback if absent)</li>
          <li><InlineCode>{`{userEmail}`}</InlineCode> — recipient address</li>
          <li><InlineCode>{`{verifyUrl}`}</InlineCode> / <InlineCode>{`{resetUrl}`}</InlineCode> / <InlineCode>{`{magicUrl}`}</InlineCode> / <InlineCode>{`{invitationUrl}`}</InlineCode> — action URLs</li>
        </ul>
        <Callout variant="warning">
          <strong>System mail provisioning.</strong> Auth project mails are
          sent through Sentroy&rsquo;s system mail config. A Sentroy admin
          must have connected a domain on the{" "}
          <InlineCode>/admin/system-mail</InlineCode> page. If none is
          connected, signup is still treated as successful but no mail is sent
          (silently no-op).
        </Callout>
      </Section>

      <Section
        id="migration"
        title="Migration from other auth providers"
        description="CSV import to move your existing user pool from Auth0/Firebase/Cognito to Sentroy."
      >
        <Para>
          A CSV is uploaded with the <strong>Users → Import</strong> button
          in the dashboard. Format:
        </Para>
        <CodeBlock
          lang="bash"
          code={`# users.csv
email,passwordHash,passwordAlgo,emailVerified,displayName,metadata
alice@example.com,scrypt$N$r$p$salt$hash,scrypt,true,Alice,"{""plan"":""pro""}"
bob@example.com,$argon2id$v=19$...,argon2id,true,Bob,"{}"
carol@example.com,,,false,Carol,"{}"

# If no hash: the user is imported in a "password reset required" state;
# a reset mail is sent on the first login attempt.`}
        />
        <Para>
          Supported hash formats: <InlineCode>scrypt</InlineCode>{" "}
          (native), <InlineCode>argon2id</InlineCode>,{" "}
          <InlineCode>bcrypt</InlineCode> (transparent migration — re-hashed
          to scrypt on the first login). An adapter script for the differing
          hash formats of Auth0/Firebase is available in the SDK examples.
        </Para>
        <Para>
          During import the <InlineCode>user.signup</InlineCode> webhook is
          not triggered (for bulk migration). If you want it triggered, check
          the <em> Trigger webhooks </em> checkbox.
        </Para>
      </Section>

      <Section
        id="user-management"
        title="User pool management (dashboard)"
        description="auth.sentroy.com → company → Auth Projects → [project] → Users."
      >
        <Para>
          Dashboard tabs: <strong>Overview</strong> (MAU + recent signups
          chart), <strong>Users</strong> (paginated list, search,
          email-verified filter, per-user revoke/delete), <strong>Activity</strong>{" "}
          (audit log), <strong>Webhooks</strong>, <strong>Emails</strong>{" "}
          (template overrides), <strong>Settings</strong> (branding, password
          policy, allowed origins, custom claims, JWT key rotation, social
          providers, magic link toggle, email verification toggle, plan/quota),
          <strong>API keys</strong>.
        </Para>
        <Para>
          Dashboard endpoints work with cookie auth (cross-subdomain{" "}
          <InlineCode>.sentroy.com</InlineCode>). For the RP&rsquo;s
          server-to-server user management, the{" "}
          <InlineCode>aps_</InlineCode> public API is used — a full public API
          layer for the admin endpoints is planned for v2.
        </Para>
      </Section>

      <Section
        id="security"
        title="Security"
        description="v1.62.106+ — production-ready posture."
      >
        <ul className="my-4 ml-6 list-disc space-y-2 text-sm">
          <li>
            <strong>Password hash:</strong> scrypt N=2^16 (OWASP minimum,
            pure Node — no native binding required). The format is
            self-describing: <InlineCode>scrypt$N$r$p$salt$hash</InlineCode>.
            Transparent migration for Argon2id + bcrypt imports.
          </li>
          <li>
            <strong>HaveIBeenPwned check:</strong> on signup and
            password-reset confirm, the new password is queried against the
            HIBP k-anonymity API (first 5 chars of the hash). Breached
            passwords are rejected.
          </li>
          <li>
            <strong>Failed login lockout:</strong> after 5 failed attempts
            the account is locked for 15 minutes +{" "}
            <InlineCode>account-locked</InlineCode> webhook + mail. The
            lockout window is per user; not per session/IP.
          </li>
          <li>
            <strong>Email enumeration:</strong> password reset and magic link
            request always return 200 — silent no-op if no account exists.
            Signup returns an explicit 409 (DX trade-off); tightening in v2.
          </li>
          <li>
            <strong>Rate limit:</strong> per-IP signup 5/min, login 20/min,
            password-reset 3/min. On exceeding: 429 + Retry-After header.
          </li>
          <li>
            <strong>Refresh token rotation:</strong> RFC 9700 family-based.
            Reuse detection → revoke the whole family + audit log
            (<InlineCode>auth-project.refresh.reuse-detected</InlineCode>).
            Remember-me TTL: 30d default, 90d with remember-me.
          </li>
          <li>
            <strong>CORS:</strong> the project&rsquo;s{" "}
            <InlineCode>allowedOrigins</InlineCode> list is authoritative.
            Empty = browser calls are rejected (server-to-server only).
          </li>
          <li>
            <strong>JWT signing:</strong> per-project RSA 2048-bit keypair.
            The public key is published in the JWKS; the private key is
            AES-GCM encrypted in the DB, decrypted only at sign time.{" "}
            <strong>2-slot rotation</strong> is supported: the new key is
            used for issuing, the old key stays in a grace period
            (verify-only) → the JWKS publishes both.
          </li>
          <li>
            <strong>Social provider secrets:</strong> ClientSecret + Apple p8
            privateKey are AES-256-GCM encrypted in the DB; decrypted with
            <InlineCode>ENV_VAULT_MASTER_KEY</InlineCode>.
          </li>
          <li>
            <strong>Webhook secret:</strong> plaintext in the DB (needed for
            HMAC verify) — in the DB-compromise threat model everything is
            already compromised; encrypting it adds no defense in depth.
          </li>
          <li>
            <strong>Quota:</strong> free tier 5K MAU + 100 signups/hour
            (atomic counter, enforced at the signup endpoint). On exceeding:
            429. Paid tier unlimited.
          </li>
        </ul>
      </Section>

      <Section
        id="roadmap"
        title="v2 epics (not done yet)"
        description="Currently v1.62.106 — production-ready. Known gaps:"
      >
        <ul className="my-4 ml-6 list-disc space-y-1 text-sm text-muted-foreground">
          <li>Custom domain (<InlineCode>auth.customer.com</InlineCode> CNAME)</li>
          <li>Public admin API layer (users.list/get/update/delete with <InlineCode>aps_</InlineCode> — currently dashboard cookie-auth only)</li>
          <li>RBAC per-project (custom roles + permission system)</li>
          <li>Anonymous users (Firebase pattern — guest → upgrade)</li>
          <li>SMS MFA (TOTP already exists, an SMS factor is added)</li>
          <li>Browser-safe public key tier (admin key separation)</li>
          <li>Email enumeration protection (uniform signup response timing)</li>
          <li>Stripe billing integration (self-service free→paid plan upgrade)</li>
          <li>Webhook delivery retry policy customization (current: fixed 3-attempt)</li>
        </ul>
      </Section>

      <PageFooter current="/docs/auth-projects" />
    </article>
  )
}

function Row({
  method,
  path,
  auth,
  use,
}: {
  method: string
  path: string
  auth: string
  use: string
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-2 font-mono">{method}</td>
      <td className="px-3 py-2">
        <code className="text-[11px]">{path}</code>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        <code className="text-[11px]">{auth}</code>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{use}</td>
    </tr>
  )
}

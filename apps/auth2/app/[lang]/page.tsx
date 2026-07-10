import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ShieldKeyIcon,
  ArrowRight01Icon,
  CodeIcon,
} from "@hugeicons/core-free-icons"
import { makeTranslator, type Locale } from "@/lib/i18n"
import { SiteNav } from "@/components/site-nav"
import { SiteFooter } from "@/components/site-footer"
import { QuickstartTabs } from "@/components/quickstart-tabs"

/**
 * `auth.sentroy.com/[lang]` — public marketing landing for the OAuth/OIDC
 * provider product. Not an OAuth endpoint itself; just the entry point a
 * developer hits when they want to wire "Sign in with Sentroy" into their
 * app.
 */

const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.sentroy.com"
const coreUrl = process.env.NEXT_PUBLIC_CORE_APP_URL || "https://sentroy.com"

export default async function AuthLandingPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  const t = makeTranslator(lang as Locale)

  return (
    <div className="flex min-h-svh flex-col">
      <SiteNav
        lang={lang}
        labels={{
          mail: t("nav.mail"),
          storage: t("nav.storage"),
          auth: t("nav.auth"),
          vault: t("nav.vault"),
          docs: t("nav.docs"),
        }}
      />

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col gap-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={ShieldKeyIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            {t("landing.badge")}
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("landing.title")}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            {t("landing.lede")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`${coreUrl}/${lang}/d`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("landing.registerCta")}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-4"
              />
            </Link>
            <Link
              href={`${docsUrl}/auth`}
              className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
            >
              <HugeiconsIcon
                icon={CodeIcon}
                strokeWidth={2}
                className="size-4"
              />
              {t("landing.docsCta")}
            </Link>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <Card title={t("landing.card1Title")}>
            <p>{t("landing.card1Body")}</p>
            <code className="mt-2 block break-all rounded bg-muted px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
              /.well-known/openid-configuration
            </code>
          </Card>
          <Card title={t("landing.card2Title")}>
            <p>{t("landing.card2Body")}</p>
          </Card>
          <Card title={t("landing.card3Title")}>
            <p>{t("landing.card3Body")}</p>
          </Card>
          <Card title={t("landing.card4Title")}>
            <p>{t("landing.card4Body")}</p>
          </Card>
        </section>

        <QuickstartTabs
          title={t("landing.quickstartTitle")}
          tabs={[...QUICKSTART_TABS]}
        />
      </main>

      <SiteFooter
        lang={lang}
        labels={{
          tagline: t("landing.footerTagline"),
          docs: t("footer.docs"),
          status: t("footer.status"),
          sentroy: t("footer.sentroy"),
        }}
      />
    </div>
  )
}

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <div className="text-sm leading-relaxed text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px]">
        {children}
      </div>
    </div>
  )
}

// ── Quickstart code samples (4 dil) ────────────────────────────────────
const QUICKSTART_TABS = [
  {
    id: "nextauth",
    label: "NextAuth.js",
    filename: "auth.ts",
    language: "ts",
    code: `import NextAuth from "next-auth"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    {
      id: "sentroy",
      name: "Sentroy",
      type: "oidc",
      issuer: "https://auth.sentroy.com",
      clientId: process.env.SENTROY_CLIENT_ID!,
      clientSecret: process.env.SENTROY_CLIENT_SECRET!,
      authorization: { params: { scope: "openid profile email" } },
    },
  ],
})

// Sign-in button (server action):
//   "use server"
//   await signIn("sentroy", { redirectTo: "/dashboard" })`,
  },
  {
    id: "openid-client",
    label: "openid-client (vanilla)",
    filename: "sentroy-auth.ts",
    language: "ts",
    code: `// npm install openid-client
import * as oidc from "openid-client"

const config = await oidc.discovery(
  new URL("https://auth.sentroy.com"),
  process.env.SENTROY_CLIENT_ID!,
  process.env.SENTROY_CLIENT_SECRET!,
)

// 1) Authorize URL (PKCE built in)
const verifier = oidc.randomPKCECodeVerifier()
const challenge = await oidc.calculatePKCECodeChallenge(verifier)
const state = oidc.randomState()
const authUrl = oidc.buildAuthorizationUrl(config, {
  redirect_uri: "https://app.example.com/callback",
  scope: "openid profile email",
  code_challenge: challenge,
  code_challenge_method: "S256",
  state,
})
// → redirect user to authUrl, store { verifier, state } in session

// 2) Callback handler
const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
  pkceCodeVerifier: verifier,
  expectedState: state,
})
const userinfo = await oidc.fetchUserInfo(config, tokens.access_token, tokens.claims().sub)`,
  },
  {
    id: "python",
    label: "Python (Authlib)",
    filename: "sentroy_auth.py",
    language: "python",
    code: `# pip install authlib flask
from authlib.integrations.flask_client import OAuth
from flask import Flask, url_for, session, redirect

app = Flask(__name__)
app.secret_key = "..."  # session signing
oauth = OAuth(app)

oauth.register(
    name="sentroy",
    client_id=os.environ["SENTROY_CLIENT_ID"],
    client_secret=os.environ["SENTROY_CLIENT_SECRET"],
    server_metadata_url="https://auth.sentroy.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid profile email"},
)

@app.route("/login")
def login():
    return oauth.sentroy.authorize_redirect(url_for("callback", _external=True))

@app.route("/callback")
def callback():
    token = oauth.sentroy.authorize_access_token()
    session["user"] = token["userinfo"]  # sub, name, email, ...
    return redirect("/dashboard")`,
  },
  {
    id: "go",
    label: "Go (oauth2 + oidc)",
    filename: "sentroy_auth.go",
    language: "go",
    code: `// go get golang.org/x/oauth2 github.com/coreos/go-oidc/v3/oidc
package main

import (
    "context"
    "net/http"
    "os"

    "github.com/coreos/go-oidc/v3/oidc"
    "golang.org/x/oauth2"
)

func newProvider(ctx context.Context) (*oidc.Provider, oauth2.Config) {
    p, _ := oidc.NewProvider(ctx, "https://auth.sentroy.com")
    return p, oauth2.Config{
        ClientID:     os.Getenv("SENTROY_CLIENT_ID"),
        ClientSecret: os.Getenv("SENTROY_CLIENT_SECRET"),
        RedirectURL:  "https://app.example.com/callback",
        Endpoint:     p.Endpoint(),
        Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
    }
}

func login(w http.ResponseWriter, r *http.Request) {
    _, oauthCfg := newProvider(r.Context())
    state := generateState() // random + cookie
    http.Redirect(w, r, oauthCfg.AuthCodeURL(state), http.StatusFound)
}

func callback(w http.ResponseWriter, r *http.Request) {
    p, oauthCfg := newProvider(r.Context())
    token, _ := oauthCfg.Exchange(r.Context(), r.URL.Query().Get("code"))
    rawIDToken := token.Extra("id_token").(string)
    idToken, _ := p.Verifier(&oidc.Config{ClientID: oauthCfg.ClientID}).
        Verify(r.Context(), rawIDToken)
    var claims struct {
        Email string \`json:"email"\`
        Name  string \`json:"name"\`
    }
    _ = idToken.Claims(&claims)
    // claims.Email, claims.Name
}`,
  },
  {
    id: "curl",
    label: "Plain HTTP (curl)",
    filename: "flow.sh",
    language: "bash",
    code: `# 1) Send the user to authorize
open "https://auth.sentroy.com/oauth/authorize?\\
response_type=code&\\
client_id=\${SENTROY_CLIENT_ID}&\\
redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&\\
scope=openid%20profile%20email&\\
state=\${RANDOM}"

# → user grants consent, browser lands on \`?code=...&state=...\`

# 2) Exchange code for tokens
curl -X POST https://auth.sentroy.com/oauth/token \\
  -u \${SENTROY_CLIENT_ID}:\${SENTROY_CLIENT_SECRET} \\
  -d grant_type=authorization_code \\
  -d code=oac_... \\
  -d redirect_uri=https://app.example.com/callback
# → { access_token, id_token, expires_in, token_type }

# 3) Fetch the user's profile
curl -H "Authorization: Bearer \${ACCESS_TOKEN}" \\
  https://auth.sentroy.com/oauth/userinfo
# → { sub, name, email, email_verified }`,
  },
] as const

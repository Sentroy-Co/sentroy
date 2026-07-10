import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { CodeTabsServer } from "../components/code-tabs-server"
import { Callout, Lede, Para, Section, Sub } from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "Sentroy Auth (OAuth 2.0 / OIDC provider)",
  description:
    "Sign in with Sentroy — OAuth 2.0 / OpenID Connect provider for federating user identity across apps. Standards-compliant; works with NextAuth, Authlib, any OIDC client.",
}

export default function AuthDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / Sentroy Auth
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Sentroy Auth
          </h1>
          <Lede>
            Drop a &quot;Sign in with Sentroy&quot; button into your site. Standard
            OAuth 2.0 authorization-code flow + OIDC-compliant id_token —
            works with any spec-aware library, no custom integration code.
          </Lede>
        </div>
      </header>

      <Section
        id="overview"
        title="Overview"
        description={
          <>
            Sentroy Auth is an OAuth 2.0 / OpenID Connect provider hosted at{" "}
            <InlineCode>auth.sentroy.com</InlineCode>. Users authenticate
            with their existing Sentroy account; your app gets back a
            verified profile (name, email) and a stateless{" "}
            <InlineCode>id_token</InlineCode> JWT.
          </>
        }
      >
        <Sub title="Flow">
          <Para>
            <strong>1.</strong> User clicks &quot;Sign in with Sentroy&quot; on your
            site → redirected to{" "}
            <InlineCode>https://auth.sentroy.com/oauth/authorize?...</InlineCode>
            <br />
            <strong>2.</strong> If signed into Sentroy, consent screen
            appears immediately. If not, user logs in first (cross-subdomain
            cookie — single round-trip).<br />
            <strong>3.</strong> User clicks &quot;Allow&quot; → 302 back to your{" "}
            <InlineCode>redirect_uri?code=...</InlineCode>
            <br />
            <strong>4.</strong> Your backend exchanges the code at{" "}
            <InlineCode>POST /oauth/token</InlineCode> for an{" "}
            <InlineCode>access_token</InlineCode> + <InlineCode>id_token</InlineCode>.<br />
            <strong>5.</strong> Optional: call{" "}
            <InlineCode>GET /oauth/userinfo</InlineCode> with the access
            token for the user&apos;s profile.
          </Para>
        </Sub>
      </Section>

      <Section
        id="register"
        title="Register an OAuth client"
        description="Each site that signs users in needs a client_id + client_secret. One client per app, manage from your dashboard."
      >
        <Para>
          Open your Sentroy dashboard → company → <strong>OAuth clients</strong>{" "}
          → New OAuth client. You&apos;ll be asked for:
        </Para>
        <ul className="my-4 ml-6 list-disc space-y-1 text-sm text-muted-foreground">
          <li>
            <strong>Name</strong> — shown to users on the consent screen.
          </li>
          <li>
            <strong>Redirect URIs</strong> (one per line) — the URLs Sentroy
            is allowed to send the auth code back to. Add both your dev
            (<InlineCode>http://localhost:3000/...</InlineCode>) and prod
            (<InlineCode>https://app.example.com/...</InlineCode>) URLs.
          </li>
          <li>
            <strong>Homepage URL</strong> (optional) — shown on the consent
            screen as &quot;learn more&quot; link.
          </li>
        </ul>
        <Para>
          On submit you get a <strong>one-time</strong> view of{" "}
          <InlineCode>client_secret</InlineCode>. Copy it into your app&apos;s
          deploy env immediately — it cannot be shown again. If you lose it,
          rotate it from the dashboard.
        </Para>
        <Callout variant="warning">
          <strong>HTTPS only in prod.</strong> The redirect_uri allow-list
          accepts <InlineCode>http://localhost</InlineCode> for dev but
          rejects non-HTTPS in production. Browsers also refuse to set
          cookies on the auth response over plain HTTP for cross-site flows.
        </Callout>
      </Section>

      <Section
        id="quickstart"
        title="Quickstart"
        description="Most OAuth libraries auto-configure from the discovery document. Pick your stack:"
      >
        <CodeTabsServer
          tabs={[
            {
              label: "NextAuth (TS)",
              lang: "ts",
              code: `// auth.ts (NextAuth v5)
import NextAuth from "next-auth"

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
})`,
            },
            {
              label: "Authlib (Python)",
              lang: "python",
              code: `# pip install authlib flask
from authlib.integrations.flask_client import OAuth
from flask import Flask, redirect, session, url_for
import os

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET"]

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
    session["user"] = token["userinfo"]
    return redirect("/")`,
            },
            {
              label: "oauth2 (Go)",
              lang: "go",
              code: `// go get golang.org/x/oauth2
package main

import (
    "context"
    "net/http"
    "os"

    "golang.org/x/oauth2"
)

var sentroyOAuth = &oauth2.Config{
    ClientID:     os.Getenv("SENTROY_CLIENT_ID"),
    ClientSecret: os.Getenv("SENTROY_CLIENT_SECRET"),
    RedirectURL:  "https://app.example.com/auth/callback",
    Scopes:       []string{"openid", "profile", "email"},
    Endpoint: oauth2.Endpoint{
        AuthURL:  "https://auth.sentroy.com/oauth/authorize",
        TokenURL: "https://auth.sentroy.com/oauth/token",
    },
}

func login(w http.ResponseWriter, r *http.Request) {
    url := sentroyOAuth.AuthCodeURL("state-token")
    http.Redirect(w, r, url, http.StatusFound)
}

func callback(w http.ResponseWriter, r *http.Request) {
    token, err := sentroyOAuth.Exchange(r.Context(), r.URL.Query().Get("code"))
    if err != nil {
        http.Error(w, err.Error(), 500)
        return
    }
    // token.AccessToken + token.Extra("id_token") ready to use
    _ = token
    _ = context.Background
}`,
            },
            {
              label: "league/oauth2-client (PHP)",
              lang: "php",
              code: `<?php
// composer require league/oauth2-client
require __DIR__ . "/vendor/autoload.php";

use League\\OAuth2\\Client\\Provider\\GenericProvider;

$provider = new GenericProvider([
    "clientId"                => getenv("SENTROY_CLIENT_ID"),
    "clientSecret"            => getenv("SENTROY_CLIENT_SECRET"),
    "redirectUri"             => "https://app.example.com/callback.php",
    "urlAuthorize"            => "https://auth.sentroy.com/oauth/authorize",
    "urlAccessToken"          => "https://auth.sentroy.com/oauth/token",
    "urlResourceOwnerDetails" => "https://auth.sentroy.com/oauth/userinfo",
    "scopes"                  => "openid profile email",
]);

session_start();
if (!isset($_GET["code"])) {
    $url = $provider->getAuthorizationUrl();
    $_SESSION["oauth2state"] = $provider->getState();
    header("Location: " . $url);
    exit;
}

$token = $provider->getAccessToken("authorization_code", [
    "code" => $_GET["code"],
]);
$user = $provider->getResourceOwner($token);`,
            },
            {
              label: "cURL",
              lang: "bash",
              code: `# 1. Send the user to:
https://auth.sentroy.com/oauth/authorize?\\
response_type=code&\\
client_id=$SENTROY_CLIENT_ID&\\
redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&\\
scope=openid+profile+email&\\
state=$(openssl rand -hex 16)

# 2. After consent, callback URL has ?code=oac_... — exchange it:
curl -X POST https://auth.sentroy.com/oauth/token \\
  -u "$SENTROY_CLIENT_ID:$SENTROY_CLIENT_SECRET" \\
  -d grant_type=authorization_code \\
  -d code="$CODE" \\
  -d redirect_uri=https://app.example.com/callback

# 3. (Optional) Fetch user profile:
curl https://auth.sentroy.com/oauth/userinfo \\
  -H "Authorization: Bearer $ACCESS_TOKEN"`,
            },
          ]}
        />
        <Para>
          Each library auto-discovers every endpoint from{" "}
          <InlineCode>
            https://auth.sentroy.com/.well-known/openid-configuration
          </InlineCode>
          {" "}— only{" "}
          <InlineCode>issuer</InlineCode>,{" "}
          <InlineCode>clientId</InlineCode> and{" "}
          <InlineCode>clientSecret</InlineCode> need to be wired by hand.
        </Para>
      </Section>

      <Section
        id="endpoints"
        title="REST endpoints"
        description="If you're rolling your own OAuth client (or your library doesn't read discovery), here are the raw endpoints."
      >
        <Sub title="GET /oauth/authorize">
          <Para>
            Required query: <InlineCode>response_type=code</InlineCode>,{" "}
            <InlineCode>client_id</InlineCode>,{" "}
            <InlineCode>redirect_uri</InlineCode>,{" "}
            <InlineCode>scope</InlineCode> (space-separated; must include{" "}
            <InlineCode>openid</InlineCode>).<br />
            Optional: <InlineCode>state</InlineCode> (CSRF token, echoed back),{" "}
            <InlineCode>nonce</InlineCode> (embedded in id_token).
          </Para>
          <CodeBlock
            lang="bash"
            code={`https://auth.sentroy.com/oauth/authorize?
  response_type=code&
  client_id=client_abc123&
  redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fauth%2Fcallback&
  scope=openid%20profile%20email&
  state=<random>&
  nonce=<random>`}
          />
        </Sub>

        <Sub title="POST /oauth/token">
          <Para>
            Exchange the authorization code for tokens. Client authentication
            via Basic header (preferred) or form fields.
          </Para>
          <CodeBlock
            lang="bash"
            code={`curl -X POST https://auth.sentroy.com/oauth/token \\
  -u client_abc123:secret_xxx \\
  -d grant_type=authorization_code \\
  -d code=oac_xxxxxxxxxxxx \\
  -d redirect_uri=https://app.example.com/api/auth/callback`}
          />
          <CodeBlock
            lang="json"
            code={`{
  "access_token": "oat_...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "id_token": "eyJhbGciOiJIUzI1NiIs..."
}`}
          />
        </Sub>

        <Sub title="GET /oauth/userinfo">
          <Para>
            Fetch the user&apos;s profile (claims depend on granted scopes).
          </Para>
          <CodeBlock
            lang="bash"
            code={`curl -H "Authorization: Bearer oat_..." \\
  https://auth.sentroy.com/oauth/userinfo`}
          />
          <CodeBlock
            lang="json"
            code={`{
  "sub": "<user-id>",
  "name": "Aras Yilmaz",
  "preferred_username": "Aras Yilmaz",
  "email": "aras@example.com",
  "email_verified": true
}`}
          />
        </Sub>

        <Sub title="GET /.well-known/openid-configuration">
          <Para>
            Discovery document — OAuth/OIDC libraries fetch this once at
            init to learn all endpoint URLs and supported parameters.
          </Para>
        </Sub>
      </Section>

      <Section
        id="scopes"
        title="Scopes"
        description="Pick only what you need — users see them on the consent screen."
      >
        <ul className="my-4 ml-6 list-disc space-y-2 text-sm">
          <li>
            <InlineCode>openid</InlineCode> — required by the spec. Returns{" "}
            <InlineCode>sub</InlineCode> (Sentroy user id) only.
          </li>
          <li>
            <InlineCode>profile</InlineCode> — adds <InlineCode>name</InlineCode>,{" "}
            <InlineCode>preferred_username</InlineCode>,{" "}
            <InlineCode>picture</InlineCode>.
          </li>
          <li>
            <InlineCode>email</InlineCode> — adds <InlineCode>email</InlineCode> +{" "}
            <InlineCode>email_verified</InlineCode>.
          </li>
          <li>
            <InlineCode>offline_access</InlineCode> — issues a{" "}
            <InlineCode>refresh_token</InlineCode> alongside the access /
            id token, so the user stays signed in past the 1-hour TTL. Must
            be on the client&apos;s allow-list before it can be requested.
          </li>
        </ul>
        <Para>
          Each OAuth client has an allow-list of scopes (set on registration).
          Authorize requests for scopes outside the allow-list are rejected.
        </Para>
      </Section>

      <Section
        id="pkce"
        title="PKCE (RFC 7636)"
        description="Proof Key for Code Exchange — recommended for all clients, required for SPA / mobile."
      >
        <Para>
          Sentroy Auth supports PKCE with the <InlineCode>S256</InlineCode>{" "}
          method. Use it whenever you can — it adds zero friction for users
          and closes the &quot;intercepted authorization code&quot; attack
          window. Most libraries (NextAuth, oauth4webapi, Authlib, etc.)
          enable PKCE automatically when they see it in the discovery
          document.
        </Para>
        <CodeBlock
          lang="ts"
          code={`// 1. Generate a verifier + challenge before redirecting
import { createHash, randomBytes } from "crypto"
const verifier = randomBytes(32).toString("base64url")
const challenge = createHash("sha256").update(verifier).digest("base64url")
// 2. Store verifier in your session, send challenge to authorize:
//    .../oauth/authorize?...&code_challenge=<challenge>&code_challenge_method=S256
// 3. On callback, send verifier to /oauth/token:
//    grant_type=authorization_code&code=...&code_verifier=<verifier>`}
        />
        <Callout variant="warning">
          Only <InlineCode>S256</InlineCode> is supported.{" "}
          <InlineCode>plain</InlineCode> challenges are rejected — they
          provide no real security against on-wire interception.
        </Callout>
      </Section>

      <Section
        id="refresh-tokens"
        title="Refresh tokens"
        description="Keep users signed in past the 1-hour access token TTL — opt in via the offline_access scope."
      >
        <Para>
          Add <InlineCode>offline_access</InlineCode> to the requested
          scopes (and to the client&apos;s allow-list in the dashboard).
          On consent the token endpoint returns a{" "}
          <InlineCode>refresh_token</InlineCode> alongside the
          access/id tokens. When the access token expires, exchange the
          refresh token for a new pair:
        </Para>
        <CodeBlock
          lang="bash"
          code={`curl -X POST https://auth.sentroy.com/oauth/token \\
  -u client_abc123:secret_xxx \\
  -d grant_type=refresh_token \\
  -d refresh_token=ort_xxxxxxxxxxxx`}
        />
        <Callout variant="warning">
          <strong>Rotation + theft detection (RFC 9700).</strong> Every
          refresh issues a <em>new</em> refresh token and invalidates the
          old one. If a previously-used refresh token is presented again
          (replay signal — typically token theft), the entire token family
          is revoked and the user must re-authenticate. Store the latest
          refresh token securely; never use an old one.
        </Callout>
      </Section>

      <Section
        id="consent-reuse"
        title="Consent reuse"
        description="Returning users skip the consent screen for the same client + scopes."
      >
        <Para>
          The first time a user approves an OAuth client, Sentroy records
          which scopes they granted. Subsequent <InlineCode>/oauth/authorize</InlineCode>{" "}
          requests for the same (or narrower) scopes redirect straight back
          to the RP — no consent screen, single round-trip. This matches
          the behaviour of Google / GitHub / Apple sign-in.
        </Para>
        <Para>
          To force the consent screen anyway (e.g. for security-sensitive
          flows), append <InlineCode>prompt=consent</InlineCode> to the
          authorize URL. Requesting a scope outside the previously granted
          set always re-prompts.
        </Para>
      </Section>

      <Section
        id="signing-keys"
        title="Signing keys (RS256 + JWKS)"
        description="Public-key id_token signing — RPs verify locally without round-tripping to userinfo."
      >
        <Para>
          Set <InlineCode>OAUTH_RSA_PRIVATE_KEY</InlineCode> on the auth
          deploy to a PEM-encoded RSA private key. Sentroy switches{" "}
          <InlineCode>id_token</InlineCode> signing to{" "}
          <InlineCode>RS256</InlineCode>, publishes the public key at{" "}
          <InlineCode>/.well-known/jwks.json</InlineCode>, and advertises
          the JWKS URI in the discovery document. RP libraries auto-detect
          the new mode on next discovery refresh.
        </Para>
        <CodeBlock
          lang="bash"
          code={`# Generate a fresh RSA key (one-time)
node -e "console.log(require('crypto').generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}))" \\
  > oauth_rsa_private.pem
# Then set the contents as OAUTH_RSA_PRIVATE_KEY on the auth Coolify env`}
        />
        <Para>
          The <InlineCode>kid</InlineCode> is derived from the key (RFC 7638
          JWK SHA-256 thumbprint) — no extra env required. Without
          <InlineCode>OAUTH_RSA_PRIVATE_KEY</InlineCode>, Sentroy falls back
          to HS256 (<InlineCode>OAUTH_ID_TOKEN_SECRET</InlineCode>); JWKS
          stays empty and discovery omits <InlineCode>jwks_uri</InlineCode>.
        </Para>
        <Sub title="Zero-downtime rotation">
          <Para>
            Sentroy supports two simultaneous keys for graceful rotation —{" "}
            <InlineCode>OAUTH_RSA_PRIVATE_KEY</InlineCode> for signing,{" "}
            <InlineCode>OAUTH_RSA_PRIVATE_KEY_PREVIOUS</InlineCode> kept in
            JWKS for verification. RPs see both public keys, look up the
            right one by <InlineCode>kid</InlineCode> in each id_token
            header, and verify both old and new tokens during the grace
            window.
          </Para>
          <CodeBlock
            lang="bash"
            code={`# Step 1: shift the current key to the PREVIOUS slot
#   On the auth deploy's Coolify env, copy the value of
#   OAUTH_RSA_PRIVATE_KEY into OAUTH_RSA_PRIVATE_KEY_PREVIOUS.

# Step 2: generate a fresh key, set as PRIMARY
node -e "console.log(require('crypto').generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}))" \\
  > new_oauth_rsa_private.pem
#   Set OAUTH_RSA_PRIVATE_KEY to the new key's contents.

# Step 3: deploy
#   New id_tokens are signed with the new key (kid changes); existing
#   tokens stay verifiable via the previous key in JWKS.

# Step 4: wait for the access_token TTL to elapse (60 min default + margin),
#   then remove OAUTH_RSA_PRIVATE_KEY_PREVIOUS and redeploy.`}
          />
        </Sub>
      </Section>

      <Section
        id="revoke"
        title="Token revocation (RFC 7009)"
        description="POST /oauth/revoke — invalidate an access or refresh token from the RP side."
      >
        <CodeBlock
          lang="bash"
          code={`curl -X POST https://auth.sentroy.com/oauth/revoke \\
  -u client_abc123:secret_xxx \\
  -d token=oat_xxxxxxxxxxxx
# → 200 OK (always, even for unknown tokens — spec)`}
        />
        <Para>
          Optional <InlineCode>token_type_hint=access_token</InlineCode> or{" "}
          <InlineCode>token_type_hint=refresh_token</InlineCode> shortcuts
          the lookup. Sentroy returns 200 unconditionally per RFC §2.2 —
          never reveals whether the token existed.
        </Para>
      </Section>

      <Section
        id="introspect"
        title="Token introspection (RFC 7662)"
        description="POST /oauth/introspect — check whether a token is currently valid."
      >
        <CodeBlock
          lang="bash"
          code={`curl -X POST https://auth.sentroy.com/oauth/introspect \\
  -u client_abc123:secret_xxx \\
  -d token=oat_xxxxxxxxxxxx`}
        />
        <CodeBlock
          lang="json"
          code={`{
  "active": true,
  "scope": "openid profile email",
  "client_id": "client_abc123",
  "sub": "<user-id>",
  "token_type": "Bearer",
  "exp": 1733000000,
  "iat": 1732996400
}`}
        />
        <Para>
          A token introspected by a different client returns{" "}
          <InlineCode>{`{"active": false}`}</InlineCode> regardless of
          actual validity — strict client binding. Useful for stateless
          services that need a live-check without parsing the token
          themselves.
        </Para>
      </Section>

      <Section
        id="end-session"
        title="End session"
        description="GET/POST /oauth/end-session — RP-initiated logout (OIDC)."
      >
        <Para>
          Send the user here when they log out of your site. Sentroy
          revokes all access + refresh tokens issued to your client for
          that user, then redirects back to your{" "}
          <InlineCode>post_logout_redirect_uri</InlineCode> (must be on
          the client&apos;s allow-list — same security boundary as the
          authorize redirect).
        </Para>
        <CodeBlock
          lang="bash"
          code={`https://auth.sentroy.com/oauth/end-session?
  id_token_hint=eyJhbGciOiJSUzI1NiIs...&
  post_logout_redirect_uri=https%3A%2F%2Fapp.example.com%2Floggedout&
  state=<random>`}
        />
        <Callout variant="warning">
          <strong>Sentroy session itself stays signed in.</strong> The
          user remains logged into <InlineCode>sentroy.com</InlineCode> —
          only the RP&apos;s tokens are revoked. This matches the
          per-app logout model of Google / GitHub / Apple sign-in. Full
          OP logout (back-channel front-channel) will arrive in a later
          phase.
        </Callout>
      </Section>

      <Section
        id="connected-apps"
        title="Connected apps (user-side)"
        description="End users see + revoke their authorizations from their Sentroy profile."
      >
        <Para>
          Users visit{" "}
          <InlineCode>https://sentroy.com/[lang]/profile/connected-apps</InlineCode>{" "}
          to see every app they&apos;ve signed into with their Sentroy
          account, what scopes they granted, and a one-click{" "}
          <strong>Revoke</strong> button. Revoke triggers a cascade:
        </Para>
        <ul className="my-4 ml-6 list-disc space-y-1 text-sm">
          <li>Consent record deleted → next authorize re-prompts.</li>
          <li>
            All access tokens for the (user, client) pair revoked →{" "}
            <InlineCode>/oauth/userinfo</InlineCode> 401s instantly.
          </li>
          <li>
            All refresh tokens for the pair revoked → refresh attempts
            return <InlineCode>invalid_grant</InlineCode>.
          </li>
        </ul>
      </Section>

      <Section
        id="security"
        title="Security notes"
        description="What v1 enforces, what to mind when integrating."
      >
        <ul className="my-4 ml-6 list-disc space-y-2 text-sm">
          <li>
            <strong>state</strong> is your CSRF guard. Generate a random
            value before redirecting to authorize, store it in a session
            cookie, verify on the callback. Most libraries do this for you.
          </li>
          <li>
            <strong>nonce</strong> defends against id_token replay. Generate
            a random value, send in authorize, verify it matches{" "}
            <InlineCode>nonce</InlineCode> claim in the returned id_token.
          </li>
          <li>
            <strong>PKCE</strong> is recommended for every client and
            required for any client without a confidential{" "}
            <InlineCode>client_secret</InlineCode> (SPA, mobile, native).
          </li>
          <li>
            <strong>id_token</strong> is signed HS256 with a Sentroy-side
            secret. The spec recommends RS256 + JWKS — that&apos;s on the
            roadmap. Today, treat the id_token as a userinfo shortcut, not
            a self-issued JWT you can hand to other services.
          </li>
          <li>
            <strong>access_token</strong> is opaque (not a JWT). Validate
            by calling <InlineCode>/oauth/userinfo</InlineCode> — a 200
            response means the token is live + the user still exists.
          </li>
          <li>
            <strong>code lifetime</strong> is 10 minutes, single-use.
            Replays return <InlineCode>invalid_grant</InlineCode>.
          </li>
          <li>
            <strong>refresh_token lifetime</strong> is 30 days. Rotation
            on every use. Family revocation on replay.
          </li>
        </ul>
      </Section>

      <PageFooter current="/docs/auth" />
    </article>
  )
}

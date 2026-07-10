import type { Metadata } from "next"
import Link from "next/link"
import { InlineCode } from "../components/code-block"
import { CodeTabsServer } from "../components/code-tabs-server"
import { Callout, Lede, Para, Section, Sub } from "../components/docs-ui"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "Start a project — create-sentroy-app",
  description:
    "Scaffold a production-ready Next.js app pre-wired to Sentroy Auth, Storage and Email with one command — pick shadcn/ui or Material UI and the exact services you need.",
}

export default function CreateAppDocsPage() {
  return (
    <article>
      <header className="mb-12">
        <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Getting Started / create-sentroy-app
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Start a project</h1>
        <Lede>
          <InlineCode>create-sentroy-app</InlineCode> scaffolds a <strong>Next.js</strong> or <strong>React Router v7</strong>{" "}
          project already wired to Sentroy — end-user <strong>Auth</strong>, <strong>Storage</strong> and transactional{" "}
          <strong>Email</strong>. Pick <InlineCode>shadcn/ui</InlineCode> or <InlineCode>Material UI</InlineCode>, choose
          only the services you need, and start building in seconds — with every secret key kept safely server-side.
        </Lede>
      </header>

      <Section
        id="quickstart"
        title="Quick start"
        description="One command. The CLI asks a few questions, then generates a ready-to-run app."
      >
        <CodeTabsServer
          tabs={[
            { label: "npm", lang: "bash", code: `npm create sentroy-app@latest` },
            { label: "pnpm", lang: "bash", code: `pnpm create sentroy-app` },
            { label: "yarn", lang: "bash", code: `yarn create sentroy-app` },
            { label: "bun", lang: "bash", code: `bun create sentroy-app` },
          ]}
        />
        <Para>Then follow the printed next steps:</Para>
        <CodeTabsServer
          tabs={[
            {
              label: "bash",
              lang: "bash",
              code: `cd my-sentroy-app

# fill in .env.local with your Sentroy keys (see below)
npm run dev
# → http://localhost:3000`,
            },
          ]}
        />
      </Section>

      <Section
        id="options"
        title="What the CLI asks"
        description="Everything is à la carte — you only get the code for what you pick."
      >
        <Sub title="Framework">
          <Para>
            <strong>Next.js</strong> (App Router) — server route handlers + httpOnly cookies. Or{" "}
            <strong>React Router v7</strong> (framework mode) — Vite + SSR, with loaders/actions and resource routes plus
            a signed cookie session. Both keep your secret keys server-side; a pure client-only SPA isn&apos;t offered
            because it can&apos;t hold the master keys safely.
          </Para>
        </Sub>
        <Sub title="UI library">
          <Para>
            <strong>shadcn/ui</strong> — Tailwind CSS v4 with self-contained, copy-paste primitives (Button, Input,
            Card…). Or <strong>Material UI</strong> — <InlineCode>@mui/material</InlineCode> v6 with Emotion (SSR-ready on
            both frameworks). Both ship the exact same pages and logic; only the presentation differs.
          </Para>
        </Sub>
        <Sub title="Services">
          <Para>
            Select any subset of <strong>Auth</strong>, <strong>Storage</strong> and <strong>Email</strong>. Unselected
            services are pruned entirely — no routes, no pages, no dependencies. A generated{" "}
            <InlineCode>lib/features.ts</InlineCode> records your choice and drives the nav.
          </Para>
        </Sub>
        <Sub title="Auth provider">
          <Para>
            When you pick <strong>Auth</strong>, choose how it&apos;s managed: <strong>Sentroy Auth Project</strong>{" "}
            (hosted user pool, no database — the <InlineCode>aps_</InlineCode> proxy + httpOnly cookie flow), or{" "}
            <strong>better-auth</strong> (self-hosted users in SQLite) with <strong>Sign in with Sentroy</strong> (OAuth/
            OIDC federation). The better-auth option needs one extra step after install:{" "}
            <InlineCode>npx @better-auth/cli@latest migrate</InlineCode> to create its tables.
          </Para>
        </Sub>
        <Sub title="Package manager & git">
          <Para>
            Choose npm / pnpm / yarn / bun (auto-detected from how you invoked the command) and whether to{" "}
            <InlineCode>git init</InlineCode>. Dependencies install automatically unless you skip.
          </Para>
        </Sub>
      </Section>

      <Section
        id="security"
        title="Security model"
        description="Secrets never reach the browser. This is the single most important thing the starter gets right for you."
      >
        <Para>
          <strong>Auth.</strong> Your Auth Project <InlineCode>aps_</InlineCode> key is the master key to your entire
          user pool. The starter uses it <strong>only</strong> server-side — Next.js route handlers (
          <InlineCode>app/api/auth/*</InlineCode>) or React Router resource routes/actions — which proxy to{" "}
          <InlineCode>auth.sentroy.com</InlineCode> and set an <strong>httpOnly cookie</strong> session. Access tokens
          (RS256 JWTs) are verified against the project JWKS with <InlineCode>jose</InlineCode>. The browser only ever
          talks to your own app routes.
        </Para>
        <Para>
          <strong>Storage &amp; Email.</strong> Your company <InlineCode>stk_</InlineCode> access token is used only in{" "}
          <InlineCode>app/api/storage/*</InlineCode> and <InlineCode>app/api/email/send</InlineCode> — file uploads and
          sends are proxied through the server.
        </Para>
        <Callout variant="warning" title="Never expose secret keys">
          Keep <InlineCode>aps_</InlineCode> and <InlineCode>stk_</InlineCode> in server-only env vars. Never move them
          into <InlineCode>NEXT_PUBLIC_*</InlineCode> or import them in a client component.
        </Callout>
      </Section>

      <Section
        id="structure"
        title="What gets generated"
        description="A clean App Router project — only the selected services included."
      >
        <CodeTabsServer
          tabs={[
            {
              label: "All services",
              lang: "bash",
              code: `my-sentroy-app/
├─ app/
│  ├─ api/
│  │  ├─ auth/{login,signup,logout,session,password-reset}/route.ts
│  │  ├─ storage/{upload,list}/route.ts
│  │  └─ email/send/route.ts
│  ├─ login/  signup/  forgot-password/  dashboard/    # auth pages
│  ├─ storage/page.tsx                                  # upload + list
│  ├─ email/page.tsx                                    # send form
│  ├─ layout.tsx  page.tsx  providers.tsx
├─ lib/
│  ├─ auth-server.ts   session.ts        # aps_ proxy + cookie + JWKS
│  ├─ sentroy-server.ts                  # stk_ company client (SDK)
│  └─ features.ts                        # which services are enabled
├─ middleware.ts                         # protects /dashboard
├─ components/                           # UI (shadcn or MUI)
└─ .env.local`,
            },
          ]}
        />
      </Section>

      <Section
        id="env"
        title="Environment variables"
        description="The CLI writes a commented .env.local containing exactly the keys for the services you chose."
      >
        <Sub title="Auth">
          <CodeTabsServer
            tabs={[
              {
                label: ".env.local",
                lang: "bash",
                code: `# aps_ is the master key to your user pool — SERVER-ONLY.
SENTROY_AUTH_BASE_URL=https://auth.sentroy.com
SENTROY_AUTH_PROJECT_SLUG=your-project-slug
SENTROY_AUTH_API_KEY=aps_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Public — only used to verify JWTs against the project JWKS.
NEXT_PUBLIC_SENTROY_AUTH_PROJECT_SLUG=your-project-slug`,
              },
            ]}
          />
          <Para>
            Create an Auth Project and copy its slug + <InlineCode>aps_</InlineCode> key — see{" "}
            <Link href="/docs/auth-projects" className="text-foreground underline underline-offset-4">
              Auth Projects
            </Link>
            .
          </Para>
        </Sub>
        <Sub title="Storage & Email">
          <CodeTabsServer
            tabs={[
              {
                label: ".env.local",
                lang: "bash",
                code: `# stk_ is company-scoped admin — SERVER-ONLY.
SENTROY_BASE_URL=https://sentroy.com
SENTROY_COMPANY_SLUG=your-company-slug
SENTROY_ACCESS_TOKEN=stk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Storage
SENTROY_STORAGE_BUCKET=uploads

# Email (verify a sending domain first)
SENTROY_EMAIL_FROM=hello@yourdomain.com
SENTROY_EMAIL_DOMAIN_ID=your-domain-id`,
              },
            ]}
          />
          <Para>
            Generate a company access token and (for email) verify a domain — see{" "}
            <Link href="/docs/storage" className="text-foreground underline underline-offset-4">
              Storage
            </Link>{" "}
            and{" "}
            <Link href="/docs/mail" className="text-foreground underline underline-offset-4">
              Mail
            </Link>
            .
          </Para>
        </Sub>
      </Section>

      <Section
        id="shadcn"
        title="Add shadcn components & presets"
        description="The shadcn variant is a standard shadcn project — extend it with the registry, blocks and theme presets."
      >
        <Para>
          The generated app ships a <InlineCode>components.json</InlineCode> (for both Next.js and React Router), so the
          shadcn CLI works against it directly:
        </Para>
        <CodeTabsServer
          tabs={[
            {
              label: "Add components",
              lang: "bash",
              code: `# any component or block from the shadcn registry
npx shadcn@latest add button card dialog
npx shadcn@latest add dashboard-01`,
            },
            {
              label: "Apply a preset / theme",
              lang: "bash",
              code: `# apply a theme/preset to your existing project
npx shadcn@latest apply <preset>`,
            },
          ]}
        />
        <Callout title="create-sentroy-app vs. shadcn init">
          <InlineCode>shadcn init --template next|react-router --preset &lt;id&gt;</InlineCode> is shadcn&apos;s own project
          creator — it scaffolds UI but has <strong>no</strong> Sentroy Auth/Storage/Email wiring. Use{" "}
          <InlineCode>create-sentroy-app</InlineCode> for the full secure starter, then layer shadcn components, blocks
          and presets on top.
        </Callout>
        <Para>
          The shadcn variant uses CSS-variable theming (<InlineCode>cssVariables: true</InlineCode>) with the standard
          token set (<InlineCode>--background</InlineCode>, <InlineCode>--primary</InlineCode>,{" "}
          <InlineCode>--muted</InlineCode>, <InlineCode>--ring</InlineCode>…) in <InlineCode>globals.css</InlineCode>, so
          theme presets recolor the whole app out of the box. The Material UI variant is themed via{" "}
          <InlineCode>app/theme.ts</InlineCode> instead.
        </Para>
      </Section>

      <Section
        id="next"
        title="Where to go next"
        description="The generated app is a starting point — extend it with the full Sentroy feature set."
      >
        <Para>
          <strong>Auth</strong> — add MFA, magic links, social federation and hosted UI:{" "}
          <Link href="/docs/auth-projects" className="text-foreground underline underline-offset-4">
            Auth Projects
          </Link>
          .<br />
          <strong>Storage</strong> — buckets, thumbnails and the React{" "}
          <Link href="/docs/react" className="text-foreground underline underline-offset-4">
            MediaManager
          </Link>
          .<br />
          <strong>Email</strong> — templates, audiences, webhooks and logs:{" "}
          <Link href="/docs/mail" className="text-foreground underline underline-offset-4">
            Mail
          </Link>
          .
        </Para>
      </Section>

      <PageFooter current="/docs/create-app" />
    </article>
  )
}

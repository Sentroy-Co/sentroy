# Sentroy

**Sentroy is a source-available business platform** — transactional email,
object storage + CDN, authentication (OAuth/OIDC + Auth-as-a-Service), status
pages, a music studio, a WhatsApp inbox, and an OS-style desktop with an App
Store — all in one monorepo you can run yourself.

> **Fair Source, not open source.** Sentroy is licensed under the
> [Functional Source License (FSL-1.1-ALv2)](./LICENSE): use, modify, and
> self-host freely; the code converts to Apache-2.0 two years after each
> release. The `apps/whatsapp-gateway/` directory is GPL-3.0-or-later and
> `packages/app-manifest/` is MIT (see [NOTICE](./NOTICE)). The Sentroy name and
> logos are **not** covered by the code license — see [TRADEMARK.md](./TRADEMARK.md).

## Two ways to run it

- **Self-host it** — one command, your domain, your data. See
  [SELF-HOSTING.md](./SELF-HOSTING.md).
  ```bash
  cp apps/core/.env.example .env
  docker compose -f docker-compose.selfhost.yaml --profile core up --build
  ```
- **Use hosted plans at sentroy.com** — skip installation and server ops; we run
  it for you.

Both are the same code. Self-hosted instances can even sync the same curated App
Store catalog from Sentroy (opt-in, cryptographically signed).

## Architecture

A Turbo + Bun monorepo of Next.js apps plus shared packages:

**Apps** — `core` (platform, dashboard, docs, App Store), `mail`, `storage`,
`auth2` (OAuth/OIDC + Auth Projects), `status`, `studio`, `whatsapp`
(+`whatsapp-gateway`), `linear`, `downloader` (+worker), `backup` (+worker),
`cdn`.

**Packages** — `@workspace/ui` (shadcn primitives), `@workspace/db` (MongoDB
models), `@workspace/auth` (better-auth + permissions), `@workspace/console`
(dashboard shell + server helpers), `@workspace/cdn-client`,
`@workspace/ai-assistant`, `@workspace/app-manifest` (App Store manifests, MIT).

Cross-subdomain single sign-on, a single `ROOT_DOMAIN` portability knob, and a
signed App Store registry make the whole platform run cleanly on any domain.

## Develop

```bash
bun install
bun run dev          # all apps in parallel
bun run typecheck
bun run build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) to contribute,
[SECURITY.md](./SECURITY.md) to report a vulnerability, and
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

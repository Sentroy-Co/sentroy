# Self-hosting Sentroy

Sentroy is **Fair Source** software (see [LICENSE](./LICENSE), FSL-1.1-ALv2). You
can run the whole platform on your own domain and infrastructure. If you'd
rather skip installation and server costs, **hosted plans are available at
sentroy.com**.

> `version.sh` and the per-service `docker-compose.<app>.yaml` files are
> **Sentroy-operator tooling** (Coolify + GHCR). The canonical self-host install
> is **`docker-compose.selfhost.yaml`**.

## Quickstart

```bash
cp apps/core/.env.example .env          # then fill the REQUIRED values
docker compose -f docker-compose.selfhost.yaml --profile core up --build
```

Open `http://localhost` (or your domain) → the **/setup wizard** seeds your first
admin (you provide the admin email — there is no default).

At minimum set in `.env`:

| Key | Why |
|---|---|
| `MONGODB_URI` (+ `MONGODB_DATABASE`) | Database. Use an explicit `…/sentroy` path AND set `MONGODB_DATABASE=sentroy` so seed + import agree. |
| `SENTROY_ROOT_DOMAIN` + `NEXT_PUBLIC_ROOT_DOMAIN` | Your domain (the single portability knob). |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `SENTROY_ENV_MASTER_KEY` | `openssl rand -base64 32` — encrypts secrets at rest. **Back it up; loss = unrecoverable ciphertext.** |
| `INTERNAL_API_SECRET` | server-to-server calls |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first admin |
| `REQUIRE_EMAIL_VERIFICATION=false` | run signup/login **without** a mail stack |

## Compose profiles

Run only what you need (small VMs → `core` only):

| Profile | Brings up | Needs |
|---|---|---|
| `core` | mongo + core + Caddy | MongoDB, master key |
| `storage` | + storage + cdn | S3-compatible object store |
| `mail` | + mail-server stack (Postfix/Dovecot/Rspamd/PG/Redis/API) | mail infra |
| `full` | all apps (auth, status, studio, whatsapp, linear, downloader, backup) | per-app envs |

```bash
docker compose -f docker-compose.selfhost.yaml --profile storage up --build
docker compose -f docker-compose.selfhost.yaml --profile full up --build
```

## Per-app environment

Each app ships a template — copy the keys you need into your `.env`:

- `apps/core/.env.example` — the reference (auth, portability, registry, SMTP…)
- `apps/mail/.env.example` · `apps/storage/.env.example` · `apps/auth2/.env.example`
- `apps/status/.env.example` · `apps/studio/.env.example` · `apps/whatsapp/.env.example`
- `apps/whatsapp-gateway/.env.example` · `apps/backup/.env.example` · `apps/downloader/.env.example`

## Dependency matrix

**Required (always):**
- MongoDB
- `SENTROY_ENV_MASTER_KEY` (`openssl rand -base64 32`)

**Product-conditional:**
- S3-compatible object storage → storage / cdn product (`S3_ENDPOINT/REGION/ACCESS_KEY/SECRET_KEY/BUCKET`; legacy `IDRIVE_*` still read as a fallback)
- The mail-server stack → mail product only (the `mail` profile)

**Graceful / optional (skipped when unset):**
- Cloudflare Turnstile (CAPTCHA) — `TURNSTILE_DISABLED=1` to disable
- Polar billing — disabled by default
- AI gateway (`AI_GATEWAY_API_KEY`) — assistant features off when unset
- `IPINFO_TOKEN`, social login (`GOOGLE_/GITHUB_CLIENT_*`)

## TLS

`docker-compose.selfhost.yaml` fronts the apps with **Caddy**, templated on
`SENTROY_ROOT_DOMAIN`. On a real public domain Caddy auto-provisions Let's
Encrypt certs per subdomain. For a **wildcard** cert you need a DNS-01 provider
token (HTTP-01 cannot issue wildcards); for LAN/dev, Caddy's internal CA is used.

## App Store registry (optional)

Set `APP_REGISTRY_ENABLED=1` to pull Sentroy's **Ed25519-signed** global app
catalog and merge it into your instance (the WordPress.org model). Your own
local/company apps are never touched. Verification is against a public key baked
into the code (override with `APP_REGISTRY_PUBLIC_KEY` for forks). Sentroy
curates the global catalog centrally; a self-hosted instance is a **consumer**
(leave `APP_REGISTRY_PRIVATE_KEY` unset — that is the registry-host signing key).

## Mail-free operation

With `REQUIRE_EMAIL_VERIFICATION=false`, signup opens a session immediately (no
verification mail needed). Password-reset and other transactional mail still
need a sender — either the mail product, or the optional plain-SMTP fallback
(`SMTP_HOST=…`, which pulls in the `nodemailer` dependency). Passwordless
(magic-link / email-OTP) flows are **not** a mail-free escape hatch.

## Notes

- MongoDB is under the SSPL; you provide/operate your own MongoDB. Redis/Valkey
  is pinned for the mail stack only.
- The full 12-app stack is heavy — start with `core` and add profiles as needed.

# Sentroy Mail Server — Coolify Deploy Guide

## Prerequisites

1. **VPS with port 25 open** — Check with your provider (Hetzner, Contabo, etc.). Many block port 25 by default.
2. **Coolify installed** on the VPS
3. **Domain** pointed to the server IP (A record for `mail.yourdomain.com`)
4. **PTR/rDNS** set on the VPS IP → `mail.yourdomain.com` (set via VPS provider panel)

## Step 1 — Create Application

1. Coolify dashboard → **New Application → Docker Compose**
2. Connect Git repository: `Sentroy-Co/sentroy-server`, branch: `main`
3. Compose file path: `docker-compose.yml`

## Step 2 — Environment Variables

Go to **Environment** tab and add all variables. Required values:

```env
# PostgreSQL
POSTGRES_USER=sentroy
POSTGRES_PASSWORD=<generate-strong-password>
DATABASE_URL=postgresql://sentroy:<password>@postgres:5432/maildb

# Redis
REDIS_URL=redis://redis:6379

# API
API_PORT=3000
NODE_ENV=production
LOG_LEVEL=info
JWT_SECRET=<generate-64-char-hex>
API_ALLOWED_ORIGINS=https://app.yourdomain.com
API_BASE_URL=https://mail-api.yourdomain.com/api/v1

# SMTP (Postfix internal)
SMTP_HOST=postfix
SMTP_PORT=587
SMTP_USER=api@mail.yourdomain.com
SMTP_PASS=<generate-strong-password>

# IMAP (Dovecot internal)
IMAP_HOST=dovecot
IMAP_PORT=143
IMAP_USER=inbox@mail.yourdomain.com
IMAP_PASS=<generate-strong-password>

# DKIM
DKIM_KEYS_PATH=/etc/rspamd/dkim

# Queue
QUEUE_CONCURRENCY=5

# Domain verification polling (ms)
DOMAIN_VERIFY_INTERVAL=300000

# IMAP connection pool
IMAP_POOL_SIZE=5

# Dovecot users file
DOVECOT_USERS_FILE=/etc/dovecot/users
```

**Generate secrets:**
```bash
# JWT_SECRET
openssl rand -hex 32

# Passwords
openssl rand -base64 24
```

## Step 3 — Volumes

Mark these as persistent in Coolify:

| Volume | Path | Critical |
|--------|------|----------|
| `pg_data` | PostgreSQL data | Yes — all domain/template/log data |
| `redis_data` | Redis AOF | Moderate — queue state |
| `mail_data` | Maildir + Postfix queue | Yes — all stored emails |
| `dkim_keys` | DKIM private keys | **Critical** — if lost, all domains need new DKIM records |

## Step 4 — Ports

Expose these ports through Coolify/firewall:

| Port | Protocol | Service | Notes |
|------|----------|---------|-------|
| 25 | TCP | Postfix SMTP | Inbound mail — **must be open** |
| 587 | TCP | Postfix Submission | Authenticated sending (STARTTLS) |
| 465 | TCP | Postfix SMTPS | Authenticated sending (implicit TLS) |
| 143 | TCP | Dovecot IMAP | Inbox access (STARTTLS) |
| 993 | TCP | Dovecot IMAPS | Inbox access (implicit TLS) |
| 3000 | TCP | API | Behind Traefik reverse proxy |

**API port** (3000) should be exposed through Coolify's Traefik reverse proxy with automatic Let's Encrypt TLS.

## Step 5 — Postfix Hostname

Before deploying, update `postfix/main.cf`:

```
myhostname = mail.yourdomain.com
mydomain = yourdomain.com
```

This **must match** the PTR record of your server IP.

## Step 6 — TLS Certificates

For production, replace the snakeoil certificates in Postfix and Dovecot:

**Option A (recommended):** Mount Let's Encrypt certs from Coolify/Traefik:
```yaml
# In docker-compose.yml, add to postfix and dovecot volumes:
- /etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem:/etc/ssl/certs/ssl-cert-snakeoil.pem:ro
- /etc/letsencrypt/live/mail.yourdomain.com/privkey.pem:/etc/ssl/private/ssl-cert-snakeoil.key:ro
```

**Option B:** Use Coolify's built-in certificate management and configure cert paths in `main.cf` and `dovecot.conf`.

## Step 7 — Deploy

1. Click **Deploy** in Coolify
2. Watch build logs — API container runs `prisma migrate deploy` on startup
3. Container startup order is enforced via `depends_on` + healthchecks

## Step 8 — Post-Deploy Verification

```bash
# API health
curl https://mail-api.yourdomain.com/api/v1/health

# SMTP connectivity
telnet mail.yourdomain.com 587

# Check container logs
docker compose logs api --tail=50
docker compose logs postfix --tail=50
```

## Step 9 — Create First API Key

Connect to the API container and create an admin key:

```bash
# Via Coolify terminal or SSH
docker compose exec api node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
(async () => {
  const prisma = new PrismaClient();
  const key = 'sk_' + crypto.randomBytes(36).toString('base64url');
  const hash = await bcrypt.hash(key, 12);
  await prisma.apiKey.create({
    data: { name: 'Admin', keyHash: hash, scopes: ['admin'] }
  });
  console.log('API Key:', key);
  await prisma.\$disconnect();
})();
"
```

Save this key — it won't be shown again.

## DNS Records

After adding a domain via the API, configure these DNS records:

| Type | Name | Value |
|------|------|-------|
| A | `mail.yourdomain.com` | `SERVER_IP` |
| MX | `yourdomain.com` | `mail.yourdomain.com` (priority 10) |
| TXT | `yourdomain.com` | `v=spf1 ip4:SERVER_IP ~all` |
| TXT | `mail._domainkey.yourdomain.com` | `v=DKIM1; k=rsa; p=PUBLIC_KEY` |
| TXT | `_dmarc.yourdomain.com` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |
| PTR | `SERVER_IP` | `mail.yourdomain.com` (set via VPS provider) |

The API returns these records ready to copy when you `POST /domains` or `GET /domains/:id/dns-records`.

## Updates

- `git push` to main → Coolify auto-rebuilds
- Database migrations run automatically on API container startup (`prisma migrate deploy`)
- **Never delete** the `dkim_keys` volume

## Backup

Priority backup targets:
1. `pg_data` — `pg_dump` via cron
2. `dkim_keys` — copy to secure offsite storage
3. `mail_data` — if inbox persistence matters

```bash
# PostgreSQL backup
docker compose exec postgres pg_dump -U sentroy maildb > backup_$(date +%Y%m%d).sql

# DKIM keys backup
docker compose cp rspamd:/etc/rspamd/dkim ./dkim_backup_$(date +%Y%m%d)
```

## IP Warmup

New IP addresses have no reputation. Follow this schedule:

| Week | Daily limit |
|------|-------------|
| 1 | 200 |
| 2 | 1,000 |
| 3 | 5,000 |
| 4+ | Gradual increase, keep bounce rate < 2% |

Register with:
- [Google Postmaster Tools](https://postmaster.google.com)
- [Microsoft SNDS](https://sendersupport.olc.protection.outlook.com)
- [MXToolbox Blacklist Monitor](https://mxtoolbox.com/blacklists.aspx)

## Troubleshooting

| Problem | Check |
|---------|-------|
| Emails going to spam | DKIM/SPF/DMARC alignment, PTR record, mail-tester.com score |
| Port 25 blocked | VPS provider policy, firewall rules |
| Bounce rate high | Suppression list, email validation before send |
| API 503 | `docker compose logs api`, check postgres/redis connectivity |
| DKIM verification fails | Compare `GET /domains/:id/dns-records` output with actual DNS |
| Queue stuck | `GET /health/queue`, check Redis connectivity |

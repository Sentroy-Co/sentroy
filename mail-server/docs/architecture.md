# Sentroy Mail Server — Architecture

## System Overview

```
Internet  -->  DNS (SPF / DKIM / DMARC / PTR)
                    |
              Postfix (port 25/587/465)
                    |
              Rspamd (DKIM signing + spam filter)
                    |
              Fastify API (REST endpoints)
                    |
         +-------------------------+
         |  PostgreSQL  |  Redis   |
         |  BullMQ Queue           |
         +-------------------------+
                    |
              Dovecot (IMAP 143/993)
```

## Container Map

| Container | Image | Ports | Role |
|-----------|-------|-------|------|
| `postgres` | postgres:16-alpine | 5432 (dev only) | Persistent data store |
| `redis` | redis:7-alpine | 6379 (dev only) | Queue backend, Rspamd state, API key cache |
| `rspamd` | custom build | 11332, 11334 | DKIM signing, spam filtering, milter |
| `postfix` | custom build | 25, 587, 465 | MTA — inbound/outbound SMTP |
| `dovecot` | custom build | 143, 993 | IMAP — inbox access |
| `api` | node:20-alpine | 3000 | Fastify REST API, queue worker, domain verifier |

**Startup order:** postgres → redis → rspamd → postfix → dovecot → api

**Internal network:** `mailnet` (Docker bridge)

## Data Flow

### Sending an Email
1. Client → `POST /api/v1/send/single` (Bearer auth)
2. API validates domain (active?), checks suppression list
3. If template: MJML → HTML compile, variable injection
4. Injects tracking pixel + rewrites links (if domain.trackOpens/trackClicks)
5. Adds List-Unsubscribe headers (RFC 8058)
6. Creates `MailLog` record (status: queued)
7. Adds BullMQ job (delayed if `scheduledAt`)
8. Worker picks up job → `nodemailer` → Postfix SMTP (127.0.0.1:587)
9. Postfix → Rspamd milter (DKIM sign) → outbound delivery
10. Worker updates MailLog (sent/bounced/failed), dispatches webhooks
11. If bounce → auto-add to suppression list

### Receiving an Email
1. External MTA → Postfix port 25
2. Postfix → Rspamd (spam check) → LMTP → Dovecot
3. Dovecot stores in Maildir (`/var/mail/vhosts/{domain}/{user}/`)
4. Client → `GET /api/v1/inbox` → API → ImapFlow → Dovecot IMAP

### Tracking
1. Email opened → client loads `GET /api/v1/t/open/{token}` (1x1 pixel)
2. Link clicked → `GET /api/v1/t/click/{token}?url=...` → 302 redirect
3. Unsubscribe → `POST /api/v1/t/unsubscribe/{token}` → suppression list
4. All events → `TrackingEvent` table + webhook dispatch

## Directory Structure

```
sentroy-server/
├── docker-compose.yml           # Production compose
├── docker-compose.dev.yml       # Dev overrides (hot reload, extra ports)
├── .env.example                 # All env vars template
│
├── postfix/
│   ├── Dockerfile
│   ├── main.cf                  # Virtual domains, TLS (DANE), Rspamd milter
│   ├── master.cf                # SMTP/submission/SMTPS services
│   └── virtual/                 # Domain & mailbox maps (API-managed)
│
├── dovecot/
│   ├── Dockerfile
│   └── dovecot.conf             # Maildir, LMTP, SASL, TLS
│
├── rspamd/
│   ├── Dockerfile
│   ├── local.d/                 # DKIM signing, Redis, workers, Bayes
│   └── override.d/              # Extended spam headers
│
├── api/
│   ├── Dockerfile               # Multi-stage (dev/build/production)
│   ├── prisma/schema.prisma     # 7 models
│   └── src/
│       ├── index.ts             # App entry, plugin/route registration
│       ├── plugins/             # auth, error-handler, domain-scope
│       ├── routes/              # 13 route modules
│       ├── services/            # 12 service modules
│       └── types/               # Fastify type augmentation
│
├── sdk/                         # @sentroy-co/client (also in separate repo)
└── docs/                        # This documentation
```

## Database Models

| Model | Table | Purpose |
|-------|-------|---------|
| Domain | `domains` | Registered domains + DKIM keys + DNS verification state |
| Template | `templates` | MJML templates + compiled HTML cache |
| MailLog | `mail_logs` | Every sent/queued/bounced email with tracking timestamps |
| ApiKey | `api_keys` | Bearer tokens with scoped permissions |
| Webhook | `webhooks` | Customer webhook endpoints + HMAC secrets |
| Suppression | `suppressions` | Blocked emails (bounce/unsubscribe/manual) |
| TrackingEvent | `tracking_events` | Open/click/unsubscribe events |

## Auth & Scopes

All routes under `/api/v1` except `/health`, `/metrics`, and `/t/*` require `Authorization: Bearer <api_key>`.

| Scope | Routes |
|-------|--------|
| `admin` | domains, api-keys, mailboxes, webhooks, suppressions |
| `send` | templates, send, validate |
| `read` | inbox |
| any authenticated | logs, statistics |

`admin` scope has implicit access to all scopes. API keys with a `domainId` are restricted to that domain's data only.

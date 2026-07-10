# Sentroy Mail Server — API Reference

Base URL: `/api/v1`
Auth: `Authorization: Bearer <api_key>`
Response format: `{ data, meta?, error?, details? }`

---

## Health & Monitoring (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health (postgres, redis, postfix, dovecot, rspamd) |
| GET | `/health/queue` | BullMQ queue stats (waiting, active, completed, failed, delayed) |
| GET | `/metrics` | Prometheus scrape endpoint |

## Tracking (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/t/open/:token` | Open tracking pixel (returns 1x1 GIF) |
| GET | `/t/click/:token?url=` | Click tracking redirect (302) |
| GET | `/t/unsubscribe/:token` | Unsubscribe page (HTML form) |
| POST | `/t/unsubscribe/:token` | Process unsubscribe (RFC 8058 one-click) |

---

## Domains (admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/domains` | Add domain, generate DKIM keypair, return DNS records |
| GET | `/domains` | List domains `?page=&limit=` |
| GET | `/domains/:id` | Domain detail |
| POST | `/domains/:id/verify` | Check DNS records, update verification state |
| DELETE | `/domains/:id` | Delete domain + cleanup DKIM keys |
| GET | `/domains/:id/dns-records` | Get required DNS records (SPF, DKIM, DMARC, MX, A) |

**Domain state machine:** `pending → verifying → active → failed`

## API Keys (admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api-keys` | Create key (plain text shown once) |
| GET | `/api-keys` | List keys (no hashes) |
| DELETE | `/api-keys/:id` | Revoke key |

**Body (POST):**
```json
{
  "name": "Production",
  "scopes": ["send", "read"],
  "domainId": "uuid | null",
  "expiresAt": "ISO8601 | null"
}
```

## Mailboxes (admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mailboxes` | Create Dovecot user + Maildir |
| GET | `/mailboxes` | List users `?domainId=` |
| PUT | `/mailboxes/:email/password` | Change password |
| DELETE | `/mailboxes/:email` | Delete user |
| DELETE | `/mailboxes/domain/:domainId` | Delete all users for domain |

## Webhooks (admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks` | Create webhook (secret shown once) |
| GET | `/webhooks` | List `?domainId=` |
| GET | `/webhooks/:id` | Detail |
| PUT | `/webhooks/:id` | Update url/events/active |
| DELETE | `/webhooks/:id` | Delete |

**Events:** `sent`, `bounced`, `failed`, `opened`, `clicked`, `unsubscribed`

**Payload:**
```json
{
  "event": "bounced",
  "timestamp": "2025-01-15T09:00:00.000Z",
  "data": {
    "mailLogId": "...",
    "to": "user@example.com",
    "from": "hello@yourdomain.com",
    "subject": "...",
    "domainId": "...",
    "messageId": "<...>"
  }
}
```
Signature: `X-Sentroy-Signature` header = HMAC-SHA256(body, secret)

## Suppressions (admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/suppressions` | List `?page=&limit=&domainId=&reason=` |
| POST | `/suppressions` | Manually add email |
| DELETE | `/suppressions/:id` | Remove (re-enable sending) |
| GET | `/suppressions/check` | Check `?email=&domainId=` → `{suppressed, reason}` |

**Reasons:** `bounce`, `unsubscribe`, `complaint`, `manual`

---

## Templates (send)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/templates` | Create MJML template (auto-compiles to HTML) |
| GET | `/templates` | List `?page=&limit=&domainId=` |
| GET | `/templates/:id` | Detail with HTML preview |
| PUT | `/templates/:id` | Update (re-compiles if mjmlBody changed) |
| DELETE | `/templates/:id` | Delete |
| POST | `/templates/:id/preview` | Render with variables → `{html, subject}` |

## Send (send)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/send/single` | Send one email |
| POST | `/send/batch` | Send to multiple (max 500) |
| GET | `/send/:jobId/status` | Queue job status |
| DELETE | `/send/:jobId` | Cancel scheduled/waiting job |

**Body (single):**
```json
{
  "to": "user@gmail.com",
  "from": "hello@example.com",
  "subject": "Hello",
  "domainId": "uuid",
  "templateId": "uuid (optional)",
  "html": "raw HTML (optional)",
  "text": "plain text (optional)",
  "variables": {"name": "John"},
  "replyTo": "reply@example.com (optional)",
  "scheduledAt": "ISO8601 (optional)",
  "headers": {"X-Custom": "value"},
  "attachments": [
    {"filename": "doc.pdf", "content": "base64...", "contentType": "application/pdf"}
  ]
}
```

**Suppression enforcement:** If `to` is in suppression list → HTTP 422.

## Email Validation (send)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/validate/email` | Single email check (syntax + MX + disposable + typo) |
| POST | `/validate/batch` | Batch validate (max 100) |

**Response:**
```json
{
  "valid": false,
  "email": "user@gmial.com",
  "checks": {"syntax": true, "mxExists": false, "disposable": false},
  "suggestion": "user@gmail.com"
}
```

---

## Inbox (read)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/inbox` | List messages `?page=&limit=&unread=true&mailbox=` |
| GET | `/inbox/mailboxes` | List folders (INBOX, Sent, Trash...) with counts |
| GET | `/inbox/search` | IMAP search `?q=&from=&subject=&since=&before=` |
| GET | `/inbox/:uid` | Full message (text/HTML body, headers, attachments) |
| POST | `/inbox/:uid/read` | Mark as read |
| POST | `/inbox/:uid/unread` | Mark as unread |
| POST | `/inbox/:uid/move` | Move to folder `{from, to}` |
| DELETE | `/inbox/:uid` | Delete message |
| GET | `/inbox/:uid/attachments` | List attachments |
| GET | `/inbox/:uid/attachments/:partId/download` | Download attachment (binary) |

---

## Logs (any authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/logs` | Mail logs `?page=&limit=&status=&domainId=&from=&to=` |
| GET | `/logs/:id` | Single log detail |

## Statistics (any authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/statistics/overview` | Totals + rates `?domainId=&from=&to=` |
| GET | `/statistics/daily` | Daily breakdown `?domainId=&days=30` |
| GET | `/statistics/domains` | Per-domain summary |

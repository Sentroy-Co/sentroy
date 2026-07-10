/**
 * Hand-curated Sentroy endpoint catalog. Each entry is enough metadata
 * to build a working cURL: HTTP method, path template, default body,
 * and a short description for the dropdown.
 *
 * Path templates use `{param}` syntax. The generator surfaces every
 * `{...}` token as an inline input so the user can fill specifics
 * (domain id, list id, etc.) without losing the rest of the URL.
 */

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

export type EndpointDef = {
  id: string
  group: "Mail" | "Storage"
  label: string
  method: HttpMethod
  /** Path relative to `/api/companies/{slug}` for mail / `/api/storage/companies/{slug}` for storage. */
  path: string
  /** Mail vs storage vs whatsapp routing — generator picks the right base. */
  service: "mail" | "storage" | "whatsapp"
  /** Pretty-printed JSON body (or null for body-less calls). */
  body?: string
  description?: string
}

export const ENDPOINT_CATALOG: EndpointDef[] = [
  // ── Mail / Send ───────────────────────────────────────────────────
  {
    id: "send-email",
    group: "Mail",
    label: "Send email",
    method: "POST",
    service: "mail",
    path: "/send",
    description: "Transactional or bulk send",
    body: `{
  "to": "user@example.com",
  "from": "info@example.com",
  "domainId": "{domainId}",
  "subject": "Hello from Sentroy",
  "html": "<h1>It works.</h1>"
}`,
  },

  // ── Mail / Domains ────────────────────────────────────────────────
  { id: "domains-list", group: "Mail", label: "List domains", method: "GET", service: "mail", path: "/domains" },
  { id: "domains-get", group: "Mail", label: "Get domain", method: "GET", service: "mail", path: "/domains/{id}" },

  // ── Mail / Mailboxes ──────────────────────────────────────────────
  { id: "mailboxes-list", group: "Mail", label: "List mailboxes", method: "GET", service: "mail", path: "/mailboxes" },

  // ── Mail / Templates ──────────────────────────────────────────────
  { id: "templates-list", group: "Mail", label: "List templates", method: "GET", service: "mail", path: "/templates" },
  { id: "templates-get", group: "Mail", label: "Get template", method: "GET", service: "mail", path: "/templates/{id}" },

  // ── Mail / Inbox ──────────────────────────────────────────────────
  { id: "inbox-list", group: "Mail", label: "List inbox messages", method: "GET", service: "mail", path: "/inbox?mailbox=info@example.com&folder=INBOX&page=1&limit=20" },
  { id: "inbox-get", group: "Mail", label: "Get inbox message", method: "GET", service: "mail", path: "/inbox/{uid}?mailbox=info@example.com" },
  { id: "inbox-folders", group: "Mail", label: "List IMAP folders", method: "GET", service: "mail", path: "/inbox/folders?mailbox=info@example.com" },
  { id: "inbox-mark-read", group: "Mail", label: "Mark message as read", method: "PATCH", service: "mail", path: "/inbox/{uid}/read", body: `{ "mailbox": "info@example.com" }` },

  // ── Mail / Audience ───────────────────────────────────────────────
  { id: "audience-contacts-list", group: "Mail", label: "List contacts", method: "GET", service: "mail", path: "/audience/contacts?page=1&limit=50" },
  {
    id: "audience-contacts-create",
    group: "Mail",
    label: "Create contact",
    method: "POST",
    service: "mail",
    path: "/audience/contacts",
    body: `{
  "email": "user@example.com",
  "name": "Jane Doe",
  "tags": ["beta-tester"],
  "metadata": { "signupSource": "landing" }
}`,
  },
  { id: "audience-contacts-update", group: "Mail", label: "Update contact", method: "PATCH", service: "mail", path: "/audience/contacts/{id}", body: `{ "tags": ["customer"] }` },
  { id: "audience-contacts-delete", group: "Mail", label: "Delete contact", method: "DELETE", service: "mail", path: "/audience/contacts/{id}" },
  { id: "audience-lists-list", group: "Mail", label: "List audience lists", method: "GET", service: "mail", path: "/audience/lists" },
  { id: "audience-lists-create", group: "Mail", label: "Create audience list", method: "POST", service: "mail", path: "/audience/lists", body: `{ "name": "Newsletter", "description": "Homepage signups" }` },
  {
    id: "audience-lists-add-member",
    group: "Mail",
    label: "Add list member",
    method: "POST",
    service: "mail",
    path: "/audience/lists/{listId}/members",
    body: `{ "contactId": "{contactId}" }`,
  },
  {
    id: "audience-lists-remove-member",
    group: "Mail",
    label: "Remove list member",
    method: "DELETE",
    service: "mail",
    path: "/audience/lists/{listId}/members",
    body: `{ "contactId": "{contactId}" }`,
  },

  // ── Mail / Suppressions ───────────────────────────────────────────
  { id: "suppressions-list", group: "Mail", label: "List suppressions", method: "GET", service: "mail", path: "/suppressions" },
  {
    id: "suppressions-add",
    group: "Mail",
    label: "Add suppression",
    method: "POST",
    service: "mail",
    path: "/suppressions",
    body: `{
  "email": "leaving@example.com",
  "domainId": "{domainId}",
  "reason": "manual"
}`,
  },
  { id: "suppressions-remove", group: "Mail", label: "Remove suppression", method: "DELETE", service: "mail", path: "/suppressions/{id}" },

  // ── Mail / Webhooks ───────────────────────────────────────────────
  { id: "webhooks-list", group: "Mail", label: "List webhooks", method: "GET", service: "mail", path: "/webhooks" },
  {
    id: "webhooks-create",
    group: "Mail",
    label: "Create webhook",
    method: "POST",
    service: "mail",
    path: "/webhooks",
    body: `{
  "url": "https://example.com/webhooks/sentroy",
  "events": ["sent", "bounced", "opened", "clicked", "unsubscribed"],
  "domainId": "{domainId}"
}`,
  },
  { id: "webhooks-update", group: "Mail", label: "Update webhook", method: "PATCH", service: "mail", path: "/webhooks/{id}", body: `{ "active": false }` },
  { id: "webhooks-delete", group: "Mail", label: "Delete webhook", method: "DELETE", service: "mail", path: "/webhooks/{id}" },
  {
    id: "webhooks-test",
    group: "Mail",
    label: "Test fire webhook",
    method: "POST",
    service: "mail",
    path: "/webhooks/{id}/test",
    description: "Dispatch a custom payload, record the result",
    body: `{
  "event": "sent",
  "payload": {
    "mailLogId": "ml_abc",
    "to": "user@example.com",
    "subject": "Welcome"
  }
}`,
  },
  { id: "webhooks-deliveries-list", group: "Mail", label: "List webhook deliveries", method: "GET", service: "mail", path: "/webhooks/{id}/deliveries?page=1&limit=50" },
  { id: "webhooks-deliveries-get", group: "Mail", label: "Get webhook delivery", method: "GET", service: "mail", path: "/webhooks/{id}/deliveries/{deliveryId}" },
  { id: "webhooks-deliveries-replay", group: "Mail", label: "Replay webhook delivery", method: "POST", service: "mail", path: "/webhooks/{id}/deliveries/{deliveryId}/replay" },

  // ── Mail / Logs ───────────────────────────────────────────────────
  { id: "logs-list", group: "Mail", label: "List mail logs", method: "GET", service: "mail", path: "/logs?page=1&limit=50" },
  { id: "logs-get", group: "Mail", label: "Get mail log", method: "GET", service: "mail", path: "/logs/{id}" },

  // ── Storage / Buckets ─────────────────────────────────────────────
  { id: "buckets-list", group: "Storage", label: "List buckets", method: "GET", service: "storage", path: "/buckets" },
  { id: "buckets-get", group: "Storage", label: "Get bucket", method: "GET", service: "storage", path: "/buckets/{slug}" },
  {
    id: "buckets-create",
    group: "Storage",
    label: "Create bucket",
    method: "POST",
    service: "storage",
    path: "/buckets",
    body: `{
  "name": "User Uploads",
  "description": "Avatars and profile media",
  "isPublic": false
}`,
  },
  { id: "buckets-update", group: "Storage", label: "Update bucket", method: "PATCH", service: "storage", path: "/buckets/{slug}", body: `{ "isPublic": true }` },
  { id: "buckets-delete", group: "Storage", label: "Delete bucket", method: "DELETE", service: "storage", path: "/buckets/{slug}?force=true" },

  // ── Storage / Media ───────────────────────────────────────────────
  { id: "media-list", group: "Storage", label: "List media in bucket", method: "GET", service: "storage", path: "/buckets/{slug}/media?type=image&limit=50" },
  { id: "media-get", group: "Storage", label: "Get media record", method: "GET", service: "storage", path: "/buckets/{slug}/media/{id}" },
  { id: "media-delete", group: "Storage", label: "Delete media", method: "DELETE", service: "storage", path: "/buckets/{slug}/media/{id}" },
]

const BASE_HOST = "https://sentroy.com"

export function buildUrl(
  endpoint: EndpointDef,
  companySlug: string,
): string {
  const slug = encodeURIComponent(companySlug || "my-company")
  const prefix =
    endpoint.service === "mail"
      ? `/api/mail/companies/${slug}`
      : endpoint.service === "whatsapp"
        ? `/api/whatsapp/companies/${slug}`
        : `/api/storage/companies/${slug}`
  return `${BASE_HOST}${prefix}${endpoint.path}`
}

/**
 * Build a multi-line cURL command. We use a few formatting conventions:
 *   - one flag per line for readability
 *   - body inlined as $'…' single-quote string when possible (JSON
 *     contains double quotes; bash wraps with single quotes verbatim)
 *   - `--data` only when method has a body and the user provided one
 */
export function buildCurl(opts: {
  method: HttpMethod
  url: string
  token: string
  body: string | null
}): string {
  const lines: string[] = [`curl -X ${opts.method} "${opts.url}"`]
  lines.push(`  -H "Authorization: Bearer ${opts.token}"`)
  const hasBody =
    opts.body !== null && opts.body.trim().length > 0 && opts.method !== "GET"
  if (hasBody) {
    lines.push(`  -H "Content-Type: application/json"`)
    // Single-quote the JSON so embedded double quotes stay literal.
    lines.push(`  -d '${opts.body!.trim()}'`)
  }
  return lines.join(" \\\n")
}

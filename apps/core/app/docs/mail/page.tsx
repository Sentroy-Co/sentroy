import type { Metadata } from "next"
import { CodeBlock, InlineCode } from "../components/code-block"
import { Callout, Lede, Para, PropsTable, Section, Sub } from "../components/docs-ui"
import { EndpointExample } from "../components/endpoint-example"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "Mail — transactional email API",
  description:
    "Sentroy Mail is a transactional email API and an open alternative to Resend, Postmark, Mailgun, and SendGrid. Multilingual templates, DKIM/SPF/DMARC automation, IMAP-backed inbox, suppressions, webhooks.",
}

export default function MailDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / Mail
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">Mail</h1>
          <Lede>
            Manage verified domains, IMAP mailboxes, MJML templates, and send transactional or bulk email — all
            through the same client.
          </Lede>
        </div>
      </header>

      <Section
        id="domains"
        title="Domains"
        description="Verified sending domains for your company. Domain creation and DNS verification happen in the dashboard; the API surfaces a read-only view for use at send time."
      >
        <Sub id="domains-list" title="List domains">
          <EndpointExample
            method="GET"
            service="mail"
            path="/domains"
            ts={`const domains = await sentroy.domains.list()
// → Domain[]`}
            go={`domains, err := client.Domains.List()`}
            python={`domains = sentroy.domains.list()`}
            php={`$domains = $sentroy->domains->getAll();`}
          />
        </Sub>

        <Sub id="domains-get" title="Get domain">
          <EndpointExample
            method="GET"
            service="mail"
            path="/domains/{id}"
            ts={`const domain = await sentroy.domains.get("domain-id")`}
            go={`domain, err := client.Domains.Get("domain-id")`}
            python={`domain = sentroy.domains.get("domain-id")`}
            php={`$domain = $sentroy->domains->get('domain-id');`}
          />
        </Sub>
      </Section>

      <Section
        id="mailboxes"
        title="Mailboxes"
        description="IMAP mailbox accounts created against your verified domains. Used by the Inbox API to read messages and by Send to authenticate the from-address."
      >
        <Sub id="mailboxes-list" title="List mailboxes">
          <EndpointExample
            method="GET"
            service="mail"
            path="/mailboxes"
            ts={`const mailboxes = await sentroy.mailboxes.list()`}
            go={`mailboxes, err := client.Mailboxes.List()`}
            python={`mailboxes = sentroy.mailboxes.list()`}
            php={`$mailboxes = $sentroy->mailboxes->getAll();`}
          />
        </Sub>
      </Section>

      <Section
        id="templates"
        title="Templates"
        description="Reusable MJML email templates with multilingual fields and variable placeholders."
      >
        <Sub id="templates-list" title="List templates">
          <EndpointExample
            method="GET"
            service="mail"
            path="/templates"
            ts={`const templates = await sentroy.templates.list()`}
            go={`templates, err := client.Templates.List()`}
            python={`templates = sentroy.templates.list()`}
            php={`$templates = $sentroy->templates->getAll();`}
          />
        </Sub>

        <Sub id="templates-get" title="Get template">
          <EndpointExample
            method="GET"
            service="mail"
            path="/templates/{id}"
            ts={`const template = await sentroy.templates.get("template-id")`}
            go={`template, err := client.Templates.Get("template-id")`}
            python={`template = sentroy.templates.get("template-id")`}
            php={`$template = $sentroy->templates->get('template-id');`}
          />
        </Sub>

        <Sub title="LocalizedString shape">
          <Para>
            Templates support multiple languages. A field can be a plain string (single-language) or an object
            keyed by language code:
          </Para>
          <CodeBlock
            lang="jsonc"
            code={`{
  "id": "b3f1a2c4-...",
  "name": { "en": "Welcome Email", "tr": "Hosgeldin E-postasi" },
  "subject": { "en": "Welcome, {{name}}!", "tr": "Hosgeldin, {{name}}!" },
  "mjmlBody": { "en": "<mjml>...</mjml>", "tr": "<mjml>...</mjml>" },
  "variables": ["name", "company"],
  "domainId": "a1b2c3d4-...",
  "domainName": "example.com",
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-04-10T14:22:00.000Z"
}`}
          />
          <Para>
            Use the <InlineCode>variables</InlineCode> array to know which placeholders the template expects.
          </Para>
        </Sub>

        <Sub id="templates-create" title="Create template">
          <Para>
            Requires the <InlineCode>templates.manage</InlineCode> permission.{" "}
            <InlineCode>name</InlineCode>, <InlineCode>subject</InlineCode> and{" "}
            <InlineCode>mjmlBody</InlineCode> accept a plain string or a{" "}
            <InlineCode>{"{ tr, en }"}</InlineCode> map; <InlineCode>domainId</InlineCode> ties the template
            to a verified sending domain. You do <em>not</em> send a{" "}
            <InlineCode>variables</InlineCode> array — the platform extracts it from the body and returns it
            on the created template.
          </Para>
          <EndpointExample
            method="POST"
            service="mail"
            path="/templates"
            ts={`const template = await sentroy.templates.create({
  name: { en: "Welcome", tr: "Hos geldin" },
  subject: { en: "Welcome, {firstName}!", tr: "Hos geldin, {firstName}!" },
  mjmlBody: { en: "<mjml>...</mjml>", tr: "<mjml>...</mjml>" },
  domainId: "a1b2c3d4-...",
})

// template.variables -> ["firstName"]  (extracted from the body)`}
            body={`{
  "name": { "en": "Welcome", "tr": "Hos geldin" },
  "subject": "Welcome, {firstName}!",
  "mjmlBody": "<mjml><mj-body><mj-section><mj-column><mj-text>Hi {firstName}</mj-text></mj-column></mj-section></mj-body></mjml>",
  "domainId": "a1b2c3d4-..."
}`}
          />
          <Callout variant="info" title="Other-language SDKs">
            The Go, Python and PHP SDKs expose templates read-only today. Create / update / delete are
            available via the TypeScript SDK, the <InlineCode>sentroy</InlineCode> CLI, or the REST endpoint
            directly (the cURL tab above works from any language).
          </Callout>
        </Sub>

        <Sub id="templates-update" title="Update template">
          <Para>
            Partial update — send only the fields you want to change. At least one of{" "}
            <InlineCode>name</InlineCode>, <InlineCode>subject</InlineCode> or{" "}
            <InlineCode>mjmlBody</InlineCode> is required. Editing the body re-extracts the{" "}
            <InlineCode>variables</InlineCode> list.
          </Para>
          <EndpointExample
            method="PATCH"
            service="mail"
            path="/templates/{id}"
            ts={`const template = await sentroy.templates.update("template-id", {
  subject: { en: "Welcome aboard, {firstName}!" },
})`}
            body={`{
  "subject": { "en": "Welcome aboard, {firstName}!" }
}`}
          />
        </Sub>

        <Sub id="templates-delete" title="Delete template">
          <EndpointExample
            method="DELETE"
            service="mail"
            path="/templates/{id}"
            ts={`await sentroy.templates.delete("template-id")`}
          />
        </Sub>

        <Sub id="templates-cli" title="Create from the CLI">
          <Para>
            The <InlineCode>sentroy</InlineCode> CLI creates templates from a file or piped stdin — handy in a
            CI job or build step. Localized fields accept a JSON object string. See the{" "}
            <a href="/docs/cli#mail">CLI reference</a> for every flag.
          </Para>
          <CodeBlock
            lang="bash"
            code={`# body from a file
sentroy mail templates create \\
  --name=Welcome \\
  --subject="Welcome, {firstName}!" \\
  --domain=dom_123 \\
  --mjml-file=welcome.mjml

# body piped on stdin, localized name + subject as JSON
cat welcome.mjml | sentroy mail templates create \\
  --name='{"en":"Welcome","tr":"Hos geldin"}' \\
  --subject='{"en":"Hi {firstName}","tr":"Merhaba {firstName}"}' \\
  --domain=dom_123

sentroy mail templates update tpl_123 --subject="New subject"
sentroy mail templates delete tpl_123`}
          />
        </Sub>

        <Sub id="template-variables" title="Template variables">
          <Para>
            Variables are placeholders you write directly into the subject and MJML body. Sentroy parses them
            automatically — there is no separate &ldquo;declare variables&rdquo; step — and returns the
            discovered names on the template&rsquo;s <InlineCode>variables</InlineCode> field. At send time you
            supply the values in the <InlineCode>variables</InlineCode> object.
          </Para>
          <Para>Three forms are supported (Mustache-like syntax):</Para>
          <PropsTable
            rows={[
              {
                name: "{name} / {{name}}",
                type: "scalar",
                required: false,
                description: (
                  <>
                    A single value, replaced with the matching key from the send-time{" "}
                    <InlineCode>variables</InlineCode> object. Single and double braces both work.
                  </>
                ),
              },
              {
                name: "{#items} … {/items}",
                type: "array section",
                required: false,
                description: (
                  <>
                    Repeats the enclosed block once per array element. Inside the block each item&rsquo;s
                    fields are in scope (e.g. <InlineCode>{"{title}"}</InlineCode>,{" "}
                    <InlineCode>{"{price}"}</InlineCode>).
                  </>
                ),
              },
              {
                name: "{^name} … {/^name}",
                type: "inverted section",
                required: false,
                description: (
                  <>
                    Renders the block only when <InlineCode>name</InlineCode> is missing, empty or false — the
                    opposite of a truthy guard.
                  </>
                ),
              },
            ]}
          />
          <Para>
            Variable names may contain letters, digits and underscores (<InlineCode>{"\\w+"}</InlineCode>) — no
            dashes or dots — and are case-sensitive. There is no default-value syntax; an unmatched placeholder
            is left in the output verbatim so you can spot it. Nested sections are not supported.
          </Para>
          <CodeBlock
            lang="html"
            code={`<mjml>
  <mj-body>
    <mj-section><mj-column>
      <mj-text>Hi {firstName},</mj-text>

      {^hasItems}
        <mj-text>Your cart is empty.</mj-text>
      {/^hasItems}

      {#items}
        <mj-text>{title} — {price}</mj-text>
      {/items}
    </mj-column></mj-section>
  </mj-body>
</mjml>`}
          />
          <Para>
            Send it by passing scalars and arrays in <InlineCode>variables</InlineCode>:
          </Para>
          <CodeBlock
            lang="ts"
            code={`await sentroy.send.email({
  to: "ada@example.com",
  from: "hello@example.com",
  domainId: "a1b2c3d4-...",
  templateId: "template-id",
  variables: {
    firstName: "Ada",
    hasItems: true,
    items: [
      { title: "Keyboard", price: "$80" },
      { title: "Mouse", price: "$25" },
    ],
  },
})`}
          />
          <Callout variant="warning" title="Missing variables are rejected">
            If a template references a variable the send call doesn&rsquo;t provide a value for, the request is
            rejected with HTTP 422 listing the missing names — so a typo never ships a half-rendered email.
          </Callout>
        </Sub>
      </Section>

      <Section
        id="inbox"
        title="Inbox"
        description="Read messages, list IMAP folders, group threads, and manage message state."
      >
        <Sub id="inbox-list" title="List messages">
          <EndpointExample
            method="GET"
            service="mail"
            path="/inbox?mailbox=info@example.com&folder=INBOX&page=1&limit=20"
            ts={`const messages = await sentroy.inbox.list({
  mailbox: "info@example.com",
  folder: "INBOX",
  page: 1,
  limit: 20,
})`}
            go={`messages, err := client.Inbox.List(&sentroy.InboxListParams{
    Mailbox: "info@example.com",
    Folder:  "INBOX",
    Page:    1,
    Limit:   20,
})`}
            python={`messages = sentroy.inbox.list(InboxListParams(
    mailbox="info@example.com",
    folder="INBOX",
    page=1,
    limit=20,
))`}
            php={`$messages = $sentroy->inbox->list([
    'mailbox' => 'info@example.com',
    'folder'  => 'INBOX',
    'page'    => 1,
    'limit'   => 20,
]);`}
          />
        </Sub>

        <Sub id="inbox-get" title="Get message">
          <EndpointExample
            method="GET"
            service="mail"
            path="/inbox/{uid}?mailbox=info@example.com"
            ts={`const message = await sentroy.inbox.get(1234, {
  mailbox: "info@example.com",
})`}
            go={`message, err := client.Inbox.Get(1234, &sentroy.InboxGetOptions{
    Mailbox: "info@example.com",
})`}
            python={`message = sentroy.inbox.get(1234, mailbox="info@example.com")`}
            php={`$message = $sentroy->inbox->get(1234, ['mailbox' => 'info@example.com']);`}
          />
        </Sub>

        <Sub id="inbox-folders" title="List folders">
          <EndpointExample
            method="GET"
            service="mail"
            path="/inbox/folders?mailbox=info@example.com"
            ts={`const folders = await sentroy.inbox.listFolders("info@example.com")`}
            go={`folders, err := client.Inbox.ListFolders("info@example.com")`}
            python={`folders = sentroy.inbox.list_folders("info@example.com")`}
            php={`$folders = $sentroy->inbox->listFolders('info@example.com');`}
          />
        </Sub>

        <Sub id="inbox-thread" title="Get thread">
          <EndpointExample
            method="GET"
            service="mail"
            path={`/inbox/thread?subject=Re%3A%20Project%20update&mailbox=info@example.com`}
            ts={`const thread = await sentroy.inbox.getThread(
  "Re: Project update",
  "info@example.com",
)`}
            go={`thread, err := client.Inbox.GetThread(
    "Re: Project update",
    "info@example.com",
)`}
            python={`thread = sentroy.inbox.get_thread(
    "Re: Project update",
    "info@example.com",
)`}
            php={`$thread = $sentroy->inbox->getThread(
    'Re: Project update',
    'info@example.com',
);`}
          />
        </Sub>

        <Sub id="inbox-read" title="Mark as read / unread">
          <EndpointExample
            method="PATCH"
            service="mail"
            path="/inbox/{uid}/read"
            body={`{ "mailbox": "info@example.com" }`}
            ts={`await sentroy.inbox.markAsRead(1234, { mailbox: "info@example.com" })
await sentroy.inbox.markAsUnread(1234, { mailbox: "info@example.com" })`}
            go={`err = client.Inbox.MarkAsRead(1234, &sentroy.InboxGetOptions{Mailbox: "info@example.com"})
err = client.Inbox.MarkAsUnread(1234, &sentroy.InboxGetOptions{Mailbox: "info@example.com"})`}
            python={`sentroy.inbox.mark_as_read(1234, mailbox="info@example.com")
sentroy.inbox.mark_as_unread(1234, mailbox="info@example.com")`}
            php={`$sentroy->inbox->markAsRead(1234, ['mailbox' => 'info@example.com']);
$sentroy->inbox->markAsUnread(1234, ['mailbox' => 'info@example.com']);`}
          />
        </Sub>

        <Sub id="inbox-move" title="Move message">
          <EndpointExample
            method="POST"
            service="mail"
            path="/inbox/{uid}/move"
            body={`{
  "to": "Trash",
  "from": "INBOX",
  "mailbox": "info@example.com"
}`}
            ts={`await sentroy.inbox.move(1234, "Trash", {
  from: "INBOX",
  mailbox: "info@example.com",
})`}
            go={`err = client.Inbox.Move(1234, "Trash", &sentroy.InboxMoveOptions{
    From:    "INBOX",
    Mailbox: "info@example.com",
})`}
            python={`sentroy.inbox.move(
    1234, "Trash",
    from_folder="INBOX",
    mailbox="info@example.com",
)`}
            php={`$sentroy->inbox->move(1234, 'Trash', [
    'from'    => 'INBOX',
    'mailbox' => 'info@example.com',
]);`}
          />
        </Sub>

        <Sub id="inbox-delete" title="Delete message">
          <EndpointExample
            method="DELETE"
            service="mail"
            path="/inbox/{uid}?mailbox=info@example.com"
            ts={`await sentroy.inbox.delete(1234, { mailbox: "info@example.com" })`}
            go={`err = client.Inbox.Delete(1234, &sentroy.InboxGetOptions{Mailbox: "info@example.com"})`}
            python={`sentroy.inbox.delete(1234, mailbox="info@example.com")`}
            php={`$sentroy->inbox->delete(1234, ['mailbox' => 'info@example.com']);`}
          />
        </Sub>
      </Section>

      <Section
        id="send"
        title="Send email"
        description="Single endpoint for transactional and bulk send. Pass either a templateId + variables, or raw html. Recipients can be a string or array of addresses."
      >
        <Sub id="send-template" title="Send with a template">
          <EndpointExample
            method="POST"
            service="mail"
            path="/send"
            body={`{
  "to": "user@example.com",
  "from": "info@example.com",
  "subject": "Welcome!",
  "domainId": "domain-id",
  "templateId": "template-id",
  "variables": { "name": "John", "company": "Acme" }
}`}
            ts={`const result = await sentroy.send.email({
  to: "user@example.com",
  from: "info@example.com",
  subject: "Welcome!",
  domainId: "domain-id",
  templateId: "template-id",
  variables: {
    name: "John",
    company: "Acme",
  },
})`}
            go={`result, err := client.Send.Email(sentroy.SendParams{
    To:         "user@example.com",
    From:       "info@example.com",
    Subject:    "Welcome!",
    DomainID:   "domain-id",
    TemplateID: "template-id",
    Variables: map[string]string{
        "name":    "John",
        "company": "Acme",
    },
})`}
            python={`result = sentroy.send.email(SendParams(
    to="user@example.com",
    from_addr="info@example.com",
    subject="Welcome!",
    domain_id="domain-id",
    template_id="template-id",
    variables={"name": "John", "company": "Acme"},
))`}
            php={`$result = $sentroy->send->email([
    'to'         => 'user@example.com',
    'from'       => 'info@example.com',
    'subject'    => 'Welcome!',
    'domainId'   => 'domain-id',
    'templateId' => 'template-id',
    'variables'  => ['name' => 'John', 'company' => 'Acme'],
]);`}
          />
        </Sub>

        <Sub id="send-lang" title="Send in a specific language">
          <Para>
            For multilingual templates, pass <InlineCode>lang</InlineCode> to pick which translation of subject
            and body to use. If omitted, the template&apos;s default language wins.
          </Para>
          <EndpointExample
            method="POST"
            service="mail"
            path="/send"
            body={`{
  "to": "user@example.com",
  "from": "info@example.com",
  "subject": "Hosgeldin!",
  "domainId": "domain-id",
  "templateId": "template-id",
  "lang": "tr",
  "variables": { "name": "Ahmet" }
}`}
            ts={`await sentroy.send.email({
  to: "user@example.com",
  from: "info@example.com",
  subject: "Hosgeldin!",
  domainId: "domain-id",
  templateId: "template-id",
  lang: "tr",
  variables: { name: "Ahmet" },
})`}
            go={`result, err := client.Send.Email(sentroy.SendParams{
    To:         "user@example.com",
    From:       "info@example.com",
    Subject:    "Hosgeldin!",
    DomainID:   "domain-id",
    TemplateID: "template-id",
    Lang:       "tr",
    Variables:  map[string]string{"name": "Ahmet"},
})`}
            python={`result = sentroy.send.email(SendParams(
    to="user@example.com",
    from_addr="info@example.com",
    subject="Hosgeldin!",
    domain_id="domain-id",
    template_id="template-id",
    lang="tr",
    variables={"name": "Ahmet"},
))`}
            php={`$result = $sentroy->send->email([
    'to'         => 'user@example.com',
    'from'       => 'info@example.com',
    'subject'    => 'Hosgeldin!',
    'domainId'   => 'domain-id',
    'templateId' => 'template-id',
    'lang'       => 'tr',
    'variables'  => ['name' => 'Ahmet'],
]);`}
          />
        </Sub>

        <Sub id="send-html" title="Send with raw HTML">
          <EndpointExample
            method="POST"
            service="mail"
            path="/send"
            body={`{
  "to": ["user1@example.com", "user2@example.com"],
  "from": "info@example.com",
  "subject": "Hello",
  "domainId": "domain-id",
  "html": "<h1>Hello World</h1>"
}`}
            ts={`await sentroy.send.email({
  to: ["user1@example.com", "user2@example.com"],
  from: "info@example.com",
  subject: "Hello",
  domainId: "domain-id",
  html: "<h1>Hello World</h1>",
})`}
            go={`result, err := client.Send.Email(sentroy.SendParams{
    To:       []string{"user1@example.com", "user2@example.com"},
    From:     "info@example.com",
    Subject:  "Hello",
    DomainID: "domain-id",
    HTML:     "<h1>Hello World</h1>",
})`}
            python={`result = sentroy.send.email(SendParams(
    to=["user1@example.com", "user2@example.com"],
    from_addr="info@example.com",
    subject="Hello",
    domain_id="domain-id",
    html="<h1>Hello World</h1>",
))`}
            php={`$result = $sentroy->send->email([
    'to'       => ['user1@example.com', 'user2@example.com'],
    'from'     => 'info@example.com',
    'subject'  => 'Hello',
    'domainId' => 'domain-id',
    'html'     => '<h1>Hello World</h1>',
]);`}
          />
        </Sub>

        <Sub id="send-attachments" title="Send with attachments">
          <Para>
            Attachments accept a base64 <InlineCode>content</InlineCode> string plus filename and MIME type.
          </Para>
          <EndpointExample
            method="POST"
            service="mail"
            path="/send"
            body={`{
  "to": "user@example.com",
  "from": "info@example.com",
  "subject": "Invoice",
  "domainId": "domain-id",
  "html": "<p>Please find your invoice attached.</p>",
  "attachments": [
    {
      "filename": "invoice.pdf",
      "content": "<base64-string>",
      "contentType": "application/pdf"
    }
  ]
}`}
            ts={`await sentroy.send.email({
  to: "user@example.com",
  from: "info@example.com",
  subject: "Invoice",
  domainId: "domain-id",
  html: "<p>Please find your invoice attached.</p>",
  attachments: [
    {
      filename: "invoice.pdf",
      content: base64String,
      contentType: "application/pdf",
    },
  ],
})`}
            go={`result, err := client.Send.Email(sentroy.SendParams{
    To:       "user@example.com",
    From:     "info@example.com",
    Subject:  "Invoice",
    DomainID: "domain-id",
    HTML:     "<p>Please find your invoice attached.</p>",
    Attachments: []sentroy.Attachment{
        {
            Filename:    "invoice.pdf",
            Content:     base64String,
            ContentType: "application/pdf",
        },
    },
})`}
            python={`result = sentroy.send.email(SendParams(
    to="user@example.com",
    from_addr="info@example.com",
    subject="Invoice",
    domain_id="domain-id",
    html="<p>Please find your invoice attached.</p>",
    attachments=[
        Attachment(
            filename="invoice.pdf",
            content=base64_string,
            content_type="application/pdf",
        ),
    ],
))`}
            php={`$result = $sentroy->send->email([
    'to'          => 'user@example.com',
    'from'        => 'info@example.com',
    'subject'     => 'Invoice',
    'domainId'    => 'domain-id',
    'html'        => '<p>Please find your invoice attached.</p>',
    'attachments' => [
        [
            'filename'    => 'invoice.pdf',
            'content'     => $base64String,
            'contentType' => 'application/pdf',
        ],
    ],
]);`}
          />
        </Sub>

        <Callout title="Bulk-friendly">
          Pass an array to <InlineCode>to</InlineCode> to fan out a single send across multiple recipients in
          one call. Each recipient gets an independent <InlineCode>mail-log</InlineCode> entry, so delivery
          status is tracked per-address.
        </Callout>
      </Section>

      <Section
        id="audience"
        title="Audience"
        description="Manage contacts and audience lists. Build your own newsletter signup, sync customers from another system, or assemble segments for a campaign."
      >
        <Sub id="audience-contacts-list" title="List contacts">
          <Para>
            Paginated browsing with optional <InlineCode>status</InlineCode> and tag filters. Tags are
            comma-joined on the wire — pass them as an array to the SDK.
          </Para>
          <EndpointExample
            method="GET"
            service="mail"
            path="/audience/contacts?page=1&limit=50&status=active&tags=customer,vip"
            ts={`const { contacts, total, page, limit } = await sentroy.audience.contacts.list({
  page: 1,
  limit: 50,
  status: "active",
  tags: ["customer", "vip"],
})`}
            go={`result, err := client.Audience.Contacts.List(&sentroy.ContactListParams{
    Page:   1,
    Limit:  50,
    Status: "active",
    Tags:   []string{"customer", "vip"},
})`}
            python={`result = sentroy.audience.contacts.list(
    page=1,
    limit=50,
    status="active",
    tags=["customer", "vip"],
)`}
            php={`$result = $sentroy->audience->contacts->list([
    'page'   => 1,
    'limit'  => 50,
    'status' => 'active',
    'tags'   => ['customer', 'vip'],
]);`}
          />
        </Sub>

        <Sub id="audience-contacts-search" title="Search contacts">
          <Para>
            Email-prefix autocomplete. Capped at 10 results server-side — use{" "}
            <InlineCode>list</InlineCode> for paginated browsing.
          </Para>
          <EndpointExample
            method="GET"
            service="mail"
            path="/audience/contacts?q=alex@"
            ts={`const matches = await sentroy.audience.contacts.search("alex@")`}
            go={`matches, err := client.Audience.Contacts.Search("alex@")`}
            python={`matches = sentroy.audience.contacts.search("alex@")`}
            php={`$matches = $sentroy->audience->contacts->search('alex@');`}
          />
        </Sub>

        <Sub id="audience-contacts-create" title="Create contact">
          <EndpointExample
            method="POST"
            service="mail"
            path="/audience/contacts"
            body={`{
  "email": "user@example.com",
  "name": "Jane Doe",
  "tags": ["beta-tester"],
  "metadata": { "signupSource": "landing-2026-q2" }
}`}
            ts={`const contact = await sentroy.audience.contacts.create({
  email: "user@example.com",
  name: "Jane Doe",
  tags: ["beta-tester"],
  metadata: { signupSource: "landing-2026-q2" },
})`}
            go={`contact, err := client.Audience.Contacts.Create(sentroy.CreateContactParams{
    Email: "user@example.com",
    Name:  "Jane Doe",
    Tags:  []string{"beta-tester"},
    Metadata: map[string]any{
        "signupSource": "landing-2026-q2",
    },
})`}
            python={`contact = sentroy.audience.contacts.create(
    email="user@example.com",
    name="Jane Doe",
    tags=["beta-tester"],
    metadata={"signupSource": "landing-2026-q2"},
)`}
            php={`$contact = $sentroy->audience->contacts->create([
    'email'    => 'user@example.com',
    'name'     => 'Jane Doe',
    'tags'     => ['beta-tester'],
    'metadata' => ['signupSource' => 'landing-2026-q2'],
]);`}
          />
        </Sub>

        <Sub id="audience-contacts-update" title="Update contact">
          <Para>Pass any subset of fields. Use <InlineCode>status</InlineCode> to mark unsubscribed/bounced.</Para>
          <EndpointExample
            method="PATCH"
            service="mail"
            path="/audience/contacts/{id}"
            body={`{ "tags": ["customer"] }`}
            ts={`await sentroy.audience.contacts.update(contact.id, { tags: ["customer"] })`}
            go={`contact, err := client.Audience.Contacts.Update(contact.ID, sentroy.UpdateContactParams{
    Tags: []string{"customer"},
})`}
            python={`sentroy.audience.contacts.update(contact.id, tags=["customer"])`}
            php={`$sentroy->audience->contacts->update($contact['id'], ['tags' => ['customer']]);`}
          />
        </Sub>

        <Sub id="audience-contacts-delete" title="Delete contact">
          <Para>
            Soft-delete — sets <InlineCode>status: &quot;unsubscribed&quot;</InlineCode>. The record is
            preserved so historical mail-log foreign keys keep resolving and the email can&apos;t accidentally
            be re-added.
          </Para>
          <EndpointExample
            method="DELETE"
            service="mail"
            path="/audience/contacts/{id}"
            ts={`await sentroy.audience.contacts.delete(contact.id)`}
            go={`err = client.Audience.Contacts.Delete(contact.ID)`}
            python={`sentroy.audience.contacts.delete(contact.id)`}
            php={`$sentroy->audience->contacts->delete($contact['id']);`}
          />
        </Sub>

        <Sub id="audience-lists" title="Audience lists">
          <Para>
            Lists are simple groupings; a single contact can belong to many. Use them as the target of a
            campaign or a form submission.
          </Para>
          <EndpointExample
            method="GET"
            service="mail"
            path="/audience/lists"
            ts={`const lists = await sentroy.audience.lists.list()`}
            go={`lists, err := client.Audience.Lists.List()`}
            python={`lists = sentroy.audience.lists.list()`}
            php={`$lists = $sentroy->audience->lists->getAll();`}
          />
          <EndpointExample
            method="POST"
            service="mail"
            path="/audience/lists"
            body={`{
  "name": "Newsletter — May 2026",
  "description": "Opt-ins from the homepage form"
}`}
            ts={`const list = await sentroy.audience.lists.create({
  name: "Newsletter — May 2026",
  description: "Opt-ins from the homepage form",
})`}
            go={`list, err := client.Audience.Lists.Create(sentroy.CreateAudienceListParams{
    Name:        "Newsletter — May 2026",
    Description: "Opt-ins from the homepage form",
})`}
            python={`list_ = sentroy.audience.lists.create(
    name="Newsletter — May 2026",
    description="Opt-ins from the homepage form",
)`}
            php={`$list = $sentroy->audience->lists->create([
    'name'        => 'Newsletter — May 2026',
    'description' => 'Opt-ins from the homepage form',
]);`}
          />
          <EndpointExample
            method="DELETE"
            service="mail"
            path="/audience/lists/{id}"
            ts={`await sentroy.audience.lists.delete(list.id)`}
            go={`err = client.Audience.Lists.Delete(list.ID)`}
            python={`sentroy.audience.lists.delete(list_.id)`}
            php={`$sentroy->audience->lists->delete($list['id']);`}
          />
        </Sub>

        <Sub id="audience-list-members" title="List membership">
          <Para>
            Membership operations are scoped via the SDK&apos;s{" "}
            <InlineCode>members(listId)</InlineCode> accessor — keeps the list id off every call.
          </Para>
          <EndpointExample
            method="POST"
            service="mail"
            path="/audience/lists/{id}/members"
            body={`{ "contactId": "contact-id" }`}
            ts={`const members = sentroy.audience.lists.members(list.id)
await members.add(contact.id)`}
            go={`err = client.Audience.Lists.Members(list.ID).Add(contact.ID)`}
            python={`members = sentroy.audience.lists.members(list_.id)
members.add(contact.id)`}
            php={`$members = $sentroy->audience->lists->members($list['id']);
$members->add($contact['id']);`}
          />
          <EndpointExample
            method="GET"
            service="mail"
            path="/audience/lists/{id}/members"
            ts={`const inList = await members.list()`}
            go={`inList, err := client.Audience.Lists.Members(list.ID).List()`}
            python={`in_list = members.list()`}
            php={`$inList = $members->getAll();`}
          />
          <EndpointExample
            method="DELETE"
            service="mail"
            path="/audience/lists/{id}/members"
            body={`{ "contactId": "contact-id" }`}
            ts={`await members.remove(contact.id)`}
            go={`err = client.Audience.Lists.Members(list.ID).Remove(contact.ID)`}
            python={`members.remove(contact.id)`}
            php={`$members->remove($contact['id']);`}
          />
        </Sub>
      </Section>

      <Section
        id="suppressions"
        title="Suppressions"
        description="Suppressed addresses are skipped at send time. Bounces and complaints are added automatically by the mail server — the API is for honoring off-platform opt-outs or removing a stale entry."
      >
        <Sub id="suppressions-list" title="List suppressions">
          <EndpointExample
            method="GET"
            service="mail"
            path="/suppressions?page=1&limit=50&domainId=domain-id&reason=complaint"
            ts={`const suppressions = await sentroy.suppressions.list({
  domainId: "domain-id",
  reason: "complaint",
  page: 1,
  limit: 50,
})`}
            go={`suppressions, err := client.Suppressions.List(&sentroy.SuppressionListParams{
    DomainID: "domain-id",
    Reason:   "complaint",
    Page:     1,
    Limit:    50,
})`}
            python={`suppressions = sentroy.suppressions.list(
    domain_id="domain-id",
    reason="complaint",
    page=1,
    limit=50,
)`}
            php={`$suppressions = $sentroy->suppressions->getAll([
    'domainId' => 'domain-id',
    'reason'   => 'complaint',
    'page'     => 1,
    'limit'    => 50,
]);`}
          />
        </Sub>

        <Sub id="suppressions-add" title="Add suppression">
          <EndpointExample
            method="POST"
            service="mail"
            path="/suppressions"
            body={`{
  "email": "leaving@example.com",
  "domainId": "domain-id",
  "reason": "manual"
}`}
            ts={`const added = await sentroy.suppressions.add({
  email: "leaving@example.com",
  domainId: "domain-id",
  reason: "manual",
})`}
            go={`added, err := client.Suppressions.Add(sentroy.AddSuppressionParams{
    Email:    "leaving@example.com",
    DomainID: "domain-id",
    Reason:   "manual",
})`}
            python={`added = sentroy.suppressions.add(
    email="leaving@example.com",
    domain_id="domain-id",
    reason="manual",
)`}
            php={`$added = $sentroy->suppressions->add([
    'email'    => 'leaving@example.com',
    'domainId' => 'domain-id',
    'reason'   => 'manual',
]);`}
          />
        </Sub>

        <Sub id="suppressions-remove" title="Remove suppression">
          <Para>Removing a suppression makes the address eligible to receive mail again.</Para>
          <EndpointExample
            method="DELETE"
            service="mail"
            path="/suppressions/{id}"
            ts={`await sentroy.suppressions.remove(added.id)`}
            go={`err = client.Suppressions.Remove(added.ID)`}
            python={`sentroy.suppressions.remove(added.id)`}
            php={`$sentroy->suppressions->remove($added['id']);`}
          />
        </Sub>
      </Section>

      <Section
        id="webhooks"
        title="Webhooks"
        description="Subscribe to delivery events on a per-domain basis. Each delivery is signed with the secret returned at create time — verify the HMAC on your endpoint before trusting the payload."
      >
        <Sub id="webhooks-create" title="Create webhook">
          <EndpointExample
            method="POST"
            service="mail"
            path="/webhooks"
            body={`{
  "url": "https://example.com/webhooks/sentroy",
  "events": ["sent", "bounced", "opened", "clicked", "unsubscribed"],
  "domainId": "domain-id"
}`}
            ts={`const webhook = await sentroy.webhooks.create({
  url: "https://example.com/webhooks/sentroy",
  events: ["sent", "bounced", "opened", "clicked", "unsubscribed"],
  domainId: "domain-id",
})

console.log(webhook.secret) // Returned ONCE — store it now`}
            go={`webhook, err := client.Webhooks.Create(sentroy.CreateWebhookParams{
    URL:      "https://example.com/webhooks/sentroy",
    Events:   []string{"sent", "bounced", "opened", "clicked", "unsubscribed"},
    DomainID: "domain-id",
})

fmt.Println(webhook.Secret) // Returned ONCE — store it now`}
            python={`webhook = sentroy.webhooks.create(
    url="https://example.com/webhooks/sentroy",
    events=["sent", "bounced", "opened", "clicked", "unsubscribed"],
    domain_id="domain-id",
)

print(webhook.secret)  # Returned ONCE — store it now`}
            php={`$webhook = $sentroy->webhooks->create([
    'url'      => 'https://example.com/webhooks/sentroy',
    'events'   => ['sent', 'bounced', 'opened', 'clicked', 'unsubscribed'],
    'domainId' => 'domain-id',
]);

echo $webhook['secret']; // Returned ONCE — store it now`}
          />
          <Callout variant="warning" title="Save the secret">
            The webhook secret is returned only on create. Subsequent reads return the config without it. If
            you lose the secret, delete the webhook and create a new one.
          </Callout>
        </Sub>

        <Sub id="webhooks-events" title="Event types">
          <PropsTable
            rows={[
              { name: "sent", type: "string", description: "Mail handed off to SMTP successfully" },
              { name: "bounced", type: "string", description: "Hard or soft bounce reported by remote MTA" },
              { name: "failed", type: "string", description: "Send pipeline failure (rendering, suppression, quota)" },
              { name: "opened", type: "string", description: "Tracking pixel hit (requires trackOpens at send time)" },
              { name: "clicked", type: "string", description: "Link click recorded (requires trackClicks at send time)" },
              { name: "unsubscribed", type: "string", description: "Recipient clicked the {{unsubscribe_url}} link" },
            ]}
          />
        </Sub>

        <Sub id="webhooks-list" title="List + scope">
          <EndpointExample
            method="GET"
            service="mail"
            path="/webhooks"
            ts={`const all = await sentroy.webhooks.list()
const scoped = await sentroy.webhooks.list("domain-id")`}
            go={`all, err := client.Webhooks.List("")
scoped, err := client.Webhooks.List("domain-id")`}
            python={`all_ = sentroy.webhooks.list()
scoped = sentroy.webhooks.list(domain_id="domain-id")`}
            php={`$all = $sentroy->webhooks->getAll();
$scoped = $sentroy->webhooks->getAll(['domainId' => 'domain-id']);`}
          />
        </Sub>

        <Sub id="webhooks-test" title="Test fire">
          <Para>
            Manual dispatch — POST a custom payload at the webhook&apos;s current URL. The result and a row in
            the delivery log are returned for inspection. The mail server&apos;s automated event delivery is
            unaffected; this is a debug tool, not a production retry path.
          </Para>
          <EndpointExample
            method="POST"
            service="mail"
            path="/webhooks/{id}/test"
            body={`{
  "event": "sent",
  "payload": {
    "mailLogId": "ml_abc",
    "to": "user@example.com",
    "subject": "Welcome"
  }
}`}
            ts={`const result = await sentroy.webhooks.test(webhook.id, {
  event: "sent",
  payload: {
    mailLogId: "ml_abc",
    to: "user@example.com",
    subject: "Welcome",
  },
})

console.log(result.responseStatus, result.durationMs)`}
            go={`result, err := client.Webhooks.Test(webhook.ID, sentroy.WebhookTestParams{
    Event: "sent",
    Payload: map[string]any{
        "mailLogId": "ml_abc",
        "to":        "user@example.com",
        "subject":   "Welcome",
    },
})`}
            python={`result = sentroy.webhooks.test(
    webhook.id,
    event="sent",
    payload={"mailLogId": "ml_abc", "to": "user@example.com", "subject": "Welcome"},
)`}
            php={`$result = $sentroy->webhooks->test($webhook['id'], [
    'event'   => 'sent',
    'payload' => [
        'mailLogId' => 'ml_abc',
        'to'        => 'user@example.com',
        'subject'   => 'Welcome',
    ],
]);`}
          />
        </Sub>

        <Sub id="webhooks-deliveries" title="List deliveries">
          <Para>
            Paginated history of test/replay dispatches recorded for the webhook. Each row carries the full
            payload, response body, status, and round-trip duration.
          </Para>
          <EndpointExample
            method="GET"
            service="mail"
            path="/webhooks/{id}/deliveries?page=1&limit=50&status=failed"
            ts={`const { items, total } = await sentroy.webhooks
  .deliveries(webhook.id)
  .list({ page: 1, limit: 50, status: "failed" })`}
            go={`result, err := client.Webhooks.Deliveries(webhook.ID).List(&sentroy.WebhookDeliveryListParams{
    Page:   1,
    Limit:  50,
    Status: "failed",
})`}
            python={`result = sentroy.webhooks.deliveries(webhook.id).list(
    page=1, limit=50, status="failed",
)`}
            php={`$result = $sentroy->webhooks->deliveries($webhook['id'])->list([
    'page'   => 1,
    'limit'  => 50,
    'status' => 'failed',
]);`}
          />
        </Sub>

        <Sub id="webhooks-deliveries-get" title="Get delivery">
          <EndpointExample
            method="GET"
            service="mail"
            path="/webhooks/{id}/deliveries/{deliveryId}"
            ts={`const delivery = await sentroy.webhooks
  .deliveries(webhook.id)
  .get(deliveryId)`}
            go={`delivery, err := client.Webhooks.Deliveries(webhook.ID).Get(deliveryID)`}
            python={`delivery = sentroy.webhooks.deliveries(webhook.id).get(delivery_id)`}
            php={`$delivery = $sentroy->webhooks->deliveries($webhook['id'])->get($deliveryId);`}
          />
        </Sub>

        <Sub id="webhooks-deliveries-replay" title="Replay delivery">
          <Para>
            Re-fire the recorded payload at the webhook&apos;s <em>current</em> URL. Useful for retesting
            after the receiver fixes a bug. The new row is linked to the original via{" "}
            <InlineCode>replayOf</InlineCode>.
          </Para>
          <EndpointExample
            method="POST"
            service="mail"
            path="/webhooks/{id}/deliveries/{deliveryId}/replay"
            ts={`const result = await sentroy.webhooks
  .deliveries(webhook.id)
  .replay(deliveryId)`}
            go={`result, err := client.Webhooks.Deliveries(webhook.ID).Replay(deliveryID)`}
            python={`result = sentroy.webhooks.deliveries(webhook.id).replay(delivery_id)`}
            php={`$result = $sentroy->webhooks->deliveries($webhook['id'])->replay($deliveryId);`}
          />
        </Sub>

        <Sub id="webhooks-update" title="Update + delete">
          <EndpointExample
            method="PATCH"
            service="mail"
            path="/webhooks/{id}"
            body={`{ "active": false }`}
            ts={`await sentroy.webhooks.update(webhook.id, { active: false })`}
            go={`webhook, err := client.Webhooks.Update(webhook.ID, sentroy.UpdateWebhookParams{
    Active: sentroy.Ptr(false),
})`}
            python={`sentroy.webhooks.update(webhook.id, active=False)`}
            php={`$sentroy->webhooks->update($webhook['id'], ['active' => false]);`}
          />
          <EndpointExample
            method="DELETE"
            service="mail"
            path="/webhooks/{id}"
            ts={`await sentroy.webhooks.delete(webhook.id)`}
            go={`err = client.Webhooks.Delete(webhook.ID)`}
            python={`sentroy.webhooks.delete(webhook.id)`}
            php={`$sentroy->webhooks->delete($webhook['id']);`}
          />
        </Sub>
      </Section>

      <Section
        id="logs"
        title="Logs"
        description="Query the mail log to debug delivery issues, surface per-message status in your own UI, or build a customer-facing activity timeline."
      >
        <Sub id="logs-list" title="List logs">
          <EndpointExample
            method="GET"
            service="mail"
            path="/logs?status=bounced&domainId=domain-id&from=2026-05-01T00:00:00Z&to=2026-05-31T23:59:59Z&page=1&limit=100"
            ts={`const logs = await sentroy.logs.list({
  status: "bounced",
  domainId: "domain-id",
  from: "2026-05-01T00:00:00Z",
  to: "2026-05-31T23:59:59Z",
  page: 1,
  limit: 100,
})`}
            go={`logs, err := client.Logs.List(&sentroy.LogListParams{
    Status:   "bounced",
    DomainID: "domain-id",
    From:     "2026-05-01T00:00:00Z",
    To:       "2026-05-31T23:59:59Z",
    Page:     1,
    Limit:    100,
})`}
            python={`logs = sentroy.logs.list(
    status="bounced",
    domain_id="domain-id",
    from_date="2026-05-01T00:00:00Z",
    to_date="2026-05-31T23:59:59Z",
    page=1,
    limit=100,
)`}
            php={`$logs = $sentroy->logs->getAll([
    'status'   => 'bounced',
    'domainId' => 'domain-id',
    'from'     => '2026-05-01T00:00:00Z',
    'to'       => '2026-05-31T23:59:59Z',
    'page'     => 1,
    'limit'    => 100,
]);`}
          />
        </Sub>

        <Sub id="logs-get" title="Get a single entry">
          <EndpointExample
            method="GET"
            service="mail"
            path="/logs/{id}"
            ts={`const log = await sentroy.logs.get(logs[0].id)
console.log(log.openedAt, log.clickedAt) // tracking timestamps if enabled`}
            go={`log, err := client.Logs.Get(logs[0].ID)
fmt.Println(log.OpenedAt, log.ClickedAt) // tracking timestamps if enabled`}
            python={`log = sentroy.logs.get(logs[0].id)
print(log.opened_at, log.clicked_at)  # tracking timestamps if enabled`}
            php={`$log = $sentroy->logs->get($logs[0]['id']);
echo $log['openedAt'] . ' ' . $log['clickedAt']; // tracking timestamps if enabled`}
          />
          <Callout>
            <InlineCode>openedAt</InlineCode> and <InlineCode>clickedAt</InlineCode> only populate when the
            send was issued with <InlineCode>trackOpens</InlineCode> / <InlineCode>trackClicks</InlineCode>.
            Both default on for HTML sends.
          </Callout>
        </Sub>
      </Section>

      <PageFooter current="/docs/mail" />
    </article>
  )
}

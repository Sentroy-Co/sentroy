import type { Metadata } from "next"
import { Callout, Lede, Para, Section, Sub } from "../components/docs-ui"
import { EndpointExample } from "../components/endpoint-example"
import { PageFooter } from "../components/page-footer"

export const metadata: Metadata = {
  title: "WhatsApp — messaging API",
  description:
    "Sentroy WhatsApp Santral API: send template-based messages to a single recipient or a whole audience, manage reusable templates and phone-based audiences, and read send logs — all with the same Bearer access token as Mail and Storage.",
}

export default function WhatsAppDocsPage() {
  return (
    <article>
      <header className="mb-12 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Reference / WhatsApp
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            WhatsApp
          </h1>
          <Lede>
            Send WhatsApp messages from your connected numbers using reusable
            templates with <code>{"{{variables}}"}</code> — to a single
            recipient or a saved audience — and track every send.
          </Lede>
        </div>
      </header>

      <Callout>
        WhatsApp uses the <strong>same Bearer access token</strong> (
        <code>stk_…</code>) as Mail and Storage. Create one in your dashboard
        under Access Tokens, then pass it as{" "}
        <code>accessToken</code> to the SDK. Connect a WhatsApp number in the
        dashboard before sending — the API sends from a connected number.
      </Callout>

      <Section
        id="numbers"
        title="Numbers"
        description="The WhatsApp numbers connected to your company. Only numbers with connected status can send. Use a number's sessionId or phoneNumber as the send `from`."
      >
        <Sub id="numbers-list" title="List numbers">
          <EndpointExample
            method="GET"
            service="whatsapp"
            path="/numbers"
            ts={`const numbers = await sentroy.whatsapp.numbers.list()
// → [{ sessionId, phoneNumber, label, status, connected }]`}
            python={`numbers = sentroy.whatsapp.numbers.list()`}
          />
        </Sub>
      </Section>

      <Section
        id="templates"
        title="Templates"
        description="Reusable message bodies with {{variable}} placeholders. Variables are extracted automatically and filled at send time."
      >
        <Sub id="templates-list" title="List templates">
          <EndpointExample
            method="GET"
            service="whatsapp"
            path="/templates"
            ts={`const templates = await sentroy.whatsapp.templates.list()`}
            python={`templates = sentroy.whatsapp.templates.list()`}
          />
        </Sub>
        <Sub id="templates-create" title="Create template">
          <EndpointExample
            method="POST"
            service="whatsapp"
            path="/templates"
            body={`{
  "name": "Order shipped",
  "body": "Hi {{name}}, your order {{orderNo}} has shipped!"
}`}
            ts={`const tpl = await sentroy.whatsapp.templates.create({
  name: "Order shipped",
  body: "Hi {{name}}, your order {{orderNo}} has shipped!",
})`}
            python={`tpl = sentroy.whatsapp.templates.create(
  name="Order shipped",
  body="Hi {{name}}, your order {{orderNo}} has shipped!",
)`}
          />
        </Sub>
        <Sub id="templates-update" title="Update / delete template">
          <EndpointExample
            method="PATCH"
            service="whatsapp"
            path="/templates/{id}"
            body={`{ "body": "Updated body with {{name}}" }`}
            ts={`await sentroy.whatsapp.templates.update("tpl-id", {
  body: "Updated body with {{name}}",
})
await sentroy.whatsapp.templates.delete("tpl-id")`}
          />
        </Sub>
      </Section>

      <Section
        id="audiences"
        title="Audiences"
        description="Phone-based target lists. Each entry is a phone plus optional per-recipient variables, letting one send personalize every message."
      >
        <Sub id="audiences-list" title="List audiences">
          <EndpointExample
            method="GET"
            service="whatsapp"
            path="/audiences"
            ts={`const audiences = await sentroy.whatsapp.audiences.list()`}
            python={`audiences = sentroy.whatsapp.audiences.list()`}
          />
        </Sub>
        <Sub id="audiences-create" title="Create audience">
          <EndpointExample
            method="POST"
            service="whatsapp"
            path="/audiences"
            body={`{
  "name": "March promo",
  "entries": [
    { "phone": "+905551112233", "variables": { "name": "Ada" } },
    "+905554445566"
  ]
}`}
            ts={`const audience = await sentroy.whatsapp.audiences.create({
  name: "March promo",
  entries: [
    { phone: "+905551112233", variables: { name: "Ada" } },
    "+905554445566",
  ],
})`}
          />
        </Sub>
      </Section>

      <Section
        id="send"
        title="Send"
        description="Send a template (or raw body) to a single recipient (`to`) or a whole audience (`audienceId`). Variables are rendered per recipient; audience entry variables override the global ones. Returns a per-recipient result summary."
      >
        <Sub id="send-single" title="Send to one recipient">
          <EndpointExample
            method="POST"
            service="whatsapp"
            path="/send"
            body={`{
  "to": "+905551112233",
  "templateId": "tpl-id",
  "variables": { "name": "Ada", "orderNo": "1042" }
}`}
            ts={`const res = await sentroy.whatsapp.send({
  to: "+905551112233",
  templateId: "tpl-id",
  variables: { name: "Ada", orderNo: "1042" },
})
// → { total, sent, failed, results: [...] }`}
            python={`res = sentroy.whatsapp.send(
  to="+905551112233",
  template_id="tpl-id",
  variables={"name": "Ada", "orderNo": "1042"},
)`}
          />
        </Sub>
        <Sub id="send-audience" title="Send to an audience (bulk)">
          <Para>
            Omit <code>to</code> and pass <code>audienceId</code>. Every audience
            entry is messaged, rate-limited on the server. Provide{" "}
            <code>from</code> (a connected number&apos;s <code>sessionId</code>{" "}
            or <code>phoneNumber</code>) when you have more than one number.
          </Para>
          <EndpointExample
            method="POST"
            service="whatsapp"
            path="/send"
            body={`{
  "from": "+905550000000",
  "audienceId": "aud-id",
  "templateId": "tpl-id",
  "variables": { "campaign": "March" }
}`}
            ts={`const res = await sentroy.whatsapp.send({
  from: "+905550000000",
  audienceId: "aud-id",
  templateId: "tpl-id",
  variables: { campaign: "March" },
})`}
          />
        </Sub>
      </Section>

      <Section
        id="logs"
        title="Send logs"
        description="Every API/template send is logged per recipient. Filter by status, template, or number."
      >
        <Sub id="logs-list" title="List send logs">
          <EndpointExample
            method="GET"
            service="whatsapp"
            path="/logs?status=sent&page=1&limit=50"
            ts={`const logs = await sentroy.whatsapp.logs.list({ status: "sent" })
// → { data, page, limit, total }`}
            python={`logs = sentroy.whatsapp.logs.list(status="sent")`}
          />
        </Sub>
      </Section>

      <PageFooter current="/docs/whatsapp" />
    </article>
  )
}

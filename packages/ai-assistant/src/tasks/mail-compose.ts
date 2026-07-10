/**
 * Mail compose task — kullanıcının vereceği subject + opsiyonel örnek
 * template'e bakıp aynı tasarım/üslup çizgisinde yeni bir mail template
 * üretir. Çıktı: `{ name, subject, body }`, hepsi LocalizedString
 * (caller'ın istediği locale listesi için).
 */

import { z } from "zod"
import { defineTask } from "../assistant"

/**
 * İstenen locale listesinden tam-eşleşen Zod schema üretir. `strict()`
 * sayesinde model fazladan key gönderirse de fail eder; her locale
 * `min(1)` ile boş string'i reddeder. Sıkı schema sayesinde Gemini
 * eksik dile yanıt verirse generateObject Zod parse hatası fırlatır →
 * runAssistant otomatik retry tetikler (raw yanıt prompt'a geri gömülür,
 * model neyin yanlış olduğunu görüp düzeltir).
 */
function localizedRecord(locales: string[]) {
  const shape: Record<string, z.ZodString> = {}
  for (const l of locales) shape[l] = z.string().min(1)
  return z.object(shape).strict()
}

export interface MailComposeInput {
  /** Kullanıcının doğal dilde tarif ettiği subject veya konu (örn.
   *  "Yıl sonu indirimi duyurusu", "Verify your email", "Welcome to ACME"). */
  subjectPrompt: string
  /** Hangi diller için varyasyon istiyoruz (örn ["en", "tr"]). */
  locales: string[]
  /** İsteğe bağlı şirket / ürün adı — model bunu copy'de kullanır. */
  brand?: string
  /** Optional logo URL placeholder. Triggers a different header
   *  scaffold in the system prompt — img tag wrapped in a truthy
   *  section, fallback brand text wrapped in an inverted section.
   *  Caller doesn't need to set the value here; the prompt teaches
   *  the model to emit `{logoUrl}` placeholders so the produced
   *  template is reusable across senders with or without a logo. */
  logoUrl?: string
  /** İsteğe bağlı önceki template — aynı üslubu yakalamak için referans
   *  olarak gönderilir (subject + html body, locale dağılımı dahil). */
  exampleTemplate?: {
    name?: Record<string, string> | string | null
    subject?: Record<string, string> | string | null
    body?: Record<string, string> | string | null
  }
  /** Kullanıcı veya admin'in istediği ek talimatlar (örn "kısa tut",
   *  "CTA butonu mavi olsun", "varsayılan tonun samimi"). */
  notes?: string
  /** Vercel AI Gateway model id'si — örn "anthropic/claude-sonnet-4.6",
   *  "openai/gpt-5", "google/gemini-2.5-pro". Tanımsızsa default
   *  ("google/gemini-2.0-flash") kullanılır. Admin UI'da combobox üzerinden
   *  Gateway'in canlı model katalogundan seçilir (apps/core/api/admin/ai/models). */
  model?: string
}

/**
 * System prompt'u her run'da locale listesine göre özelleştir — model
 * "şu locale key'lerini kullan" talimatını schema'dan ÖNCE prompt'ta
 * görür. Schema validation ikinci güvenlik katmanı; iki ucu birden
 * sıkmak Gemini'yi tutarlı çıktıya zorluyor.
 */
function buildSystemPrompt(input: MailComposeInput): string {
  const localeList = input.locales.map((l) => `"${l}"`).join(", ")
  return `You are an expert transactional email designer for the Sentroy email platform.

Your job: produce a complete, ready-to-send email template in raw HTML
(NOT MJML — Sentroy's mail server accepts raw HTML directly), localized
into every requested language.

REQUIRED LOCALES (these are JSON keys — produce a value for EVERY one,
no more, no less): ${localeList}

For each top-level field (\`name\`, \`subject\`, \`body\`) the JSON object
MUST contain exactly the keys ${localeList}. Missing or extra keys will
fail validation and you will be asked to retry. Do NOT skip a locale even
if it feels redundant — translate or adapt the copy yourself.

Rules — no exceptions:
- The "body" field is HTML. Wrap content in inline-styled <div>, <p>,
  <a>, <h1>/<h2> blocks. Keep it email-safe: NO <script>, NO external
  CSS, NO classes, only inline styles. Max width 600px container.
- Use {placeholderName} (single curly braces) for SCALAR variables the
  recipient data will fill in (e.g. {userName}, {verifyUrl}, {company}).
  Do not use double braces. Re-use placeholders consistently across
  locales — same placeholder names everywhere.
- For REPEATED data (order line items, product lists, table rows, ratings
  per product, etc.) use Mustache-style array sections:
    {#products}
      <tr>
        <td>{quantity}× {productName}</td>
        <td>{amount}</td>
      </tr>
    {/products}
  The opening tag is \`{#name}\`, the closing tag is \`{/name}\`. Section
  body is rendered once per array item; inside the section, scalar
  placeholders refer to the item's fields. Outer scope scalars are also
  visible; on collision, item field wins. Use sections whenever the user's
  data is naturally a list — receipts, invoices, summaries, leaderboards,
  digest emails. Do not nest sections.
- For OPTIONAL content that should appear only when a placeholder is
  filled in (e.g. a logo image only if the sender has uploaded one),
  use the same section syntax as a "truthy guard" — the body renders
  once when the scalar is non-empty, and is skipped when empty:
    {#logoUrl}<img src="{logoUrl}" alt="{brand}" style="max-height:48px;display:block;margin:0 auto;" />{/logoUrl}
  For the OPPOSITE — content that should appear only when a placeholder
  is empty/missing — use the inverted section:
    {^logoUrl}<h1 style="margin:0;font-size:24px;font-weight:600;text-align:center;">{brand}</h1>{/^logoUrl}
  These two paired together give a "logo image OR brand text" header
  without any runtime branching at the application layer. Always emit
  BOTH branches when the email needs a sender header, so the same
  template is reusable by both image-equipped and text-only brands.
- The "subject" must be short (<=70 chars), in the same language as the
  body for that locale.
- The "name" is an internal label — short title-case ("Welcome", "Order
  confirmation"), localized.
- Match the example template's tone, structural rhythm and brand voice
  if one is given. If no example, default to a clean Stripe-style design:
  white background, system font stack, primary color #111111, button
  with rounded corners.
- Do not invent variables that aren't either present in the example
  template, the user's prompt, or obviously needed (userName/verifyUrl).`
}

export const mailComposeTask = defineTask<
  MailComposeInput,
  {
    name: Record<string, string>
    subject: Record<string, string>
    body: Record<string, string>
  }
>({
  name: "mail-compose",
  systemPrompt: buildSystemPrompt,
  // Locale-aware sıkı schema — model her locale için name/subject/body
  // değerini dönmek zorunda. Eksik ya da fazla locale ZodError fırlatır,
  // runAssistant retry'ı tetikler (önceki bozuk yanıtı düzeltmeye yollar).
  schema: (input) =>
    z.object({
      name: localizedRecord(input.locales),
      subject: localizedRecord(input.locales),
      body: localizedRecord(input.locales),
    }) as never,
  buildUserPrompt: (input) => {
    const parts: string[] = []
    parts.push(`Required locales: ${input.locales.join(", ")}`)
    if (input.brand) parts.push(`Brand / product name: ${input.brand}`)
    if (input.logoUrl !== undefined) {
      // Always emit the paired logo header — even when the caller
      // passed an empty string. The conditional sections render the
      // right branch at send-time depending on whether logoUrl ends
      // up populated for that sender.
      parts.push(
        `Header layout: include BOTH a {#logoUrl}<img src="{logoUrl}" .../>{/logoUrl} branch and a {^logoUrl}<h1>{brand}</h1>{/^logoUrl} fallback at the top of the body, so the same template works for senders with and without a logo.`,
      )
    }
    parts.push(`What the user wants this email to do:\n${input.subjectPrompt}`)
    if (input.notes) parts.push(`Additional instructions:\n${input.notes}`)
    if (input.exampleTemplate) {
      parts.push(
        `Example template to match in tone and structure (JSON):\n${JSON.stringify(input.exampleTemplate, null, 2)}`,
      )
    }
    parts.push(
      `Produce the email template now. Each locale field must be present and non-empty.`,
    )
    return parts.join("\n\n")
  },
})

/** UI / API caller convenience — runAssistant bağımlılığını gizler. */
export async function composeMailTemplate(input: MailComposeInput) {
  const { runAssistant } = await import("../assistant")
  if (input.locales.length === 0) {
    throw new Error("at least one locale is required")
  }
  // Schema artık locale-aware ve strict — eksik/fazla locale Gateway
  // tarafında reddedilir, runAssistant otomatik retry yapar. Burada
  // ek validation gerekli değil; return olduğu gibi dön.
  return await runAssistant({
    task: mailComposeTask,
    input,
    modelId: input.model,
  })
}

// localizedRecord re-export — başka task'lar da kullansın diye.
export { localizedRecord }

/**
 * Inbox category classifier — assigns one of five virtual category
 * buckets to each message based on its sender, subject, and preview.
 * Used by the dashboard's "Categories" sidebar (Promotions / Updates /
 * Receipts / Social / Primary) to give users a Gmail-style triage
 * without having to maintain server-side sieve rules.
 *
 * Design notes:
 * - Batch input (≤30 messages per call) keeps Gemini cost down: a 30-mail
 *   batch with subject + sender + 200-char preview lands around 4-6k
 *   input tokens, ~$0.0005 at gemini-2.0-flash pricing.
 * - Strict Zod schema makes the classifier composable with cache layers:
 *   the assistant retries once on schema fail, the caller can persist
 *   results without sanity-checking shapes.
 * - The "primary" bucket is the catch-all so the model never has to
 *   invent a category when nothing else fits.
 */

import { z } from "zod"
import { defineTask } from "../assistant"

export const MAIL_CATEGORIES = [
  "promotions",
  "updates",
  "receipts",
  "social",
  "primary",
] as const

export type MailCategory = (typeof MAIL_CATEGORIES)[number]

export interface MailClassifyMessage {
  /** IMAP UID, used as the join key when the result is persisted. */
  uid: string
  subject: string
  fromName?: string | null
  fromAddress: string
  /** First few lines of the body — Gemini reads this to disambiguate
   *  edge cases (e.g. "Order confirmation" subject can be a receipt or a
   *  shipping update; the preview tells you which). Capped to 240 chars
   *  client-side to control token spend. */
  preview?: string | null
  /** Optional `List-Unsubscribe` header — its presence is a strong
   *  signal that the message is bulk (promotions/updates), so we hint
   *  this to the model. */
  hasListUnsubscribe?: boolean
}

export interface MailClassifyInput {
  messages: MailClassifyMessage[]
}

export interface MailClassifyOutput {
  classifications: Array<{
    uid: string
    category: MailCategory
  }>
}

const SYSTEM_PROMPT = `You are an email triage classifier. For each input message, assign exactly one of these categories:

- promotions: marketing offers, discounts, sales, product announcements, advertising newsletters
- updates: transactional notifications, account/security alerts, system updates, informational newsletters, password resets, sign-in alerts
- receipts: order confirmations, invoices, payment receipts, shipping notifications, refund confirmations
- social: social network notifications, friend requests, replies, mentions, follower alerts, community digests
- primary: personal correspondence, B2B conversations, anything that doesn't clearly fit the other four buckets

Rules:
- Output one classification per input UID — no more, no less.
- "hasListUnsubscribe: true" means the sender is bulk; lean toward promotions/updates/social over primary.
- Use the preview to disambiguate ambiguous subjects.
- Default to "primary" only when no other bucket fits.`

const schema = z.object({
  classifications: z
    .array(
      z.object({
        uid: z.string().min(1),
        category: z.enum(MAIL_CATEGORIES),
      }),
    )
    .min(1),
})

function buildUserPrompt(input: MailClassifyInput): string {
  const lines = input.messages.map((m, i) => {
    const sender = m.fromName
      ? `${m.fromName} <${m.fromAddress}>`
      : m.fromAddress
    const previewPart = m.preview
      ? `\n   Preview: ${m.preview.replace(/\s+/g, " ").slice(0, 240)}`
      : ""
    const bulkPart = m.hasListUnsubscribe ? " [hasListUnsubscribe: true]" : ""
    return `${i + 1}. UID: ${m.uid}${bulkPart}
   From: ${sender}
   Subject: ${m.subject || "(no subject)"}${previewPart}`
  })
  return `Classify these ${input.messages.length} messages. Return one classification per UID.

${lines.join("\n\n")}`
}

export const mailClassifyTask = defineTask<MailClassifyInput, MailClassifyOutput>({
  name: "mail-classify",
  systemPrompt: SYSTEM_PROMPT,
  schema,
  buildUserPrompt,
})

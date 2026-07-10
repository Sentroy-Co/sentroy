/**
 * Inbox AI assistant task'ları — gelen bir mail mesajının üzerinde
 * kullanıcıya hızlı yardımlar sunan üç ayrı task:
 *
 *   - `translateMessageTask`  →  body+subject'i hedef dile çevir
 *   - `summarizeMessageTask`  →  3-5 madde + tek-cümle TL;DR + action items
 *   - `replyDraftTask`        →  bağlama uygun cevap taslağı (HTML)
 *
 * Hepsi tek bir `runMailAssistant({ kind, input })` ile koşulur — UI
 * tek API endpoint'inden hepsini çağırır, kind switch'i ile task seçilir.
 */

import { z } from "zod"
import { defineTask, runAssistant } from "../assistant"

// ── Translate ───────────────────────────────────────────────────────────

export interface TranslateMessageInput {
  /** Orijinal mesajın subject'i. */
  subject: string
  /** Orijinal mesajın HTML body'si — model HTML'i koruyarak çevirir. */
  bodyHtml: string
  /** ISO dil kodu (örn "tr", "en", "de"). */
  targetLang: string
  /** Override Vercel AI Gateway model id'si. */
  model?: string
}

export const translateMessageTask = defineTask<
  TranslateMessageInput,
  { subject: string; bodyHtml: string; detectedSourceLang: string }
>({
  name: "mail-translate",
  systemPrompt: (input) => `You are a precise email translator.
Translate the email subject and HTML body into ${input.targetLang}.

Rules:
- Preserve the HTML structure exactly: keep all tags, attributes, inline
  styles, links and images. Only translate visible text content.
- Do not translate placeholders like {userName}, {verifyUrl}, or
  Mustache sections {#items}...{/items} — leave them verbatim.
- Do not translate URLs, email addresses, brand names, or proper nouns
  unless they have a well-known translated form.
- Detect the source language (ISO 639-1 code) and report it.
- If the source already matches the target, still return the original
  text unchanged but report the detected language honestly.`,
  schema: z.object({
    subject: z.string().min(1),
    bodyHtml: z.string().min(1),
    detectedSourceLang: z.string().min(2).max(10),
  }),
  buildUserPrompt: (input) =>
    [
      `Target language: ${input.targetLang}`,
      `Subject:\n${input.subject}`,
      `Body (HTML):\n${input.bodyHtml}`,
    ].join("\n\n"),
})

// ── Summarize ───────────────────────────────────────────────────────────

export interface SummarizeMessageInput {
  subject: string
  /** Plain text body — caller HTML'i strip edebilir, daha hızlı. */
  bodyText: string
  /** Özetin döneceği dil (örn "tr", "en"). Default: "en". */
  outputLang?: string
  /** From / sender adı, model "gönderen X şunu istiyor" derken kullanır. */
  senderLabel?: string
  model?: string
}

export const summarizeMessageTask = defineTask<
  SummarizeMessageInput,
  {
    tldr: string
    keyPoints: string[]
    actionItems: string[]
    sentiment: "positive" | "neutral" | "negative" | "urgent"
  }
>({
  name: "mail-summarize",
  systemPrompt: (input) => {
    const lang = input.outputLang || "en"
    return `You are an executive assistant summarizing an inbox message.

Output language: ${lang}
Be concise and actionable. Format rules:
- "tldr": one short sentence capturing the message's core ask or info.
- "keyPoints": 2-5 bullets, each <= 15 words. Cover what matters.
- "actionItems": concrete tasks the recipient may need to do — empty
  array if the email is purely informational.
- "sentiment": pick exactly one of "positive" | "neutral" | "negative"
  | "urgent". "urgent" only when there is a real deadline or crisis tone.
Do NOT invent facts that aren't in the message.`
  },
  schema: z.object({
    tldr: z.string().min(1),
    keyPoints: z.array(z.string().min(1)).min(1).max(5),
    actionItems: z.array(z.string().min(1)).max(8),
    sentiment: z.enum(["positive", "neutral", "negative", "urgent"]),
  }),
  buildUserPrompt: (input) =>
    [
      input.senderLabel ? `Sender: ${input.senderLabel}` : null,
      `Subject:\n${input.subject}`,
      `Body:\n${input.bodyText}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
})

// ── Reply draft ─────────────────────────────────────────────────────────

export interface ReplyDraftInput {
  /** Orijinal mesajın subject'i. */
  originalSubject: string
  /** Orijinal mesajın metni (plain text tercih). */
  originalBody: string
  /** Cevabın hangi tonu yansıtması (örn "concise", "warm", "formal"). */
  tone: "concise" | "warm" | "formal" | "apologetic" | "decline"
  /** Kullanıcının özet niyeti — "tamam, perşembe görüşürüz" gibi. */
  intent: string
  /** Cevap dili (default: orijinal mesajla aynı). */
  outputLang?: string
  /** Kullanıcının adı (signature için). */
  senderName?: string
  model?: string
}

export const replyDraftTask = defineTask<
  ReplyDraftInput,
  { subject: string; bodyHtml: string }
>({
  name: "mail-reply-draft",
  systemPrompt: (input) => {
    const langLine = input.outputLang
      ? `Reply in ${input.outputLang}.`
      : `Reply in the same language as the original message.`
    return `You are drafting an email reply on behalf of the user.

${langLine}
Tone: ${input.tone}
Style rules:
- "concise": 2-4 sentences, direct, no fluff.
- "warm": friendly opener, sincere body, personal close.
- "formal": polite formal greeting, structured paragraphs, formal close.
- "apologetic": acknowledge the issue, take responsibility, propose fix.
- "decline": polite refusal, brief reason, leave the door open.
Body must be valid HTML — wrap paragraphs in <p>, use <br> for line
breaks. NO <script>, NO external CSS. Keep it under 200 words.
Subject: prefix the original subject with "Re: " unless it already starts
with "Re:" (case-insensitive). Same language as the body.
Sign with the user's name if provided. Do NOT invent meeting times,
prices, or commitments not present in the user's intent.`
  },
  schema: z.object({
    subject: z.string().min(1),
    bodyHtml: z.string().min(1),
  }),
  buildUserPrompt: (input) =>
    [
      `Original subject: ${input.originalSubject}`,
      `Original message:\n${input.originalBody}`,
      `User's intent for the reply: ${input.intent}`,
      input.senderName ? `User's name (for signature): ${input.senderName}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
})

// ── Compose from prompt ────────────────────────────────────────────────

export interface ComposeFromPromptInput {
  /** Kullanıcının mailin amacını / içeriğini doğal dilde anlatımı. */
  prompt: string
  /** Çıktı dili. Default: "en". */
  outputLang?: string
  /** Mail tonu — reply ile aynı katalog. */
  tone?: "concise" | "warm" | "formal" | "apologetic" | "decline" | "marketing"
  /** Gönderen ad (signature için). */
  senderName?: string
  /** Alıcı bilgisi varsa açış cümlesi için ipucu (örn "Ahmet"). */
  recipientHint?: string
  model?: string
}

export const composeFromPromptTask = defineTask<
  ComposeFromPromptInput,
  { subject: string; bodyHtml: string }
>({
  name: "mail-compose-from-prompt",
  systemPrompt: (input) => {
    const lang = input.outputLang || "en"
    const tone = input.tone || "concise"
    return `You draft a brand-new email on the user's behalf.

Output language: ${lang}
Tone: ${tone}

Rules:
- Subject: short (<=70 chars), in ${lang}, descriptive of the body.
- Body: valid HTML — wrap paragraphs in <p>, use <br> for line breaks.
  NO <script>, NO external CSS, NO classes, only inline styles when
  truly needed. Keep it focused — under 200 words unless the prompt
  asks for more.
- For "marketing" tone use a clear call-to-action and a friendly hook.
- Sign with the user's name if provided. Do NOT invent meeting times,
  prices, links or commitments not present in the prompt.
- If the prompt is vague, expand it sensibly without inventing facts.`
  },
  schema: z.object({
    subject: z.string().min(1),
    bodyHtml: z.string().min(1),
  }),
  buildUserPrompt: (input) =>
    [
      `User's prompt:\n${input.prompt}`,
      input.recipientHint ? `Recipient: ${input.recipientHint}` : null,
      input.senderName ? `Sender's name (for signature): ${input.senderName}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
})

// ── Enhance / rewrite existing body ────────────────────────────────────

export interface EnhanceComposeInput {
  /** Mevcut HTML/plain body. */
  bodyHtml: string
  /** Subject — model tone consistency için referans. */
  subject?: string
  /** Hangi dilde olsun (default: orijinal dilde tut). */
  outputLang?: string
  /** İsteğe bağlı user direktifi: "daha kısa", "daha samimi" gibi. */
  notes?: string
  model?: string
}

export const enhanceComposeTask = defineTask<
  EnhanceComposeInput,
  { bodyHtml: string }
>({
  name: "mail-enhance",
  systemPrompt: (input) => {
    const lang = input.outputLang
      ? `Output language: ${input.outputLang}.`
      : `Keep the original language.`
    return `You polish and improve a draft email body. Goals: clearer
sentences, better paragraph flow, fewer filler words, correct
grammar and punctuation.

${lang}
Rules:
- Preserve the user's intent and tone — do NOT change the meaning.
- Output valid HTML — wrap paragraphs in <p>, use <br> for line
  breaks. Do not add <script> or external CSS.
- Do not invent facts, names, prices, links or commitments.
- Keep length similar unless the user explicitly asks otherwise in
  notes (shorter / longer).`
  },
  schema: z.object({
    bodyHtml: z.string().min(1),
  }),
  buildUserPrompt: (input) =>
    [
      input.subject ? `Subject (for context): ${input.subject}` : null,
      input.notes ? `User direction:\n${input.notes}` : null,
      `Current body:\n${input.bodyHtml}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
})

// ── Change tone ────────────────────────────────────────────────────────

export type ComposeTone =
  | "concise"
  | "warm"
  | "formal"
  | "apologetic"
  | "decline"
  | "casual"
  | "marketing"

export interface ChangeComposeToneInput {
  bodyHtml: string
  subject?: string
  /** Hedef ton. */
  tone: ComposeTone
  outputLang?: string
  model?: string
}

export const changeComposeToneTask = defineTask<
  ChangeComposeToneInput,
  { bodyHtml: string }
>({
  name: "mail-change-tone",
  systemPrompt: (input) => {
    const lang = input.outputLang
      ? `Output language: ${input.outputLang}.`
      : `Keep the original language.`
    return `You rewrite an email body to match a target tone while
preserving the underlying meaning and facts.

${lang}
Target tone: ${input.tone}
Tone style guide:
- "concise": direct, 2-4 sentences.
- "warm": friendly opener, sincere body, personal close.
- "formal": polite formal greeting, structured paragraphs, formal close.
- "casual": informal everyday language, contractions ok.
- "apologetic": acknowledge issue, take responsibility, propose fix.
- "decline": polite refusal, brief reason, leave door open.
- "marketing": clear CTA, friendly hook, benefit-focused copy.

Rules:
- Output valid HTML — <p>, <br>. No <script>, no external CSS.
- Do not invent facts, prices, dates, links or commitments.
- Keep the user's underlying message intact.`
  },
  schema: z.object({
    bodyHtml: z.string().min(1),
  }),
  buildUserPrompt: (input) =>
    [
      input.subject ? `Subject (for context): ${input.subject}` : null,
      `Current body:\n${input.bodyHtml}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
})

// ── Unified runner ─────────────────────────────────────────────────────

export type MailAssistantKind =
  | "translate"
  | "summarize"
  | "reply"
  | "compose"
  | "enhance"
  | "change-tone"

export type MailAssistantInput =
  | { kind: "translate"; input: TranslateMessageInput }
  | { kind: "summarize"; input: SummarizeMessageInput }
  | { kind: "reply"; input: ReplyDraftInput }
  | { kind: "compose"; input: ComposeFromPromptInput }
  | { kind: "enhance"; input: EnhanceComposeInput }
  | { kind: "change-tone"; input: ChangeComposeToneInput }

export async function runMailAssistant(args: MailAssistantInput) {
  switch (args.kind) {
    case "translate":
      return await runAssistant({
        task: translateMessageTask,
        input: args.input,
        modelId: args.input.model,
      })
    case "summarize":
      return await runAssistant({
        task: summarizeMessageTask,
        input: args.input,
        modelId: args.input.model,
      })
    case "reply":
      return await runAssistant({
        task: replyDraftTask,
        input: args.input,
        modelId: args.input.model,
      })
    case "compose":
      return await runAssistant({
        task: composeFromPromptTask,
        input: args.input,
        modelId: args.input.model,
      })
    case "enhance":
      return await runAssistant({
        task: enhanceComposeTask,
        input: args.input,
        modelId: args.input.model,
      })
    case "change-tone":
      return await runAssistant({
        task: changeComposeToneTask,
        input: args.input,
        modelId: args.input.model,
      })
  }
}

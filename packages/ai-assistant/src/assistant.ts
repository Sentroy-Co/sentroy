/**
 * Generic AI assistant runner — Vercel AI SDK + Google Gemini.
 *
 * Tek giriş noktası: `runAssistant({ task, input })`.
 *
 * Özellikleri:
 *   1. Task tabanlı sözleşme — her use case (mail compose, summarize, vb.)
 *      `defineTask({ systemPrompt, schema, model? })` ile ayrı dosyada
 *      tanımlanır; bu dosya runtime'da o task'ı load edip çalıştırır.
 *   2. Schema validation — Gemini'nin döndürdüğü output Zod schema ile
 *      doğrulanır. Geçersizse otomatik retry: önceki yanıt hata mesajıyla
 *      birlikte tekrar prompt'a koyulup düzeltilmesi istenir (max
 *      `maxAttempts` defa).
 *   3. Multilingual safe — schema LocalizedString gerektirebilir; Gemini
 *      bu yapıyı doğal olarak üretir.
 *
 * Env: `AI_GATEWAY_API_KEY` set edilmeli (server-side). Vercel AI Gateway
 * tek anahtarla provider'lar arası routing yapar — model identifier
 * formatı `provider/model` (örn `google/gemini-2.0-flash`).
 *
 * Bkz: README.md
 */

import { generateObject, createGateway, type LanguageModel } from "ai"
import type { ZodSchema, z } from "zod"
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"

/**
 * Vercel AI Gateway — tek API key ile birden fazla provider'a (Google,
 * OpenAI, Anthropic vb.) erişim, billing tek noktada. Default model
 * identifier formatı `provider/model-name` (örn `google/gemini-2.0-flash`).
 *
 * Lazy init — ilk runAssistant çağrısında env okunur. Env eksikse
 * runAssistant `AssistantError("missing-api-key")` fırlatır. Key kaynağı:
 * önce vault (`AI_GATEWAY_API_KEY`), yoksa `process.env`. Cache process
 * yaşam süresinde geçerli — key rotate edilirse restart ya da webhook
 * cache invalidation + module-level cache temizleme gerekir.
 */
let _gateway: ReturnType<typeof createGateway> | null = null
async function getGateway() {
  if (_gateway) return _gateway
  const apiKey = await getEnvWithFallback("AI_GATEWAY_API_KEY")
  if (!apiKey) return null
  _gateway = createGateway({ apiKey })
  return _gateway
}

export interface AssistantTask<TInput, TOutput> {
  /** UI'da debug log için. */
  name: string
  /** Sistemin nasıl davranması gerektiğini anlatan prompt. Static string
   *  veya input'a göre özelleştirilebilen bir factory. Schema runtime'da
   *  daraltıldıysa (locales gibi) prompt'u da daraltmak için factory tercih
   *  edilir — model "şu key'leri üret" diye doğrudan görür. */
  systemPrompt: string | ((input: TInput) => string)
  /** Zod schema — model output'u bu yapıya uymalı. Static schema veya
   *  input'a göre üretilen factory; factory pattern locale-aware /
   *  permission-aware schema'lar için (örn requested locales tam olarak
   *  required keys olarak işaretlenir → Gemini eksik dönerse generateObject
   *  fail eder ve runAssistant otomatik retry'ı tetikler). */
  schema: ZodSchema<TOutput> | ((input: TInput) => ZodSchema<TOutput>)
  /** Input → user prompt string'e dönüştürür. Plain text döndür;
   *  istersen JSON.stringify ile structure de gönder. */
  buildUserPrompt: (input: TInput) => string
  /** Default: AI Gateway üzerinden `google/gemini-2.0-flash`. Override
   *  için bir LanguageModel instance geç (örn `gateway("google/gemini-2.5-pro")`
   *  veya farklı provider). */
  model?: LanguageModel
  /** Default: 2. İlk fail sonrası 1 retry — geçersiz schema sonsuz
   *  döngüye gitmesin. */
  maxAttempts?: number
}

/** Helper: task tanımı için type-safe constructor. Inference için. */
export function defineTask<TInput, TOutput>(
  task: AssistantTask<TInput, TOutput>,
): AssistantTask<TInput, TOutput> {
  return task
}

const DEFAULT_MODEL_ID = "google/gemini-2.0-flash"
const DEFAULT_MAX_ATTEMPTS = 2

export { DEFAULT_MODEL_ID }

/**
 * Vercel AI Gateway'den tüm provider'lar arası model katalogu çek.
 * `gateway.getAvailableModels()` orijinal Tools-of-Trade gibi tüm
 * modelleri (language/embedding/image) döner. Caller filter eder.
 *
 * Throws `AssistantError("missing-api-key")` if env eksikse.
 */
export async function listAvailableModels() {
  const gateway = await getGateway()
  if (!gateway) {
    throw new AssistantError(
      "AI_GATEWAY_API_KEY is not configured",
      "missing-api-key",
    )
  }
  return await gateway.getAvailableModels()
}

export interface RunAssistantResult<TOutput> {
  output: TOutput
  attempts: number
  /** Debug: model + token usage. */
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

/**
 * Bir task'ı verilen input ile çalıştırır.
 *
 * @throws { AssistantError } şu durumlarda:
 *   - AI_GATEWAY_API_KEY env eksik
 *   - Tüm denemelerde schema validation fail
 *   - Provider hatası (rate limit, network)
 */
export async function runAssistant<TInput, TOutput>(args: {
  task: AssistantTask<TInput, TOutput>
  input: TInput
  /** Runtime model override — task.model'i ezer. Caller (API route)
   *  request body'den gelen model id'yi (örn "anthropic/claude-sonnet-4-6")
   *  burada geçirir. Tanımsızsa task.model, o da yoksa default fallback. */
  modelId?: string
}): Promise<RunAssistantResult<TOutput>> {
  const gateway = await getGateway()
  if (!gateway) {
    throw new AssistantError(
      "AI_GATEWAY_API_KEY is not configured",
      "missing-api-key",
    )
  }

  const { task, input, modelId } = args
  // Precedence: runtime modelId > task.model > default
  const model: LanguageModel = modelId
    ? gateway(modelId)
    : task.model ?? gateway(DEFAULT_MODEL_ID)
  const maxAttempts = task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const userPrompt = task.buildUserPrompt(input)
  // Schema + systemPrompt factory desteği — input'a göre daraltılmış
  // schema (örn locale-aware) ve aynı şekilde özelleştirilmiş prompt.
  const resolvedSchema =
    typeof task.schema === "function"
      ? (task.schema as (i: TInput) => ZodSchema<TOutput>)(input)
      : task.schema
  const resolvedSystem =
    typeof task.systemPrompt === "function"
      ? task.systemPrompt(input)
      : task.systemPrompt

  let lastError: unknown = null
  let lastBadOutput: string | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Retry'de previous bad output'u prompt'a sok ki model neyin
      // yanlış olduğunu anlasın ve düzeltsin.
      const promptWithRetry = lastBadOutput
        ? `${userPrompt}\n\n---\nPrevious attempt produced this output, which failed validation. Fix it and retry:\n${lastBadOutput}`
        : userPrompt

      const result = await generateObject({
        model,
        system: resolvedSystem,
        prompt: promptWithRetry,
        schema: resolvedSchema as z.ZodType,
      })

      // generateObject zaten schema'yı validate eder; başarılıysa burası
      // type-safe.
      return {
        output: result.object as TOutput,
        attempts: attempt,
        usage: result.usage
          ? {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              totalTokens: result.usage.totalTokens,
            }
          : undefined,
      }
    } catch (err) {
      lastError = err
      // Schema validation hatası → bir sonraki attempt'te düzeltmesi için
      // raw output'u prompt'a koy. AI SDK 5'te bu tür hatalar farklı
      // class'lar altında gelir: NoObjectGeneratedError (model invalid
      // JSON), TypeValidationError (Zod parse fail), AI_TypeValidationError
      // alias'ları. Hepsinde `.text` veya `.cause.text` raw output tutar.
      const e = err as {
        name?: string
        text?: string
        cause?: { text?: string; message?: string }
        message?: string
      }
      const validationName =
        e.name === "NoObjectGeneratedError" ||
        e.name === "AI_NoObjectGeneratedError" ||
        e.name === "TypeValidationError" ||
        e.name === "AI_TypeValidationError"
      const looksLikeValidation =
        validationName ||
        /schema|valid|object/i.test(e.message ?? "") &&
          attempt < maxAttempts
      if (looksLikeValidation && attempt < maxAttempts) {
        lastBadOutput = e.text || e.cause?.text || e.cause?.message || e.message || null
        continue
      }
      // Diğer error'lar retry edilmez — direkt dışarı.
      throw new AssistantError(
        err instanceof Error ? err.message : String(err),
        "provider-error",
        err,
      )
    }
  }

  throw new AssistantError(
    `Schema validation failed after ${maxAttempts} attempts`,
    "schema-validation",
    lastError,
  )
}

export class AssistantError extends Error {
  constructor(
    message: string,
    public code:
      | "missing-api-key"
      | "schema-validation"
      | "provider-error",
    public cause?: unknown,
  ) {
    super(message)
    this.name = "AssistantError"
  }
}

export { createGateway }

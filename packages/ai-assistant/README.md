# @workspace/ai-assistant

Vercel AI SDK + Vercel AI Gateway ile structured-output assistant runner.
Tek API key ile birden fazla provider (Google, OpenAI, Anthropic, …)
arası routing; default model `google/gemini-2.0-flash`. Bir "task"
tanımlarsın (system prompt + Zod schema + input → user prompt), runtime
task'ı çalıştırıp typed output döner. Schema validation fail ederse
otomatik retry.

## Kurulum

Server-side env (`.env.local`, Coolify secret, vb.):

```
AI_GATEWAY_API_KEY=vck_...
```

Vercel Gateway dashboard'undan key üretip yapıştır. Direkt provider
key'leri (Google'ın `GOOGLE_GENERATIVE_AI_API_KEY` gibi) artık
desteklenmiyor — tek anahtar üzerinden routing.

API key olmadan `runAssistant` `AssistantError("missing-api-key")` fırlatır.

## Kullanım — yeni bir task ekle

1. `src/tasks/<task-name>.ts` dosyası aç:

```ts
import { z } from "zod"
import { defineTask, runAssistant } from "@workspace/ai-assistant/assistant"

interface SummarizeInput { text: string; maxBullets: number }

const summarizeTask = defineTask<SummarizeInput, { bullets: string[] }>({
  name: "summarize",
  systemPrompt: `You write tight bullet summaries. Each bullet ≤ 12 words.`,
  schema: z.object({
    bullets: z.array(z.string().min(1)).min(1),
  }),
  buildUserPrompt: (input) =>
    `Summarize in at most ${input.maxBullets} bullets:\n\n${input.text}`,
})

export async function summarize(input: SummarizeInput) {
  return runAssistant({ task: summarizeTask, input })
}
```

2. Server-side route'tan çağır:

```ts
import { summarize } from "@workspace/ai-assistant/tasks/summarize"

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  const { output } = await summarize({ text, maxBullets: 5 })
  return Response.json({ bullets: output.bullets })
}
```

## Ne sağlar

- **Schema doğrulama** — `generateObject` Zod ile output'u parse eder.
  Geçersiz sonuç `NoObjectGeneratedError` fırlatır → wrapper bir sonraki
  attempt'te önceki bozuk yanıtı prompt'a koyar ki model kendi hatasını
  görüp düzeltsin.
- **Retry sayacı** — default 2 (1 retry). Task tarafında `maxAttempts`
  ile özelleştir. Provider error'ları (rate limit, network) retry edilmez
  → direkt yukarı.
- **Çok dilli output** — schema'da `Record<string, string>` kullanırsan
  Gemini her locale için değer üretir. `composeMailTemplate` örnek; locale
  listesini kontrol et, eksik dile fail-fast (server-side).
- **Model override** — gateway her provider'ı `provider/model` formatıyla
  açar. Task içinde `model: gateway("openai/gpt-4o-mini")` veya
  `gateway("google/gemini-2.5-pro")` ile değiştir. Default
  `google/gemini-2.0-flash` (hız + maliyet).

## Edge case'ler ve doğru kullanım

- **Stream gerekirse** bu paket henüz desteklemiyor — `generateObject`
  one-shot. UI'da loading indicator göster.
- **Long input** — Gemini 1M context, ama prompt ne kadar büyürse
  hallucination riski o kadar artar. `exampleTemplate` gibi referansları
  trimmed gönder (örn HTML'i 8KB'a sıkıştır).
- **Sensitive data** — API'ye gönderilen her şey Google'a gider. Kullanıcı
  PII'sını (gerçek email, telefon) içeren payload göndermeden önce mask
  et.
- **Locale schema** — `tasks/mail-compose.ts`'de `z.record(z.string(),
  z.string())` kullandık çünkü schema oluşturma factory pattern'i
  defineTask ile uyumlu değil. Eksik locale check'ini caller'da yapıyoruz.
  Yeni task'larda aynı yaklaşım: schema esnek, validation tight in caller.

## Task kataloğu (mevcut)

- **mail-compose** — kullanıcının subject prompt'una + opsiyonel örnek
  template'e bakarak çok dilli mail template üretir. Sentroy mail
  app'inde "AI generate" butonunda kullanılıyor.

## Yeni task eklerken checklist

- [ ] `src/tasks/<name>.ts` oluştur (`defineTask` + convenience wrapper)
- [ ] System prompt: rolünü açıkla + format kurallarını numaralı listele +
      "no exceptions" cümlesi koy. Gemini disiplinli prompt'a iyi cevap
      veriyor.
- [ ] Schema: minimum / max constraint'leri Zod'da yaz (örn `min(1)`).
- [ ] Server-only kullan — client-side import etme; API key leak
      olmasın.
- [ ] Audit-log et (eğer kullanıcı eylemiyse) — `audit({ action:
      "ai.compose-mail", details: { tokens: result.usage?.totalTokens } })`.

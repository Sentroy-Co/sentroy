"use client"

/**
 * Bot tuzağı — kullanıcıya görünmez ama DOM'a render edilen input.
 * İnsan etkileşimi yok (off-screen + tabindex=-1 + aria-hidden + autocomplete
 * kapalı), fakat naive form-fill bot'lar (CAPTCHA bypass etmeden submit
 * eden script'ler) görünen tüm input'ları doldurma eğiliminde olur ve bu
 * field'a değer yazar.
 *
 * Submit handler'ında `isHoneypotFilled(formData, name)` ile kontrol edip
 * dolu ise akışı bypass et — fake-success cevabı dön (silently fail), bot
 * ne olduğunu anlamasın.
 *
 * Field name'i jenerik tutuyoruz (`website`); bot detection araçları
 * "honeypot", "bot", "spam" gibi belirgin name'leri yakalar ve atlar.
 */
const DEFAULT_NAME = "website"

export function Honeypot({ name = DEFAULT_NAME }: { name?: string }) {
  return (
    <div
      aria-hidden="true"
      className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden"
    >
      <label>
        Do not fill this in if you&apos;re human
        <input
          type="text"
          name={name}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </label>
    </div>
  )
}

/**
 * Submit handler'ında kullan: `if (isHoneypotFilled(formData)) return`
 *
 * Bot honeypot'a değer yazdıysa tespit eder. Cevabı user-agent'a "fake
 * success" gibi vermek bot'un retry'ını azaltır; UI tarafında kullanıcı
 * bu kod yoluna düşemez (alan görünmez, manuel doldurmaz).
 */
export function isHoneypotFilled(
  formData: FormData,
  name: string = DEFAULT_NAME,
): boolean {
  const v = formData.get(name)
  if (v === null) return false
  return typeof v === "string" && v.trim().length > 0
}

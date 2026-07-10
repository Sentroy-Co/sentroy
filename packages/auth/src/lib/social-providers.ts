/**
 * Desteklenen sosyal giriş sağlayıcıları.
 * Backend `lib/auth.ts`'de `socialProviders` altında yapılandırılmış olmalı;
 * env değişkenleri yoksa ilgili buton tıklandığında better-auth hata döner.
 *
 * Yeni provider eklemek için:
 *   1. `lib/auth.ts` içinde `socialProviders.<id>` bloğunu ekle
 *   2. Aşağıya metadata satırı ekle (id + label)
 *   3. `SocialProviderIcon` component'ine SVG logo ekle
 */

export interface SocialProviderMeta {
  /** better-auth `signIn.social({ provider })` ve `account.providerId` değeri. */
  id: "google" | "github" | "apple" | "microsoft"
  label: string
}

export const SOCIAL_PROVIDERS: SocialProviderMeta[] = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
]

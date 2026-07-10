/**
 * Polar.sh entegrasyon ayarları — sistem genelinde tek singleton doc
 * (`system_settings` key=`polar`). Admin panelden yönetilir.
 *
 * Sandbox ve production tamamen izole (ayrı token + ayrı webhook secret).
 * `activeMode` checkout/portal için hangi ortamın kullanılacağını belirler;
 * webhook ise gelen imzadan kendi ortamını çözer (her iki secret de
 * doğrulanmaya çalışılır), böylece sandbox testi prod aktifken de çalışır.
 *
 * Secret'lar AES-256-GCM ile şifreli saklanır (`*Cipher`); UI'da yalnız
 * `*Prefix` (ilk birkaç karakter) gösterilir, plaintext asla response'a
 * konmaz. Şifreleme route katmanında `env-vault-crypto` ile yapılır.
 */
export interface PolarSettings {
  enabled: boolean
  activeMode: "sandbox" | "production"
  sandboxAccessTokenCipher: string | null
  sandboxAccessTokenPrefix: string | null
  sandboxWebhookSecretCipher: string | null
  sandboxWebhookSecretPrefix: string | null
  productionAccessTokenCipher: string | null
  productionAccessTokenPrefix: string | null
  productionWebhookSecretCipher: string | null
  productionWebhookSecretPrefix: string | null
  updatedAt: Date
}

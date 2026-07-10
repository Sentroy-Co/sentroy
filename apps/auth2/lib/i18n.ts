/**
 * Auth2 lightweight i18n — no URL `[lang]` segment, no next-intl plumbing.
 *
 * OAuth provider'ın endpoint'leri RP tarafından sabit URL'lerle çağrılır
 * (sentroy.com'da olduğu gibi `/[lang]/...` route'lanamaz). Locale runtime'da
 * Accept-Language header'ından detect edilir; user-visible string'ler bu
 * dictionary'den çekilir.
 *
 * Genişletme: yeni anahtar eklerken her iki dile de gir; `t()` fallback
 * eksik anahtar için en'e döner, prod'da kırılma yok ama uyarı log'lar.
 */

export type Locale = "en" | "tr"

const SUPPORTED: ReadonlySet<Locale> = new Set(["en", "tr"])

/**
 * Accept-Language header'ından desteklenen ilk locale'i seç.
 * Format: `tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7`
 * Eğer hiçbiri tanınmıyorsa default `en`.
 */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return "en"
  const parts = acceptLanguage.split(",")
  for (const part of parts) {
    const tag = (part.split(";")[0] ?? "").trim().toLowerCase()
    if (!tag) continue
    // Try exact match (tr) then base (tr-TR → tr)
    if (SUPPORTED.has(tag as Locale)) return tag as Locale
    const base = tag.split("-")[0]
    if (base && SUPPORTED.has(base as Locale)) return base as Locale
  }
  return "en"
}

type Messages = Record<string, string>

const MESSAGES: Record<Locale, Messages> = {
  en: {
    // ── consent page ─────────────────────────────────────────────────
    "consent.invalidTitle": "Invalid consent request",
    "consent.invalidBody":
      "Required parameters are missing. Start over from the originating application.",
    "consent.unknownClientTitle": "Unknown application",
    "consent.unknownClientBody":
      "The application this request comes from is not registered or has been disabled.",
    "consent.invalidRedirectTitle": "Invalid redirect URI",
    "consent.invalidRedirectBody":
      "The provided redirect URI is not on the application's allow-list.",
    "consent.signInAs": "wants to sign in as",
    "consent.you": "you",
    "consent.intro": "This will let {name} —",
    "consent.allow": "Allow",
    "consent.deny": "Deny",
    "consent.afterChoice": "Redirecting to {host} after your choice.",
    "consent.scope.openid": "Sign you in (OIDC subject id)",
    "consent.scope.profile": "Read your name and profile picture",
    "consent.scope.email": "Read your email address",
    "consent.scope.offline_access":
      "Stay signed in even when you close the browser (refresh token issued)",
    // ── landing page ─────────────────────────────────────────────────
    "landing.badge": "OAuth 2.0 + OpenID Connect",
    "landing.title": "Sign in with Sentroy",
    "landing.lede":
      "Drop a \"Sign in with Sentroy\" button into your site and your users authenticate with their existing Sentroy account. Standard OAuth 2.0 authorization-code flow, OIDC-compliant id tokens, and a discovery document — works with anything that speaks the spec.",
    "landing.registerCta": "Register an app",
    "landing.docsCta": "Read the docs",
    "landing.card1Title": "Standard endpoints",
    "landing.card1Body":
      "Authorization, token, userinfo, and OIDC discovery — exactly where the spec says they should be. If your library knows OAuth, it knows Sentroy Auth.",
    "landing.card2Title": "Per-company app registry",
    "landing.card2Body":
      "Each Sentroy company can register multiple OAuth clients with their own redirect URIs and scope allow-lists. Manage them from your dashboard.",
    "landing.card3Title": "Cross-subdomain SSO",
    "landing.card3Body":
      "Users already logged into sentroy.com skip the login step — consent screen pops up directly. One Sentroy account, every relying party.",
    "landing.card4Title": "Bring your stack",
    "landing.card4Body":
      "Use any OAuth library on your side: NextAuth, Passport, Authlib, Spring Security, Keycloak Adapter. Discovery metadata makes setup a one-liner in most.",
    "landing.quickstartTitle": "Quickstart",
    "landing.footerTagline": "Sentroy Auth — OAuth 2.0 / OIDC provider",
    // ── nav / footer ─────────────────────────────────────────────────
    "nav.mail": "Mail",
    "nav.storage": "Storage",
    "nav.auth": "Auth",
    "nav.vault": "Vault",
    "nav.docs": "Docs",
    "footer.docs": "Docs",
    "footer.status": "Status",
    "footer.sentroy": "sentroy.com",
  },
  tr: {
    // ── consent page ─────────────────────────────────────────────────
    "consent.invalidTitle": "Geçersiz onay isteği",
    "consent.invalidBody":
      "Zorunlu parametreler eksik. Lütfen baştan başlayan uygulamadan tekrar deneyin.",
    "consent.unknownClientTitle": "Bilinmeyen uygulama",
    "consent.unknownClientBody":
      "Bu isteğin geldiği uygulama kayıtlı değil ya da devre dışı bırakılmış.",
    "consent.invalidRedirectTitle": "Geçersiz yönlendirme URL'i",
    "consent.invalidRedirectBody":
      "Verilen redirect URI uygulamanın izin listesinde değil.",
    "consent.signInAs": "şu kullanıcıyla giriş yapmak istiyor:",
    "consent.you": "siz",
    "consent.intro": "{name} uygulamasına şu izinleri vermiş olacaksınız —",
    "consent.allow": "İzin ver",
    "consent.deny": "Reddet",
    "consent.afterChoice": "Seçiminizden sonra {host} adresine yönlendirileceksiniz.",
    "consent.scope.openid": "Sizi giriş yapmaya (OIDC subject id)",
    "consent.scope.profile": "Adınızı ve profil resminizi okumaya",
    "consent.scope.email": "Email adresinizi okumaya",
    "consent.scope.offline_access":
      "Tarayıcıyı kapattığınızda bile oturumda kalmaya (refresh token üretilir)",
    // ── landing page ─────────────────────────────────────────────────
    "landing.badge": "OAuth 2.0 + OpenID Connect",
    "landing.title": "Sentroy ile Giriş Yap",
    "landing.lede":
      "Sitenize \"Sentroy ile giriş yap\" butonu ekleyin, kullanıcılarınız mevcut Sentroy hesabıyla giriş yapsın. Standart OAuth 2.0 authorization-code akışı, OIDC uyumlu id_token'lar ve bir discovery dokümanı — spec'i konuşan her şeyle çalışır.",
    "landing.registerCta": "Uygulama kayıt et",
    "landing.docsCta": "Dokümana git",
    "landing.card1Title": "Standart endpoint'ler",
    "landing.card1Body":
      "Authorization, token, userinfo ve OIDC discovery — spec'in olması gereken yerinde. OAuth bilen kütüphaneler Sentroy Auth'u da bilir.",
    "landing.card2Title": "Şirket başına app registry",
    "landing.card2Body":
      "Her Sentroy şirketi kendi redirect URI'larıyla ve scope allow-list'iyle birden fazla OAuth client kaydedebilir. Dashboard'dan yönetilir.",
    "landing.card3Title": "Cross-subdomain SSO",
    "landing.card3Body":
      "sentroy.com'da zaten giriş yapmış kullanıcılar login adımını atlar — direkt consent ekranı çıkar. Tek Sentroy hesabı, her relying party.",
    "landing.card4Title": "Kütüphaneni sen seç",
    "landing.card4Body":
      "Kendi tarafında istediğin OAuth kütüphanesini kullan: NextAuth, Passport, Authlib, Spring Security, Keycloak Adapter. Discovery metadata kurulumu çoğunda tek satıra indirir.",
    "landing.quickstartTitle": "Hızlı başlangıç",
    "landing.footerTagline": "Sentroy Auth — OAuth 2.0 / OIDC sağlayıcısı",
    // ── nav / footer ─────────────────────────────────────────────────
    "nav.mail": "Mail",
    "nav.storage": "Depolama",
    "nav.auth": "Auth",
    "nav.vault": "Vault",
    "nav.docs": "Dokümanlar",
    "footer.docs": "Dokümanlar",
    "footer.status": "Durum",
    "footer.sentroy": "sentroy.com",
  },
}

/**
 * Translation lookup with optional `{key}` interpolation.
 *   t("en", "consent.intro", { name: "Acme" }) → "This will let Acme —"
 * Eksik anahtar prod'da kırmaz; en fallback, ardından raw key döndürülür.
 */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = MESSAGES[locale] ?? MESSAGES.en
  let msg = dict[key] ?? MESSAGES.en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replaceAll(`{${k}}`, String(v))
    }
  }
  return msg
}

/** Helper: sayfa başlangıcında bir kez çağır → bound translator döner. */
export function makeTranslator(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) =>
    t(locale, key, vars)
}

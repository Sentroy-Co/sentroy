import { createAuthClient } from "better-auth/react"
import {
  twoFactorClient,
  magicLinkClient,
  emailOTPClient,
} from "better-auth/client/plugins"

// baseURL tanımlı değil → client relative URL kullanır → fetch mevcut
// origin'e gider. Core'da direkt own endpoint, mail/storage'da
// `next.config.ts rewrites()` `/api/auth/*` request'ini core'a forward
// eder. Cross-origin fetch yok → CORS preflight tetiklenmez.
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      // 2FA verification gerekiyorsa kullanıcıyı bu sayfaya yönlendir
      onTwoFactorRedirect() {
        if (typeof window !== "undefined") {
          window.location.href = "/two-factor"
        }
      },
    }),
    magicLinkClient(),
    emailOTPClient(),
  ],
})

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  linkSocial,
  twoFactor,
  emailOtp,
} = authClient

/**
 * better-auth `signOut()` çağırıp ardından kullanıcıyı **core uygulamasının
 * login sayfasına** yönlendirir. Sub-app'lerden (mail, storage, auth2,
 * status, studio) logout edildiğinde local `router.push("/${lang}/login")`
 * o uygulamada login route'u olmadığı için ya 404 verir ya da
 * proxy.ts callback URL'ini bozar. Bu helper cross-subdomain `.sentroy.com`
 * cookie zaten signOut tarafından temizlendiğinden, hard navigation ile
 * `${NEXT_PUBLIC_CORE_APP_URL}/${lang}/login`'a gider.
 *
 * Logout olduğu için callback URL geçmiyoruz — kullanıcı yeniden login
 * akışını manuel başlatmalı, eski sayfaya otomatik dönmemeli.
 */
export async function signOutAndRedirectToCore(lang: string = "en"): Promise<void> {
  try {
    await signOut()
  } catch {
    // Transport-level error (network down, abort vb.) → cookie temizlenmemiş
    // olabilir. Yine de redirect ediyoruz çünkü:
    //   - Cookie HttpOnly olduğu için JS'ten manuel temizlenemez (Domain=
    //     .sentroy.com cookie clearance sadece server Set-Cookie ile yapılır)
    //   - Kullanıcı "logout etti" UI feedback'i almalı; başarısızsa core'da
    //     /login'e geldiğinde session hâlâ aktifse better-auth orta katmanı
    //     onları dashboard'a geri yönlendirir → kullanıcı durumu fark eder
    //     ve yeniden dener (genelde retry işe yarar).
  }
  if (typeof window === "undefined") return
  const coreUrl =
    process.env.NEXT_PUBLIC_CORE_APP_URL || window.location.origin
  window.location.href = `${coreUrl}/${lang}/login`
}

import type { MetadataRoute } from "next"

/**
 * PWA web app manifest (/manifest.webmanifest). Next, `app/manifest.ts`
 * konvansiyonuyla dosyayı üretir ve `<link rel="manifest">`'i head'e otomatik
 * enjekte eder. `display: standalone` → Sentroy OS masaüstü uygulaması gibi
 * (tarayıcı chrome'u olmadan) açılır. İkonlar 912px kaynaktan üretildi
 * (icon-192/512); installability 192+512 ister.
 */
export default function manifest(): MetadataRoute.Manifest {
  // NEXT_PUBLIC_PWA_ENABLED=false → `display: browser` = installable DEĞİL
  // (tarayıcı "uygulama olarak yükle" tamamen kapanır, her platformda).
  // Varsayılan (installable): masaüstünde install beforeinstallprompt ile
  // bastırılıp kullanıcı native uygulamaya yönlendirilir; mobilde PWA açık
  // kalır (telefona "app gibi" yüklenir). Bkz. use-app-install + get-app-popup.
  const installable = process.env.NEXT_PUBLIC_PWA_ENABLED !== "false"
  return {
    name: "Sentroy",
    short_name: "Sentroy",
    description: "Sentroy — email, storage, auth and your apps in one workspace.",
    start_url: "/",
    scope: "/",
    display: installable ? "standalone" : "browser",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    orientation: "any",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}

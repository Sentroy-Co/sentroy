import { LinkSquare02Icon } from "@hugeicons/core-free-icons"
import type { AppDescriptor } from "@workspace/console/components/layout/app-launcher"
import {
  clientRootDomain,
  trustedOriginRegex,
} from "@workspace/auth/lib/domains"

/**
 * `sentroy-os:open` postMessage'ını gönderebilecek güvenilir origin'ler —
 * `*.<root>` (cross-subdomain) + localhost (dev). OS, yalnız bu origin'lerden
 * gelen "şu URL'i pencerede aç" mesajlarına uyar. Kök domain client env'inden
 * (NEXT_PUBLIC_ROOT_DOMAIN, default sentroy.com — mevcut davranış aynı).
 */
const TRUSTED = trustedOriginRegex(clientRootDomain())
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

export function isTrustedOsOrigin(origin: string): boolean {
  return TRUSTED.test(origin) || LOCAL.test(origin)
}

/**
 * Dahili bir profil/post URL'i için OS pencere descriptor'ı. Stable id
 * (`osopen:<url>`) → aynı linke tekrar tıklayınca mevcut pencere öne gelir.
 * window-frame plain-iframe yolu href'e `?embed=1` ekler → embed köprüsü
 * iç içe önizlemede de çalışır.
 */
export function osOpenDescriptor(url: string, title: string): AppDescriptor {
  return {
    id: `osopen:${url}`,
    name: title || "Sentroy",
    description: "",
    cta: "",
    icon: LinkSquare02Icon,
    color: "#0a84ff",
    href: url,
  }
}

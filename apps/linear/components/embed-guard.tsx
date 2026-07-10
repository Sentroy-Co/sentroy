"use client"

import { useEffect } from "react"

/**
 * Sentroy OS embed guard. `@workspace/console` UIProviders zaten paint öncesi
 * inline bir script ile `<html data-embedded="1">` set ediyor; ancak React 19
 * hydration'ında (linear'da router-compat + ekstra provider'lar var) bu
 * attribute React render çıktısında olmadığı için bazı durumlarda sıfırlanıp
 * app sidebar'ı embed'de görünür kalabiliyor. Bu guard hydration SONRASI
 * effect'te attribute'u yeniden garantiler.
 *
 * `<html>` üstünde çalışır → router.refresh() (router-compat'ın mutasyon sonrası
 * çağrısı) document'ı yeniden yaratmadığı için attribute kalıcıdır (server
 * component tabanlı tespit refresh'te bozulurdu). Framed olmak (iframe) = embed;
 * `?embed=1` param'ı da desteklenir (doğrudan embed testleri için).
 */
export function EmbedGuard() {
  useEffect(() => {
    try {
      const framed = window.self !== window.top
      const hasParam = new URLSearchParams(window.location.search).has("embed")
      if (hasParam) sessionStorage.setItem("os-embed", "1")
      const sticky = sessionStorage.getItem("os-embed") === "1"
      if (framed || hasParam || sticky) {
        document.documentElement.dataset.embedded = "1"
      }
    } catch {
      // cross-origin erişim hatası = kesinlikle framed → embed
      try {
        document.documentElement.dataset.embedded = "1"
      } catch {
        /* no-op */
      }
    }
  }, [])
  return null
}

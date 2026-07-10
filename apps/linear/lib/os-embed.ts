"use client"

// Sentroy OS embed yardımcıları. OS, alt-app'leri AppSectionPanel içinde
// section başına AYRI iframe olarak açar. Bir section iframe'ini uygulama
// kendi içinden başka bir section'a navigate ederse (örn. "not connected" →
// ayarlar) o iframe strand olur ve OS geri getiremez (cross-origin). Bu yüzden
// section değişimini OS'a postMessage ile bildiririz; OS doğru tab'a geçer.

/** iframe içinde miyiz (OS embed) — client-only. */
export function isOsEmbedded(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.self !== window.top
  } catch {
    // cross-origin erişim hatası = kesinlikle framed
    return true
  }
}

/**
 * OS'a section mesajı yolla. Embed değilsek false döner (çağıran normal
 * navigasyona düşer). Seçenekler:
 *  - `reload`: OS o section iframe'ini tazeler (durum değişti).
 *  - `switch: false`: aktif section'ı değiştirme, yalnız arka planda tazele
 *    (ör. Linear yeni bağlandı → kullanıcı ayarlarda kalsın ama overview
 *    sessizce yenilensin ki Overview tab'ına dönünce güncel olsun).
 * Alıcı (AppSectionPanel) origin'i doğrular; targetOrigin "*" güvenli çünkü
 * mesaj hassas değil ve yalnız trusted OS listener'ı işler.
 */
export function osSwitchSection(
  slug: string,
  opts?: { reload?: boolean; switch?: boolean },
): boolean {
  if (!isOsEmbedded()) return false
  try {
    window.parent.postMessage(
      {
        type: "sentroy-os:section",
        slug,
        reload: opts?.reload ?? false,
        switch: opts?.switch ?? true,
      },
      "*",
    )
    return true
  } catch {
    return false
  }
}

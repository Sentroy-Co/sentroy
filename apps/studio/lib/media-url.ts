"use client"

import { getLocalMediaRef } from "./local-files"

/**
 * Tek noktadan media URL çözümü — LOCAL-FIRST dosya soyutlaması.
 *
 * mediaId üç durumda olabilir:
 *   1. Sunucu mediaId'si            → CDN URL (`/f/{id}/original`)
 *   2. Aktif lokal dosya (`local-…`) → IndexedDB blob'unun objectURL'i
 *   3. Migrate edilmiş lokal id      → tombstone üzerinden CDN URL
 *
 * Ses motorları (Tone.js scheduleClip, WaveSurfer, decode) URL tüketir;
 * objectURL'ler fetch/decode ile birebir çalışır — motor tarafında
 * davranış değişikliği yoktur.
 */

export const MEDIA_URL_PREFIX =
  process.env.NEXT_PUBLIC_CDN_URL || "https://cdn.sentroy.com"

export function isLocalMediaId(mediaId: string): boolean {
  return mediaId.startsWith("local-")
}

export function cdnMediaUrl(mediaId: string): string {
  return `${MEDIA_URL_PREFIX}/f/${mediaId}/original`
}

export function mediaUrl(mediaId: string): string {
  if (isLocalMediaId(mediaId)) {
    const ref = getLocalMediaRef(mediaId)
    if (ref) return "url" in ref ? ref.url : cdnMediaUrl(ref.migratedTo)
    // Kayıt bulunamadı (başka cihaz / temizlenmiş depo) — CDN fallback'i
    // bilerek döndürülür; 404 eder ama URL üreten çağrı zinciri kırılmaz.
  }
  return cdnMediaUrl(mediaId)
}

/* Sentroy PWA service worker — minimal.
 *
 * Amaç: installability (Chrome/Android/desktop "Install" + standalone). Offline
 * cache YOK: içerik oturum-korumalı (better-auth); bayat/yanlış-auth shell
 * sunmamak için ağ pass-through. Bir fetch handler'ın VARLIĞI installability
 * kriterini karşılar. SW değişince eski sürümü hemen devral. */
self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", () => {
  // Pass-through — respondWith çağrılmaz, tarayıcı normal fetch eder.
})

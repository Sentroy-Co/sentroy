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

/* ── Web Push (yeni mail bildirimi) ────────────────────────────────────────
 * Kapalı sekme/uygulama için VAPID push. Payload core/lib/push.ts'ten gelir:
 * { title, body, url, tag }. Açık sekmeye zaten SSE ile canlı inbox gidiyor;
 * bu bildirim OS-seviye. Tıklama → mail uygulamasını aç/odakla. */
self.addEventListener("push", function (event) {
  var payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = {}
  }
  var title = payload.title || "Sentroy"
  var options = {
    body: payload.body || "",
    icon: "/sentroy_pwa.png",
    badge: "/favicon-48x48.png",
    data: { url: payload.url || "/" },
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (list) {
        for (var i = 0; i < list.length; i++) {
          var c = list[i]
          // Aynı origin'de açık bir pencere varsa onu odakla (yeni sekme açma).
          if (c.url.indexOf(url) !== -1 && "focus" in c) return c.focus()
        }
        if (self.clients.openWindow) return self.clients.openWindow(url)
        return undefined
      }),
  )
})

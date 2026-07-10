// Linear Lite Web Push service worker. Yalnız push bildirimi + tıklama için
// (offline/cache/PWA-install YOK — installable app istenmedi). Push payload'u:
// { title, body, url, tag }.
self.addEventListener("push", function (event) {
  var payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = {}
  }
  var title = payload.title || "Linear Lite"
  var options = {
    body: payload.body || "",
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
          if (c.url.indexOf(url) !== -1 && "focus" in c) return c.focus()
        }
        if (self.clients.openWindow) return self.clients.openWindow(url)
        return undefined
      }),
  )
})

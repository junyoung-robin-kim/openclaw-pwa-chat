const CACHE_NAME = "openclaw-chat-v3";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Skip API and WebSocket
  if (event.request.url.includes("/api/") || event.request.url.includes("/ws")) {
    return;
  }

  // Network-first: try network, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

// --- Push Notification ---

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "OpenClaw", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: payload.tag || "pwa-chat",
    renotify: true,
    data: { url: self.registration.scope },
  };

  event.waitUntil(self.registration.showNotification(payload.title || "🦞 JKLobster", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.startsWith(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new tab
      return self.clients.openWindow(url);
    }),
  );
});

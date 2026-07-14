/* Weekend Finder service worker: instant launch, offline fallback, push. */
const CACHE = "wf-v4";

self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // App shell + weekly content: network first, cached copy when offline.
  const isShell = e.request.mode === "navigate" || url.pathname.endsWith("/index.html");
  const isWeekly = url.pathname.endsWith("/weekly.json");
  if (isShell || isWeekly) {
    e.respondWith((async () => {
      const key = isShell ? "shell" : "weekly";
      try {
        const res = await fetch(e.request);
        if (res.ok) (await caches.open(CACHE)).put(key, res.clone());
        return res;
      } catch (err) {
        const hit = await (await caches.open(CACHE)).match(key);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  // Event photos, fonts, and other static assets: cache first.
  if (url.pathname.includes("/img/") || url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com") && url.pathname.includes("css")) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    })());
  }
  // Everything else (weather API etc.): straight to network.
});

self.addEventListener("push", e => {
  let data = {};
  try { data = e.data.json(); } catch (err) { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || "Weekend Finder", {
    body: data.body || "Your weekend picks are ready.",
    data: { url: data.url || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data && e.notification.data.url || "./"));
});

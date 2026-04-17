const CACHE = "goboiler-v1";

// ─── Install ─────────────────────────────────────────────
self.addEventListener("install", () => self.skipWaiting());

// ─── Activate ────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── Push ────────────────────────────────────────────────
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch { data = { title: "Notification", body: e.data.text() }; }

  const { title = "GoBoiler", body = "", url = "/", icon = "/icons/icon-192.png" } = data;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      data: { url },
    })
  );
});

// ─── Notification click ──────────────────────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const match = list.find(c => c.url === url && "focus" in c);
      return match ? match.focus() : clients.openWindow(url);
    })
  );
});

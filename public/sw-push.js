// Service Worker dedicado para Web Push (não interfere com PWA preview)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const STORE_ICONS = {
  "ASA NORTE": "/notification-icons/dot-asa-norte.png",
  "AGUAS CLARAS": "/notification-icons/dot-aguas-claras.png",
  "ÁGUAS CLARAS": "/notification-icons/dot-aguas-claras.png",
  "ASA SUL": "/notification-icons/dot-asa-sul.png",
  "LAGO SUL": "/notification-icons/dot-lago-sul.png",
};

function pickStoreIcon(data) {
  if (data?.icon) return data.icon;
  const hay = `${data?.store ?? ""} ${data?.title ?? ""} ${data?.body ?? ""}`.toUpperCase();
  for (const key of Object.keys(STORE_ICONS)) {
    if (hay.includes(key)) return STORE_ICONS[key];
  }
  return "/icon-192.png";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Aviso", body: event.data ? event.data.text() : "" };
  }

  const isOccurrence = data.category === "occurrence";
  const icon = isOccurrence ? pickStoreIcon(data) : (data.icon || "/icon-192.png");

  const title = data.title || "Aviso";
  const options = {
    body: data.body || "",
    icon,
    badge: data.badge || "/badge-72.png",
    image: data.image || undefined,
    tag: data.tag || "rh-plus-announcement",
    requireInteraction: data.priority === "urgent",
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

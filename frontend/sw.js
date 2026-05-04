const CACHE = 'dolar-ar-v3';
const STATIC = [
  '/',
  '/index.html',
  '/config.js',
  '/manifest.json',
  '/css/style.css',
  '/js/api.js',
  '/js/alerts.js',
  '/js/notifications.js',
  '/js/chart.js',
  '/js/app.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
];

// ── Install ──────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // API y datos externos: network-first, sin cachear
  if (url.pathname.startsWith('/api/') || url.hostname === 'dolarapi.com') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión a internet' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return response;
      });
    }).catch(() => caches.match('/index.html'))
  );
});

// ── Push ──────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-72.png',
      vibrate: [200, 100, 200],
      data: data.data || {},
      tag: 'dolar-alert',
      renotify: true,
      actions: [
        { action: 'open', title: 'Ver cotizaciones' },
        { action: 'dismiss', title: 'Descartar' },
      ],
    })
  );
});

// ── Notification click ────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(url) && 'focus' in c);
      return existing ? existing.focus() : clients.openWindow(url);
    })
  );
});

// ─── Service Worker — Dólar AR ────────────────────────────────────
// Estrategia:
//   API / backend  → network-only   (nunca cachear datos)
//   CDN externos   → cache-first    (Chart.js, cambia solo por versión en URL)
//   Assets propios → network-first  (JS/CSS/HTML siempre frescos; cache = offline fallback)

const CACHE_NAME = 'dolar-ar-v13';

// Shell mínimo para funcionar offline
const STATIC_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Detección de tipo de request ─────────────────────────────────

function isApiRequest(url) {
  return (
    url.pathname.startsWith('/api/')          ||  // backend same-origin (dev)
    url.hostname.includes('onrender.com')     ||  // backend Render
    url.hostname === 'dolarapi.com'               // fuente externa directa
  );
}

function isCdnRequest(url) {
  return url.hostname.includes('jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com');
}

// ── Install ────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log(`[SW] install — ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_SHELL))
      .then(() => {
        console.log('[SW] shell precacheado, skipWaiting()');
        return self.skipWaiting(); // activa inmediatamente sin esperar a que cierren tabs
      })
  );
});

// ── Activate ───────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW] activate — ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys()
      .then(keys => {
        const old = keys.filter(k => k !== CACHE_NAME);
        if (old.length) console.log('[SW] eliminando caches viejos:', old.join(', '));
        return Promise.all(old.map(k => caches.delete(k)));
      })
      .then(() => {
        console.log('[SW] clients.claim() — tomando control inmediato');
        return self.clients.claim(); // controla tabs abiertas sin reload
      })
  );
});

// ── Fetch ──────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar non-GET y extensiones del navegador
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // ── 1. API / backend: network-only — NUNCA cachear ────────────
  if (isApiRequest(url)) {
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

  // ── 2. CDN (Chart.js, etc.): cache-first ──────────────────────
  // La URL ya incluye la versión (@4.4.4), así que el cache es seguro.
  if (isCdnRequest(url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── 3. Assets propios (JS, CSS, HTML, íconos): network-first ──
  // Siempre intenta la red → los deploys de Vercel llegan de inmediato.
  // Solo cae al cache si la red falla (modo offline).
  event.respondWith(
    fetch(request)
      .then(response => {
        // Guardar en cache solo respuestas válidas
        if (response.ok && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        // Offline: servir desde cache, o el shell como último recurso
        caches.match(request).then(cached => cached || caches.match('/index.html'))
      )
  );
});

// ── Push notifications ─────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  console.log('[SW] push recibido:', data.title);
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:     data.body,
      icon:     data.icon  || '/icons/icon-192.png',
      badge:    data.badge || '/icons/icon-72.png',
      vibrate:  [200, 100, 200],
      data:     data.data || {},
      tag:      'dolar-alert',
      renotify: true,
      actions: [
        { action: 'open',    title: 'Ver cotizaciones' },
        { action: 'dismiss', title: 'Descartar' },
      ],
    })
  );
});

// ── Notification click ─────────────────────────────────────────────
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

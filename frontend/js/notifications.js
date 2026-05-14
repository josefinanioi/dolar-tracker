// ─── Web Push & Service Worker ────────────────────────────────────

let swReg = null;

// ── Toggle interno de notificaciones ──────────────────────────────
// Fuente de verdad única. Completamente separado del permiso del navegador.
// El permiso del sistema (granted/denied) no se puede revocar desde JS;
// este flag controla si el ENGINE de alertas evalúa y dispara.
//
// Default: false (desactivado) — el usuario activa explícitamente con la campanita.
// Valor en localStorage: 'true' | 'false' | (ausente → false)

const NOTIF_ENABLED_KEY = 'dolar-ar-notifications-enabled';

function isNotifEnabled() {
  return localStorage.getItem(NOTIF_ENABLED_KEY) === 'true';
}

function setNotifEnabled(enabled) {
  localStorage.setItem(NOTIF_ENABLED_KEY, enabled ? 'true' : 'false');
  console.log(`[alerts] ${enabled ? 'enabled' : 'disabled'}`);
}

async function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register('/sw.js', {
      updateViaCache: 'none', // nunca usar HTTP cache para sw.js — siempre buscar versión nueva
    });
    console.log('✅ Service Worker registrado:', swReg.scope);

    // Cuando un nuevo SW toma control (skipWaiting + clients.claim), recargamos
    // para garantizar que el HTML y assets frescos se carguen desde la red.
    // Esto rompe el ciclo donde iOS cachea la navegación con el HTML viejo.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] controllerchange → recargando para aplicar nuevos assets');
      window.location.reload();
    });

    return swReg;
  } catch (err) {
    console.error('Error registrando SW:', err);
    return null;
  }
}

function getNotifPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribePushNotifications(userId) {
  if (!swReg) return false;
  try {
    const vapidKey = await apiGetVapidKey();
    if (!vapidKey) return false;

    let sub = await swReg.pushManager.getSubscription();
    if (!sub) {
      sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    return apiSubscribePush(sub.toJSON(), userId);
  } catch (err) {
    console.error('Error en push subscribe:', err);
    return false;
  }
}

// Muestra una notificación local (sin servidor).
// Doble guard: permiso del sistema Y toggle interno.
function showLocalNotification(title, body) {
  if (Notification.permission !== 'granted') return;
  if (!isNotifEnabled()) {
    console.log('[alerts] skipped — notifications disabled');
    return;
  }
  if (swReg) {
    swReg.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      vibrate: [200, 100, 200],
      tag: 'dolar-local',
    });
  } else {
    new Notification(title, { body });
  }
}

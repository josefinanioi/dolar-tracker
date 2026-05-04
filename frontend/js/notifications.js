// ─── Web Push & Service Worker ────────────────────────────────────

let swReg = null;

async function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker registrado');
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
// Requiere que el permiso ya esté granted.
function showLocalNotification(title, body) {
  if (Notification.permission !== 'granted') return;
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

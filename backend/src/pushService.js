const webpush = require('web-push');

function init() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('⚠️  VAPID keys no configuradas — push notifications deshabilitadas');
    return;
  }
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@dolartracker.app'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  console.log('🔔 Web Push configurado');
}

async function notify(subscription, payload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, expired: err.statusCode === 410, error: err.message };
  }
}

module.exports = { init, notify };

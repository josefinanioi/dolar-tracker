const cron = require('node-cron');
const { fetchCotizaciones } = require('./dolar');
const storage = require('./storage');
const { notify } = require('./pushService');

let latest = null;

function getLatest() {
  return latest;
}

async function evaluateAlerts(cotizaciones) {
  const pendingAlerts = storage.getAlerts().filter(a => !a.triggered || a.repeating);
  if (pendingAlerts.length === 0) return;

  const subs = storage.getSubscriptions();

  for (const alert of pendingAlerts) {
    const dolar = cotizaciones.find(c => c.casa === alert.tipo);
    if (!dolar) continue;

    const precio = alert.campo === 'compra' ? dolar.compra : dolar.venta;
    if (precio === null || precio === undefined) continue;

    const fired =
      (alert.condicion === 'baja' && precio <= alert.valor) ||
      (alert.condicion === 'sube' && precio >= alert.valor);

    if (!fired) continue;

    storage.triggerAlert(alert.id);

    const sub = subs.find(s => s.userId === alert.userId);
    if (!sub) continue;

    const campo = alert.campo === 'compra' ? 'Compra' : 'Venta';
    const dir = alert.condicion === 'baja' ? 'bajó a' : 'subió a';

    const result = await notify(sub.subscription, {
      title: `📊 Alerta Dólar ${dolar.nombre}`,
      body: `${campo} ${dir} $${precio.toLocaleString('es-AR')} (límite: $${alert.valor.toLocaleString('es-AR')})`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: { url: '/', alertId: alert.id },
    });

    if (result.expired) storage.removeSubscription(alert.userId);
  }
}

async function poll() {
  try {
    const cotizaciones = await fetchCotizaciones();
    latest = { cotizaciones, updatedAt: new Date().toISOString() };
    storage.addSnapshot(cotizaciones);
    await evaluateAlerts(cotizaciones);
    console.log(`[${new Date().toLocaleTimeString('es-AR')}] ✅ ${cotizaciones.length} cotizaciones actualizadas`);
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString('es-AR')}] ❌ Error en poll:`, err.message);
  }
}

function start() {
  poll();
  cron.schedule('*/5 * * * *', poll);
  console.log('⏰ Scheduler iniciado (polling cada 5 minutos)');
}

module.exports = { start, getLatest };

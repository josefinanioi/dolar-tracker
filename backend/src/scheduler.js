const cron = require('node-cron');
const { fetchCotizaciones } = require('./dolar');
const storage = require('./storage');
const { notify } = require('./pushService');

// ── Cache compartido ──────────────────────────────────────────────────────────
// Tanto el scheduler como la ruta /cotizaciones leen y escriben aquí.
// Shape: { cotizaciones: [...], updatedAt: ISO string } | null

let latest = null;

function getLatest() { return latest; }
function setLatest(data) { latest = data; }

// ── Evaluación de alertas ─────────────────────────────────────────────────────

async function evaluateAlerts(cotizaciones) {
  const pending = storage.getAlerts().filter(a => !a.triggered || a.repeating);
  if (!pending.length) return;

  const subs = storage.getSubscriptions();

  for (const alert of pending) {
    const dolar = cotizaciones.find(c => c.casa === alert.tipo);
    if (!dolar) continue;

    const precio = alert.campo === 'compra' ? dolar.compra : dolar.venta;
    if (precio == null) continue;

    const fired =
      (alert.condicion === 'baja' && precio <= alert.valor) ||
      (alert.condicion === 'sube' && precio >= alert.valor);
    if (!fired) continue;

    storage.triggerAlert(alert.id);

    const sub = subs.find(s => s.userId === alert.userId);
    if (!sub) continue;

    const campo = alert.campo === 'compra' ? 'Compra' : 'Venta';
    const dir   = alert.condicion === 'baja' ? 'bajó a' : 'subió a';

    const result = await notify(sub.subscription, {
      title: `📊 Alerta Dólar ${dolar.nombre}`,
      body:  `${campo} ${dir} $${precio.toLocaleString('es-AR')} (límite: $${alert.valor.toLocaleString('es-AR')})`,
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data:  { url: '/', alertId: alert.id },
    });
    if (result.expired) storage.removeSubscription(alert.userId);
  }
}

// ── Poll principal ─────────────────────────────────────────────────────────────

async function poll() {
  const ts = new Date().toLocaleTimeString('es-AR');
  try {
    const cotizaciones = await fetchCotizaciones();
    latest = { cotizaciones, updatedAt: new Date().toISOString() };

    storage.addSnapshot(cotizaciones);
    await evaluateAlerts(cotizaciones);

    console.log(`[${ts}] ✅ Scheduler poll: ${cotizaciones.length} tipos. ` +
                cotizaciones.map(c => `${c.nombre}=$${c.venta}`).join(' | '));
  } catch (err) {
    console.error(`[${ts}] ❌ Scheduler poll error:`, err.message);
  }
}

// ── Inicio ────────────────────────────────────────────────────────────────────

function start() {
  poll();                                  // ejecutar inmediatamente al arrancar
  cron.schedule('*/5 * * * *', poll);     // luego cada 5 min (history + alerts)
  console.log('⏰ Scheduler iniciado (cada 5 min para history/alerts)');
}

module.exports = { start, getLatest, setLatest };

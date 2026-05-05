const cron = require('node-cron');
const { fetchCotizaciones } = require('./dolar');
const storage = require('./storage');
const { notify } = require('./pushService');

// ── Cache compartido ──────────────────────────────────────────────────────────
// Shape: { updatedAt: ISO string, oficial, blue, mep, ccl } | null
// Tanto el scheduler como la ruta /cotizaciones leen y escriben aquí.

let latest = null;

function getLatest() { return latest; }
function setLatest(data) { latest = data; }

// ── Etiquetas para push notifications ────────────────────────────────────────

const TIPO_LABEL = { blue: 'Blue', oficial: 'Oficial', mep: 'MEP', ccl: 'CCL' };

// ── Evaluación de alertas ─────────────────────────────────────────────────────

async function evaluateAlerts(cotizaciones) {
  // cotizaciones = { oficial: {compra, venta}, blue: {...}, mep: {...}, ccl: {...} }
  const pending = storage.getAlerts().filter(a => !a.triggered || a.repeating);
  if (!pending.length) return;

  const subs = storage.getSubscriptions();

  for (const alert of pending) {
    const prices = cotizaciones[alert.tipo];   // { compra, venta } | undefined
    if (!prices) continue;

    const precio = prices[alert.campo];         // number | null
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
      title: `📊 Alerta Dólar ${TIPO_LABEL[alert.tipo] || alert.tipo}`,
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
    // cotizaciones = { oficial, blue, mep, ccl }

    latest = { ...cotizaciones, updatedAt: new Date().toISOString() };

    storage.addSnapshot(cotizaciones);
    await evaluateAlerts(cotizaciones);

    console.log(`[${ts}] ✅ Scheduler poll OK:`,
      Object.entries(cotizaciones).map(([k, v]) => `${k}=$${v.venta}`).join(' | ')
    );
  } catch (err) {
    console.error(`[${ts}] ❌ Scheduler poll error:`, err.message);
  }
}

// ── Inicio ────────────────────────────────────────────────────────────────────

function start() {
  poll();                              // ejecutar al arrancar (evita esperar 5 min)
  cron.schedule('*/5 * * * *', poll); // luego cada 5 min para history y alertas
  console.log('⏰ Scheduler iniciado (cada 5 min)');
}

module.exports = { start, getLatest, setLatest };

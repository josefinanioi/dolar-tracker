const cron = require('node-cron');
const { fetchCotizaciones } = require('./dolar');
const storage = require('./storage');
const { notify } = require('./pushService');

// ── Cache compartido ──────────────────────────────────────────────────────────
// Shape: { updatedAt: ISO, oficial, blue, mep, ccl } | null

let latest = null;

function getLatest() { return latest; }
function setLatest(data) { latest = data; }

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPO_LABEL = { blue: 'Blue', oficial: 'Oficial', mep: 'MEP', ccl: 'CCL' };

const PERIODO_MS = {
  '1h':  1  * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePeriodo(p) {
  return PERIODO_MS[p] || PERIODO_MS['24h'];
}

/**
 * Retorna el precio más cercano a targetTs en el historial,
 * para el tipo y campo dados. null si no hay datos suficientes.
 */
function findPriceAt(history, targetTs, tipo, campo) {
  const candidates = history.filter(s => s[tipo]?.[campo] != null);
  if (!candidates.length) return null;
  return candidates.reduce((best, s) =>
    Math.abs(s.ts - targetTs) < Math.abs(best.ts - targetTs) ? s : best
  )[tipo][campo];
}

// ── Evaluación de alertas ─────────────────────────────────────────────────────

async function evaluateAlerts(cotizaciones) {
  // cotizaciones = { oficial: {compra, venta}, blue, mep, ccl }
  const pending = storage.getAlerts().filter(a => !a.triggered || a.repeating);
  if (!pending.length) return;

  // Cargamos historial completo UNA vez — lo usan los tipos variacion/extremo/tendencia
  const history = storage.getAllHistory();
  const subs    = storage.getSubscriptions();

  for (const alert of pending) {
    const prices = cotizaciones[alert.tipo];
    if (!prices) continue;

    const precioActual = prices[alert.campo];
    if (precioActual == null) continue;

    const tipAlerta = alert.tipAlerta || 'umbral'; // backward compat
    let fired    = false;
    let notifBody = '';

    // ── Umbral: precio cruza un valor fijo ────────────────────────────────────
    if (tipAlerta === 'umbral') {
      fired =
        (alert.condicion === 'baja' && precioActual <= alert.valor) ||
        (alert.condicion === 'sube' && precioActual >= alert.valor);

      if (fired) {
        const dir   = alert.condicion === 'baja' ? 'bajó a' : 'subió a';
        const campo = alert.campo === 'compra' ? 'Compra' : 'Venta';
        notifBody = `${campo} ${dir} $${precioActual.toLocaleString('es-AR')} (límite $${alert.valor?.toLocaleString('es-AR')})`;
      }
    }

    // ── Variación %: variación porcentual en un período ───────────────────────
    else if (tipAlerta === 'variacion') {
      const periodoMs      = parsePeriodo(alert.periodo);
      const targetTs       = Date.now() - periodoMs;
      const precioAnterior = findPriceAt(history, targetTs, alert.tipo, alert.campo);

      if (precioAnterior != null && precioAnterior !== 0) {
        const pct = ((precioActual - precioAnterior) / precioAnterior) * 100;
        fired =
          (alert.condicion === 'sube' && pct >=  alert.porcentaje) ||
          (alert.condicion === 'baja' && pct <= -alert.porcentaje);

        if (fired) {
          const signo = pct > 0 ? '+' : '';
          notifBody = `${alert.campo} varió ${signo}${pct.toFixed(2)}% en ${alert.periodo}: $${precioActual.toLocaleString('es-AR')}`;
        }
      }
    }

    // ── Extremo: precio toca mínimo o máximo del período ──────────────────────
    else if (tipAlerta === 'extremo') {
      const periodoMs = parsePeriodo(alert.periodo);
      const fromTs    = Date.now() - periodoMs;
      const vals      = history
        .filter(s => s.ts >= fromTs && s[alert.tipo]?.[alert.campo] != null)
        .map(s => s[alert.tipo][alert.campo]);

      // Requiere al menos 10 puntos para que el extremo sea significativo
      if (vals.length >= 10) {
        const extremoVal = alert.extremo === 'minimo'
          ? Math.min(...vals)
          : Math.max(...vals);
        const diff = Math.abs(precioActual - extremoVal) / extremoVal;
        fired = diff < 0.002; // dentro del 0.2% del extremo

        if (fired) {
          const lbl = alert.extremo === 'minimo' ? 'mínimo' : 'máximo';
          notifBody = `Tocó ${lbl} de ${alert.periodo}: $${precioActual.toLocaleString('es-AR')}`;
        }
      }
    }

    // ── Tendencia: N mediciones consecutivas en la misma dirección ────────────
    else if (tipAlerta === 'tendencia') {
      const n      = (alert.consecutivos || 3) + 1; // necesitamos n+1 puntos
      const recent = history
        .filter(s => s[alert.tipo]?.[alert.campo] != null)
        .slice(-n)
        .map(s => s[alert.tipo][alert.campo]);

      if (recent.length >= n) {
        const esSubida = recent.every((v, i) => i === 0 || v > recent[i - 1]);
        const esBajada = recent.every((v, i) => i === 0 || v < recent[i - 1]);
        fired =
          (alert.tendencia === 'subiendo' && esSubida) ||
          (alert.tendencia === 'bajando'  && esBajada);

        if (fired) {
          const lbl = alert.tendencia === 'subiendo' ? 'alcista' : 'bajista';
          notifBody = `Tendencia ${lbl}: $${precioActual.toLocaleString('es-AR')} (${alert.consecutivos || 3} mov. consecutivos)`;
        }
      }
    }

    if (!fired) continue;

    storage.triggerAlert(alert.id);
    console.log(`[alerts] ✅ ${tipAlerta} disparada — ${alert.tipo} ${alert.campo}: ${notifBody}`);

    const sub = subs.find(s => s.userId === alert.userId);
    if (!sub) continue;

    const result = await notify(sub.subscription, {
      title: `📊 Alerta Dólar ${TIPO_LABEL[alert.tipo] || alert.tipo}`,
      body:  notifBody,
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
  cron.schedule('*/5 * * * *', poll); // luego cada 5 min
  console.log('⏰ Scheduler iniciado (cada 5 min)');
}

module.exports = { start, getLatest, setLatest };

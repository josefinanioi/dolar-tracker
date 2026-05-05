// ─── Gestión de alertas ───────────────────────────────────────────
// Fuente de verdad: localStorage. Sync opcional con backend en background.

const ALERTS_KEY = 'dolar-ar-alerts';
const USER_KEY   = 'dolar-ar-userid';

// Migración de claves antiguas (formato viejo → nuevo)
// 'bolsa' → 'mep'  |  'contadoconliqui' → 'ccl'
const TIPO_MIGRATION = { bolsa: 'mep', contadoconliqui: 'ccl' };
function migrarTipo(tipo) {
  return TIPO_MIGRATION[tipo] ?? tipo;
}

// Etiquetas para mostrar en UI
const TIPO_LABEL = { blue: 'Blue', oficial: 'Oficial', mep: 'MEP', ccl: 'CCL' };

function getUserId() {
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

function getAlertas() {
  try {
    const list = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]');
    // Migrar alertas con tipo antiguo al nuevo formato
    return list.map(a => ({ ...a, tipo: migrarTipo(a.tipo) }));
  } catch {
    return [];
  }
}

function _saveAlertas(list) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}

function createAlerta(params) {
  const alert = {
    id:        `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
    tipo:      migrarTipo(params.tipo),
    userId:    getUserId(),
    createdAt: new Date().toISOString(),
    triggered: false,
  };
  const list = getAlertas();
  list.push(alert);
  _saveAlertas(list);
  apiCreateAlerta(alert).catch(() => {});
  return alert;
}

function deleteAlerta(id) {
  _saveAlertas(getAlertas().filter(a => a.id !== id));
  apiDeleteAlerta(id).catch(() => {});
}

function triggerAlerta(id) {
  const list = getAlertas();
  const a = list.find(x => x.id === id);
  if (a) { a.triggered = true; a.triggeredAt = new Date().toISOString(); }
  _saveAlertas(list);
}

function resetAlerta(id) {
  const list = getAlertas();
  const a = list.find(x => x.id === id);
  if (a) { a.triggered = false; delete a.triggeredAt; }
  _saveAlertas(list);
}

/**
 * Evalúa alertas contra las cotizaciones actuales.
 *
 * @param {Object} cotizaciones  Formato: { oficial, blue, mep, ccl }
 *                               donde cada valor es { compra, venta }.
 * @returns {Array} Array de { alert, tipo, precio } para cada alerta disparada.
 */
function evalAlertas(cotizaciones) {
  const triggered = [];

  for (const alert of getAlertas()) {
    if (alert.triggered && !alert.repeating) continue;

    // cotizaciones es un objeto keyed, no un array
    const prices = cotizaciones[alert.tipo];  // { compra, venta } | undefined
    if (!prices) continue;

    const precio = prices[alert.campo];       // number | null
    if (precio == null) continue;

    const fired =
      (alert.condicion === 'baja' && precio <= alert.valor) ||
      (alert.condicion === 'sube' && precio >= alert.valor);

    if (fired) {
      triggerAlerta(alert.id);
      triggered.push({ alert, tipo: alert.tipo, precio });
    }
  }

  return triggered;
}

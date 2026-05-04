// ─── Gestión de alertas ───────────────────────────────────────────
// Fuente de verdad: localStorage. Sync opcional con backend.

const ALERTS_KEY = 'dolar-ar-alerts';
const USER_KEY   = 'dolar-ar-userid';

function getUserId() {
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

function getAlertas() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]'); }
  catch { return []; }
}

function _saveAlertas(list) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}

function createAlerta(params) {
  const alert = {
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
    userId: getUserId(),
    createdAt: new Date().toISOString(),
    triggered: false,
  };
  const list = getAlertas();
  list.push(alert);
  _saveAlertas(list);
  // Sync con backend en background (no bloqueante)
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

// Evalúa todas las alertas activas contra las cotizaciones actuales.
// Retorna array de { alert, dolar, precio } para cada una que disparó.
function evalAlertas(cotizaciones) {
  const triggered = [];
  for (const alert of getAlertas()) {
    if (alert.triggered && !alert.repeating) continue;
    const dolar = cotizaciones.find(c => c.casa === alert.tipo);
    if (!dolar) continue;
    const precio = alert.campo === 'compra' ? dolar.compra : dolar.venta;
    if (precio === null || precio === undefined) continue;
    const fired =
      (alert.condicion === 'baja' && precio <= alert.valor) ||
      (alert.condicion === 'sube' && precio >= alert.valor);
    if (fired) {
      triggerAlerta(alert.id);
      triggered.push({ alert, dolar, precio });
    }
  }
  return triggered;
}

const TIPO_LABEL = { blue: 'Blue', oficial: 'Oficial', bolsa: 'MEP', contadoconliqui: 'CCL' };

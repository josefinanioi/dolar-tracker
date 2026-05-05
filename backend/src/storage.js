const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function read(filename, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
  } catch {
    return fallback;
  }
}

function write(filename, data) {
  ensureDir();
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// ── Historial ──────────────────────────────────────────────────────────────────
//
// Nuevo formato de snapshot: { ts, oficial: {compra, venta}, blue, mep, ccl }
// Las entradas en formato viejo (que tienen campo .cotizaciones array) se
// descartan automáticamente al escribir, para evitar mezclar formatos.

function addSnapshot(cotizaciones) {
  // cotizaciones = { oficial: {compra, venta}, blue, mep, ccl }
  let history = read('history.json', []);

  // Descartar entradas en formato viejo (tenían { cotizaciones: [...] })
  history = history.filter(s => !Array.isArray(s.cotizaciones));

  history.push({ ts: Date.now(), ...cotizaciones });

  // Mantener solo las últimas 24 horas
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  history = history.filter(s => s.ts > cutoff);

  write('history.json', history);
}

function getHistory() {
  const history = read('history.json', []);
  // Devolver solo entradas en nuevo formato
  return history.filter(s => !Array.isArray(s.cotizaciones));
}

// ── Suscripciones Push ─────────────────────────────────────────────────────────

function getSubscriptions() {
  return read('subscriptions.json', []);
}

function upsertSubscription(userId, subscription) {
  const subs = getSubscriptions();
  const idx  = subs.findIndex(s => s.userId === userId);
  if (idx >= 0) subs[idx].subscription = subscription;
  else subs.push({ userId, subscription });
  write('subscriptions.json', subs);
}

function removeSubscription(userId) {
  write('subscriptions.json', getSubscriptions().filter(s => s.userId !== userId));
}

// ── Alertas ────────────────────────────────────────────────────────────────────
//
// Migración automática: alertas guardadas con tipo 'bolsa' o 'contadoconliqui'
// (formato viejo) se mapean a 'mep' y 'ccl' al leer.

const TIPO_MIGRATION = { bolsa: 'mep', contadoconliqui: 'ccl' };

function migrateAlertTipo(tipo) {
  return TIPO_MIGRATION[tipo] ?? tipo;
}

function getAlerts() {
  const list = read('alerts.json', []);
  return list.map(a => ({ ...a, tipo: migrateAlertTipo(a.tipo) }));
}

function createAlert(data) {
  const raw    = read('alerts.json', []);
  const alert  = {
    ...data,
    tipo:      migrateAlertTipo(data.tipo),
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    triggered: false,
  };
  raw.push(alert);
  write('alerts.json', raw);
  return alert;
}

function deleteAlert(id) {
  write('alerts.json', read('alerts.json', []).filter(a => a.id !== id));
}

function triggerAlert(id) {
  const alerts = read('alerts.json', []);
  const a = alerts.find(a => a.id === id);
  if (a) { a.triggered = true; a.triggeredAt = new Date().toISOString(); }
  write('alerts.json', alerts);
}

function resetAlert(id) {
  const alerts = read('alerts.json', []);
  const a = alerts.find(a => a.id === id);
  if (a) { a.triggered = false; delete a.triggeredAt; }
  write('alerts.json', alerts);
}

module.exports = {
  addSnapshot, getHistory,
  getSubscriptions, upsertSubscription, removeSubscription,
  getAlerts, createAlert, deleteAlert, triggerAlert, resetAlert,
};

const fs   = require('fs');
const path = require('path');

const DATA_DIR        = path.join(__dirname, '../../data');
const HISTORY_MAX_AGE = 90 * 24 * 60 * 60 * 1000; // 90 días

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
// Snapshot: { ts: number, oficial: {compra, venta}, blue, mep, ccl }
// Retención: 90 días. Granularidad: cada 5 min (288 puntos/día, ~26k máx).

/**
 * Reduce N snapshots a maxPoints promediando buckets consecutivos.
 * Preserva el timestamp del punto central de cada bucket.
 */
function downsample(snapshots, maxPoints = 250) {
  if (snapshots.length <= maxPoints) return snapshots;
  const factor = Math.ceil(snapshots.length / maxPoints);
  const result = [];
  const TIPOS  = ['oficial', 'blue', 'mep', 'ccl'];

  for (let i = 0; i < snapshots.length; i += factor) {
    const bucket = snapshots.slice(i, i + factor);
    const ts     = bucket[Math.floor(bucket.length / 2)].ts;
    const point  = { ts };

    for (const tipo of TIPOS) {
      const vals = bucket.map(s => s[tipo]).filter(Boolean);
      if (vals.length) {
        point[tipo] = {
          compra: Math.round(vals.reduce((a, v) => a + (v.compra ?? 0), 0) / vals.length * 100) / 100,
          venta:  Math.round(vals.reduce((a, v) => a + (v.venta  ?? 0), 0) / vals.length * 100) / 100,
        };
      }
    }
    result.push(point);
  }
  return result;
}

function addSnapshot(cotizaciones) {
  let history = read('history.json', []);
  // Descartar entradas en formato viejo (tenían { cotizaciones: [...] })
  history = history.filter(s => !Array.isArray(s.cotizaciones));
  history.push({ ts: Date.now(), ...cotizaciones });
  const cutoff = Date.now() - HISTORY_MAX_AGE;
  history = history.filter(s => s.ts > cutoff);
  write('history.json', history);
}

/** Retorna todo el historial sin filtrar — para evaluación interna de alertas. */
function getAllHistory() {
  return read('history.json', []).filter(s => !Array.isArray(s.cotizaciones));
}

/**
 * Retorna historial filtrado por rango de timestamps y downsampled.
 * @param {number|null} from  Timestamp ms (inclusive). null = sin límite inferior.
 * @param {number|null} to    Timestamp ms (inclusive). null = ahora.
 * @param {number}      max   Máximo de puntos a retornar (default 250).
 */
function getHistoryRange(from = null, to = null, max = 250) {
  let history = getAllHistory();
  if (from) history = history.filter(s => s.ts >= from);
  if (to)   history = history.filter(s => s.ts <= to);
  return downsample(history, max);
}

/** Backward-compat: últimas 24 h (para el frontend cuando no pasa rango). */
function getHistory() {
  return getHistoryRange(Date.now() - 24 * 60 * 60 * 1000, null, 250);
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
// Tipos soportados: umbral | variacion | extremo | tendencia
// Migración automática de claves viejas: bolsa → mep, contadoconliqui → ccl

const TIPO_MIGRATION = { bolsa: 'mep', contadoconliqui: 'ccl' };

function migrateAlertTipo(tipo) {
  return TIPO_MIGRATION[tipo] ?? tipo;
}

function getAlerts() {
  const list = read('alerts.json', []);
  return list.map(a => ({ ...a, tipo: migrateAlertTipo(a.tipo) }));
}

function createAlert(data) {
  const raw   = read('alerts.json', []);
  const alert = {
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
  addSnapshot,
  getAllHistory, getHistory, getHistoryRange,
  getSubscriptions, upsertSubscription, removeSubscription,
  getAlerts, createAlert, deleteAlert, triggerAlert, resetAlert,
};

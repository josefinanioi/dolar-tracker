const fs = require('fs');
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

function addSnapshot(cotizaciones) {
  let history = read('history.json', []);
  history.push({ ts: Date.now(), cotizaciones });
  // Mantener solo las últimas 24 horas (288 snapshots a 5 min)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  history = history.filter(s => s.ts > cutoff);
  write('history.json', history);
}

function getHistory() {
  return read('history.json', []);
}

// ── Suscripciones Push ─────────────────────────────────────────────────────────

function getSubscriptions() {
  return read('subscriptions.json', []);
}

function upsertSubscription(userId, subscription) {
  const subs = getSubscriptions();
  const idx = subs.findIndex(s => s.userId === userId);
  if (idx >= 0) subs[idx].subscription = subscription;
  else subs.push({ userId, subscription });
  write('subscriptions.json', subs);
}

function removeSubscription(userId) {
  write('subscriptions.json', getSubscriptions().filter(s => s.userId !== userId));
}

// ── Alertas ────────────────────────────────────────────────────────────────────

function getAlerts() {
  return read('alerts.json', []);
}

function createAlert(data) {
  const alerts = getAlerts();
  const alert = {
    ...data,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    triggered: false,
  };
  alerts.push(alert);
  write('alerts.json', alerts);
  return alert;
}

function deleteAlert(id) {
  write('alerts.json', getAlerts().filter(a => a.id !== id));
}

function triggerAlert(id) {
  const alerts = getAlerts();
  const a = alerts.find(a => a.id === id);
  if (a) { a.triggered = true; a.triggeredAt = new Date().toISOString(); }
  write('alerts.json', alerts);
}

function resetAlert(id) {
  const alerts = getAlerts();
  const a = alerts.find(a => a.id === id);
  if (a) { a.triggered = false; delete a.triggeredAt; }
  write('alerts.json', alerts);
}

module.exports = {
  addSnapshot, getHistory,
  getSubscriptions, upsertSubscription, removeSubscription,
  getAlerts, createAlert, deleteAlert, triggerAlert, resetAlert,
};

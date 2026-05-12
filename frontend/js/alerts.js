// ─── Gestión de alertas ───────────────────────────────────────────
//
// STATE MACHINE por alerta:
//
//   "armed"     → precio en zona segura, esperando cruce
//   "triggered" → condición cumplida (alerta repetible), esperando que
//                 el precio vuelva a zona segura para re-armarse
//   "completed" → disparada y NO repetible → ignorada para siempre
//
// Transiciones para "baja de X":
//
//   armed     + precio < X   →  triggered (o completed si !repeating)   🔔 DISPARA
//   triggered + precio ≥ X   →  armed                                    (auto-reset)
//   triggered + precio < X   →  triggered                                (no repetir)
//   completed + cualquier    →  completed                                (nunca más)
//
// Transiciones para "sube de X": simétricas (> / ≤).
//
// Regla central: el disparo ocurre SOLO en la transición armed → triggered/completed.
// Mientras el precio permanece en zona de disparo sin cruce nuevo, no hay re-disparo.

const ALERTS_KEY = 'dolar-ar-alerts';
const USER_KEY   = 'dolar-ar-userid';

// Migración de claves antiguas (tipo)
const TIPO_MIGRATION = { bolsa: 'mep', contadoconliqui: 'ccl' };
function migrarTipo(tipo) { return TIPO_MIGRATION[tipo] ?? tipo; }

const TIPO_LABEL = { blue: 'Blue', oficial: 'Oficial', mep: 'MEP', ccl: 'CCL' };

const PERIODO_MS = {
  '1h':  1  * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// ── Migración / normalización ─────────────────────────────────────
//
// Convierte alertas del formato viejo (boolean triggered) a state machine.
// También normaliza campos numéricos que puedan haberse guardado como strings.

function _migrarAlerta(a) {
  // Numéricos
  if (a.valor        != null) a.valor        = Number(a.valor);
  if (a.porcentaje   != null) a.porcentaje   = Number(a.porcentaje);
  if (a.consecutivos != null) a.consecutivos = Number(a.consecutivos);

  // State machine: si ya tiene estado válido, no tocar
  if (a.state === 'armed' || a.state === 'triggered' || a.state === 'completed') return a;

  // Migrar desde boolean triggered → state
  if (a.triggered === true) {
    a.state = a.repeating ? 'triggered' : 'completed';
  } else {
    a.state = 'armed';
  }

  return a;
}

// ── User ID ────────────────────────────────────────────────────────

function getUserId() {
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = `u-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

// ── CRUD ──────────────────────────────────────────────────────────

function getAlertas() {
  try {
    const list = JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]');
    return list.map(a => _migrarAlerta({ ...a, tipo: migrarTipo(a.tipo) }));
  } catch {
    return [];
  }
}

function _saveAlertas(list) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}

function createAlerta(params) {
  const alert = _migrarAlerta({
    id:        `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
    tipo:      migrarTipo(params.tipo),
    tipAlerta: params.tipAlerta || 'umbral',
    state:     'armed',   // siempre empieza armada
    userId:    getUserId(),
    createdAt: new Date().toISOString(),
  });
  const list = getAlertas();
  list.push(alert);
  _saveAlertas(list);
  apiCreateAlerta(alert).catch(() => {});
  return alert;
}

function deleteAlerta(id) {
  const list   = getAlertas();
  const antes  = list.length;
  const nueva  = list.filter(a => a.id !== id);
  _saveAlertas(nueva);
  console.log(`[alerts] eliminada: ${id} (${antes} → ${nueva.length})`);
  console.log('[alerts] activas restantes:', nueva.map(a => a.id));
  apiDeleteAlerta(id).then(ok => {
    if (!ok) console.warn('[alerts] ⚠️ la alerta', id, 'puede seguir activa en el backend');
  }).catch(() => {});
}

// Reset manual (botón ↺ en UI) → vuelve a armed para poder re-dispararse
function resetAlerta(id) {
  const list = getAlertas();
  const a    = list.find(x => x.id === id);
  if (a) {
    a.state = 'armed';
    delete a.lastTriggeredAt;
  }
  _saveAlertas(list);
}

function updateAlerta(id, params) {
  const list = getAlertas();
  const idx  = list.findIndex(a => a.id === id);
  if (idx === -1) { console.warn('[alerts] updateAlerta: id no encontrado:', id); return null; }

  list[idx] = _migrarAlerta({
    ...list[idx],
    ...params,
    id,
    tipo:      migrarTipo(params.tipo || list[idx].tipo),
    tipAlerta: params.tipAlerta || list[idx].tipAlerta || 'umbral',
    state:     'armed',   // al editar, re-armar siempre
    updatedAt: new Date().toISOString(),
  });
  delete list[idx].lastTriggeredAt;

  _saveAlertas(list);
  console.log('[alerts] actualizada:', id, list[idx]);
  apiUpdateAlerta(id, list[idx]).catch(() => {});
  return list[idx];
}

// ── Título para la UI ──────────────────────────────────────────────

function alertaTitle(a) {
  if (!a || typeof a !== 'object') return '(alerta inválida)';
  const tipoLbl  = TIPO_LABEL[a.tipo]  || a.tipo  || '?';
  const campoLbl = a.campo === 'compra' ? 'Compra' : 'Venta';
  const tip      = a.tipAlerta || 'umbral';

  if (tip === 'umbral') {
    const condLbl = a.condicion === 'baja' ? '↓ baja de' : '↑ sube de';
    return `${tipoLbl} ${campoLbl} ${condLbl} $${(a.valor || 0).toLocaleString('es-AR')}`;
  }
  if (tip === 'variacion') {
    const dirLbl = a.condicion === 'sube' ? '↑ sube' : '↓ baja';
    return `${tipoLbl} ${campoLbl} ${dirLbl} ${a.porcentaje}% en ${a.periodo}`;
  }
  if (tip === 'extremo') {
    const extLbl = a.extremo === 'minimo' ? '↓ toca mínimo' : '↑ rompe máximo';
    return `${tipoLbl} ${campoLbl} ${extLbl} de ${a.periodo}`;
  }
  if (tip === 'tendencia') {
    const tLbl = a.tendencia === 'subiendo' ? '↑ tendencia alcista' : '↓ tendencia bajista';
    return `${tipoLbl} ${campoLbl} ${tLbl} (${a.consecutivos || 3} consecutivos)`;
  }
  return `${tipoLbl} ${campoLbl}`;
}

// ══════════════════════════════════════════════════════════════════
// Evaluación — State Machine
// ══════════════════════════════════════════════════════════════════
//
// Algoritmo:
//   1. Lee alertas desde localStorage (lectura fresca, siempre).
//   2. Para cada alerta, calcula el nuevo estado con _computeState().
//   3. Si el estado cambió, muta el objeto en la lista.
//   4. Si la transición fue armed → triggered/completed: es un DISPARO.
//   5. Al final: un solo _saveAlertas() si hubo algún cambio.
//
// Propiedad clave: el disparo ocurre EXACTAMENTE en la transición.
// Un precio que permanece en zona de disparo no genera disparos repetidos.

function evalAlertas(cotizaciones, history = []) {
  if (!cotizaciones || typeof cotizaciones !== 'object') return [];

  console.count('[evalAlertas] ejecutado');

  const list = getAlertas(); // lectura fresca + migración

  console.log('[evalAlertas] alertas activas:', list.map(a =>
    `${a.id.slice(-6)}[${a.tipAlerta},${a.condicion||a.tendencia||a.extremo},val=${a.valor},state=${a.state},rep=${a.repeating}]`
  ).join(' | ') || '(ninguna)');

  let dirty   = false;
  const fired = [];

  for (const alert of list) {
    try {
      const prevState = alert.state;

      // completed: no-repetible ya disparada — nunca volver a evaluar
      if (prevState === 'completed') continue;

      const prices = cotizaciones[alert.tipo];
      if (!prices) continue;

      const precio = Number(prices[alert.campo]);
      if (Number.isNaN(precio)) continue;

      const newState = _computeState(alert, precio, history);

      if (newState === prevState) continue; // sin transición — nada que hacer

      // ── Transición de estado ──────────────────────────────────
      alert.state = newState;
      dirty = true;

      console.log(`[evalAlertas] transición ${alert.id.slice(-6)}: ${prevState} → ${newState} (precio=${precio})`);

      // DISPARO: solo en la transición armed → triggered/completed
      if (prevState === 'armed' && (newState === 'triggered' || newState === 'completed')) {
        alert.lastTriggeredAt = new Date().toISOString();
        const mensaje = _buildMensaje(alert, precio, history);
        console.log(`[evalAlertas] 🔔 DISPARO: ${mensaje}`);
        fired.push({ alert, tipo: alert.tipo, precio, mensaje });
      }

    } catch (err) {
      console.error('[evalAlertas] error en alerta', alert?.id, err);
    }
  }

  if (dirty) _saveAlertas(list); // un solo write al final

  return fired;
}

// ── _computeState ─────────────────────────────────────────────────
//
// Función pura: dado el estado actual de la alerta y el precio actual,
// retorna el nuevo estado. Sin side-effects.
//
// Transiciones posibles:
//   armed     + condición cumplida  →  triggered (repeating) / completed (!repeating)
//   triggered + condición NO cumple →  armed     (auto-reset)
//   cualquiera + datos insuficientes →  sin cambio

function _computeState(alert, precio, history) {
  const current   = alert.state;
  const tipAlerta = alert.tipAlerta || 'umbral';

  // ── Umbral ────────────────────────────────────────────────────
  if (tipAlerta === 'umbral') {
    const objetivo = Number(alert.valor);
    if (Number.isNaN(objetivo)) return current;

    // ¿Precio en zona de disparo? (comparación ESTRICTA — nunca igualdad)
    const enZona =
      (alert.condicion === 'baja' && precio < objetivo) ||
      (alert.condicion === 'sube' && precio > objetivo);

    console.log(
      `[_computeState] umbral ${alert.condicion} ${objetivo}: precio=${precio}` +
      ` | ${alert.condicion === 'baja' ? `${precio} < ${objetivo}` : `${precio} > ${objetivo}`} = ${enZona}` +
      ` | state: ${current}`
    );

    if (current === 'armed')     return enZona  ? (alert.repeating ? 'triggered' : 'completed') : 'armed';
    if (current === 'triggered') return !enZona ? 'armed' : 'triggered';
    return current;
  }

  // ── Variación % ───────────────────────────────────────────────
  if (tipAlerta === 'variacion') {
    if (history.length < 2) return current;
    const porcentaje = Number(alert.porcentaje);
    if (Number.isNaN(porcentaje)) return current;

    const periodoMs = PERIODO_MS[alert.periodo] || PERIODO_MS['24h'];
    const targetTs  = Date.now() - periodoMs;
    const snaps     = history.filter(s => s[alert.tipo]?.[alert.campo] != null);
    if (snaps.length < 2) return current;

    const snapOld   = snaps.reduce((b, s) =>
      Math.abs(s.ts - targetTs) < Math.abs(b.ts - targetTs) ? s : b, snaps[0]
    );
    const precioOld = Number(snapOld[alert.tipo][alert.campo]);
    if (Number.isNaN(precioOld) || precioOld === 0) return current;

    const pct    = ((precio - precioOld) / precioOld) * 100;
    const enZona =
      (alert.condicion === 'sube' && pct >=  porcentaje) ||
      (alert.condicion === 'baja' && pct <= -porcentaje);

    if (current === 'armed')     return enZona  ? (alert.repeating ? 'triggered' : 'completed') : 'armed';
    if (current === 'triggered') return !enZona ? 'armed' : 'triggered';
    return current;
  }

  // ── Extremo ───────────────────────────────────────────────────
  if (tipAlerta === 'extremo') {
    if (history.length < 10) return current;
    const periodoMs = PERIODO_MS[alert.periodo] || PERIODO_MS['7d'];
    const fromTs    = Date.now() - periodoMs;
    const vals = history
      .filter(s => s.ts >= fromTs && s[alert.tipo]?.[alert.campo] != null)
      .map(s => Number(s[alert.tipo][alert.campo]))
      .filter(v => !Number.isNaN(v));
    if (vals.length < 5) return current;

    const extremoVal = alert.extremo === 'minimo' ? Math.min(...vals) : Math.max(...vals);
    const enZona     = Math.abs(precio - extremoVal) / extremoVal < 0.002;

    if (current === 'armed')     return enZona  ? (alert.repeating ? 'triggered' : 'completed') : 'armed';
    if (current === 'triggered') return !enZona ? 'armed' : 'triggered';
    return current;
  }

  // ── Tendencia ─────────────────────────────────────────────────
  if (tipAlerta === 'tendencia') {
    if (history.length < 4) return current;
    const n      = (Number(alert.consecutivos) || 3) + 1;
    const recent = history
      .filter(s => s[alert.tipo]?.[alert.campo] != null)
      .slice(-n)
      .map(s => Number(s[alert.tipo][alert.campo]))
      .filter(v => !Number.isNaN(v));
    if (recent.length < n) return current;

    const esSubida = recent.every((v, i) => i === 0 || v > recent[i - 1]);
    const esBajada = recent.every((v, i) => i === 0 || v < recent[i - 1]);
    const enZona   =
      (alert.tendencia === 'subiendo' && esSubida) ||
      (alert.tendencia === 'bajando'  && esBajada);

    if (current === 'armed')     return enZona  ? (alert.repeating ? 'triggered' : 'completed') : 'armed';
    if (current === 'triggered') return !enZona ? 'armed' : 'triggered';
    return current;
  }

  return current; // tipo no reconocido o datos insuficientes — sin cambio
}

// ── _buildMensaje ─────────────────────────────────────────────────

function _buildMensaje(alert, precio, history) {
  const tipoLbl   = TIPO_LABEL[alert.tipo] || alert.tipo;
  const tipAlerta = alert.tipAlerta || 'umbral';
  const p         = precio.toLocaleString('es-AR');

  if (tipAlerta === 'umbral') {
    const dir = alert.condicion === 'baja' ? 'bajó de' : 'subió de';
    const obj = Number(alert.valor).toLocaleString('es-AR');
    return `${tipoLbl} ${alert.campo} ${dir} $${obj} (ahora $${p})`;
  }
  if (tipAlerta === 'variacion') {
    const dir = alert.condicion === 'sube' ? '↑ subió' : '↓ bajó';
    return `${tipoLbl} ${alert.campo} ${dir} ${alert.porcentaje}% en ${alert.periodo}`;
  }
  if (tipAlerta === 'extremo') {
    const lbl = alert.extremo === 'minimo' ? 'mínimo' : 'máximo';
    return `${tipoLbl} tocó ${lbl} de ${alert.periodo}: $${p}`;
  }
  if (tipAlerta === 'tendencia') {
    const lbl = alert.tendencia === 'subiendo' ? 'alcista' : 'bajista';
    return `${tipoLbl} tendencia ${lbl}: $${p}`;
  }
  return `${tipoLbl} alerta: $${p}`;
}

// ── Debug helpers (consola del navegador) ─────────────────────────
//
//   _alertasDebug.estado()        → tabla completa de alertas
//   _alertasDebug.limpiarTodo()   → borra todas las alertas de localStorage

window._alertasDebug = {
  estado() {
    console.table(getAlertas().map(a => ({
      id:          a.id.slice(-8),
      tipo:        a.tipo,
      campo:       a.campo,
      tipAlerta:   a.tipAlerta,
      condicion:   a.condicion,
      valor:       a.valor,
      tipoValor:   typeof a.valor,
      state:       a.state,
      repeating:   a.repeating,
      lastFired:   a.lastTriggeredAt,
    })));
  },
  limpiarTodo() {
    localStorage.removeItem(ALERTS_KEY);
    localStorage.removeItem('dolar-ar-last-prices'); // clave vieja
    console.log('[debug] alertas y precios borrados de localStorage');
  },
};

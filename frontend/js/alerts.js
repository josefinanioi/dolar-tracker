// ─── Gestión de alertas ───────────────────────────────────────────
// Fuente de verdad: localStorage. Sync opcional con backend en background.

const ALERTS_KEY = 'dolar-ar-alerts';
const USER_KEY   = 'dolar-ar-userid';

// Migración de claves antiguas (formato viejo → nuevo)
const TIPO_MIGRATION = { bolsa: 'mep', contadoconliqui: 'ccl' };
function migrarTipo(tipo) { return TIPO_MIGRATION[tipo] ?? tipo; }

// Etiquetas para UI
const TIPO_LABEL = { blue: 'Blue', oficial: 'Oficial', mep: 'MEP', ccl: 'CCL' };

const PERIODO_MS = {
  '1h':  1  * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

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
    tipAlerta: params.tipAlerta || 'umbral',
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
  const antes = getAlertas().length;
  _saveAlertas(getAlertas().filter(a => a.id !== id));
  const despues = getAlertas().length;
  console.log(`[alerts] alerta eliminada: ${id} (localStorage: ${antes} → ${despues})`);
  console.log('[alerts] alertas activas restantes:', getAlertas().map(a => a.id));
  // apiDeleteAlerta reintenta 2 veces y loguea si falla
  apiDeleteAlerta(id).then(ok => {
    if (!ok) console.warn('[alerts] ⚠️ la alerta', id, 'puede seguir activa en el backend — las push notifications podrían continuar');
  }).catch(() => {});
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

function updateAlerta(id, params) {
  const list = getAlertas();
  const idx  = list.findIndex(a => a.id === id);
  if (idx === -1) { console.warn('[alerts] updateAlerta: id no encontrado:', id); return null; }

  // Merge: conservar id, userId, createdAt y triggered original
  list[idx] = {
    ...list[idx],
    ...params,
    id,
    tipo:      migrarTipo(params.tipo || list[idx].tipo),
    tipAlerta: params.tipAlerta || list[idx].tipAlerta || 'umbral',
    // al editar, reactivar la alerta si estaba disparada
    triggered:   false,
    triggeredAt: undefined,
    updatedAt: new Date().toISOString(),
  };
  delete list[idx].triggeredAt; // limpiar campo si existía

  _saveAlertas(list);
  console.log('[alerts] alerta actualizada:', id, list[idx]);
  apiUpdateAlerta(id, list[idx]).catch(() => {});
  return list[idx];
}

// ── Título de alerta para la UI ────────────────────────────────────

function alertaTitle(a) {
  if (!a || typeof a !== 'object') return '(alerta inválida)';
  const tipoLbl  = TIPO_LABEL[a.tipo]  || a.tipo  || '?';
  const campoLbl = a.campo === 'compra' ? 'Compra' : 'Venta';
  const tip      = a.tipAlerta || 'umbral';

  if (tip === 'umbral') {
    const condLbl = a.condicion === 'baja' ? '↓ baja de' : '↑ sube a';
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

// ── Evaluación client-side ─────────────────────────────────────────
//
// Evalúa alertas contra las cotizaciones actuales.
// history = state.history, usado para variacion/extremo/tendencia.
//
// @param {Object} cotizaciones  { oficial, blue, mep, ccl }
// @param {Array}  history       Snapshots del estado actual
// @returns {Array} [{ alert, tipo, precio, mensaje }]

function evalAlertas(cotizaciones, history = []) {
  if (!cotizaciones || typeof cotizaciones !== 'object') {
    console.warn('[evalAlertas] cotizaciones inválidas, omitiendo evaluación');
    return [];
  }

  // Lee SIEMPRE desde localStorage para reflejar eliminaciones inmediatas.
  // No usar una copia en memoria — así una alerta borrada no vuelve a dispararse.
  const alertas = getAlertas();
  console.log(`[evalAlertas] evaluando ${alertas.length} alerta(s) activa(s)`);
  const triggered = [];

  for (const alert of alertas) {
    try {
    if (alert.triggered && !alert.repeating) continue;

    const prices = cotizaciones[alert.tipo];
    if (!prices) continue;
    const precioActual = prices[alert.campo];
    if (precioActual == null) continue;

    const tipAlerta = alert.tipAlerta || 'umbral';
    let fired   = false;
    let mensaje = '';

    // ── Umbral ────────────────────────────────────────────────────
    if (tipAlerta === 'umbral') {
      fired =
        (alert.condicion === 'baja' && precioActual <= alert.valor) ||
        (alert.condicion === 'sube' && precioActual >= alert.valor);
      if (fired) {
        const dir = alert.condicion === 'baja' ? 'bajó a' : 'subió a';
        mensaje = `${TIPO_LABEL[alert.tipo]} ${alert.campo} ${dir} $${precioActual.toLocaleString('es-AR')}`;
      }
    }

    // ── Variación % ───────────────────────────────────────────────
    else if (tipAlerta === 'variacion' && history.length >= 2) {
      const periodoMs = PERIODO_MS[alert.periodo] || PERIODO_MS['24h'];
      const targetTs  = Date.now() - periodoMs;
      const snaps     = history.filter(s => s[alert.tipo]?.[alert.campo] != null);
      if (snaps.length >= 2) {
        const snapOld   = snaps.reduce((b, s) =>
          Math.abs(s.ts - targetTs) < Math.abs(b.ts - targetTs) ? s : b, snaps[0]
        );
        const precioOld = snapOld[alert.tipo][alert.campo];
        if (precioOld && precioOld !== 0) {
          const pct = ((precioActual - precioOld) / precioOld) * 100;
          fired =
            (alert.condicion === 'sube' && pct >=  alert.porcentaje) ||
            (alert.condicion === 'baja' && pct <= -alert.porcentaje);
          if (fired) {
            const s = pct > 0 ? '+' : '';
            mensaje = `${TIPO_LABEL[alert.tipo]} varió ${s}${pct.toFixed(2)}% en ${alert.periodo}`;
          }
        }
      }
    }

    // ── Extremo ───────────────────────────────────────────────────
    else if (tipAlerta === 'extremo' && history.length >= 10) {
      const periodoMs = PERIODO_MS[alert.periodo] || PERIODO_MS['7d'];
      const fromTs    = Date.now() - periodoMs;
      const vals = history
        .filter(s => s.ts >= fromTs && s[alert.tipo]?.[alert.campo] != null)
        .map(s => s[alert.tipo][alert.campo]);
      if (vals.length >= 5) {
        const extremoVal = alert.extremo === 'minimo' ? Math.min(...vals) : Math.max(...vals);
        const diff = Math.abs(precioActual - extremoVal) / extremoVal;
        fired = diff < 0.002;
        if (fired) {
          const lbl = alert.extremo === 'minimo' ? 'mínimo' : 'máximo';
          mensaje = `${TIPO_LABEL[alert.tipo]} tocó ${lbl} de ${alert.periodo}: $${precioActual.toLocaleString('es-AR')}`;
        }
      }
    }

    // ── Tendencia ─────────────────────────────────────────────────
    else if (tipAlerta === 'tendencia' && history.length >= 4) {
      const n = (alert.consecutivos || 3) + 1;
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
          mensaje = `${TIPO_LABEL[alert.tipo]} tendencia ${lbl}: $${precioActual.toLocaleString('es-AR')}`;
        }
      }
    }

    if (fired) {
      triggerAlerta(alert.id);
      triggered.push({ alert, tipo: alert.tipo, precio: precioActual, mensaje });
    }
    } catch (err) {
      console.error('[evalAlertas] error evaluando alerta', alert?.id, err);
    }
  }

  return triggered;
}

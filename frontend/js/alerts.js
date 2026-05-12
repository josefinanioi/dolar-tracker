// ─── Gestión de alertas ───────────────────────────────────────────
// Fuente de verdad: localStorage. Sync opcional con backend en background.

const ALERTS_KEY      = 'dolar-ar-alerts';
const USER_KEY        = 'dolar-ar-userid';
const LAST_PRICES_KEY = 'dolar-ar-last-prices'; // { 'tipo.campo': number }

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

// ── Últimos precios (detección de cruce de umbral) ────────────────
//
// Guardamos el precio de cada tipo.campo al final de cada evalAlertas().
// En el siguiente ciclo comparamos precio_anterior vs precio_actual para
// saber si el precio "cruzó" el umbral (no solo si está por encima/debajo).

function _getLastPrices() {
  try { return JSON.parse(localStorage.getItem(LAST_PRICES_KEY) || '{}'); }
  catch { return {}; }
}

function _saveLastPrices(cotizaciones) {
  const map = {};
  for (const tipo of ['oficial', 'blue', 'mep', 'ccl']) {
    const prices = cotizaciones[tipo];
    if (!prices) continue;
    if (prices.compra != null) map[`${tipo}.compra`] = prices.compra;
    if (prices.venta  != null) map[`${tipo}.venta`]  = prices.venta;
  }
  try { localStorage.setItem(LAST_PRICES_KEY, JSON.stringify(map)); }
  catch {}
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

// ── Migración: normaliza campos numéricos que puedan haber quedado como strings ──
// Pasa cada vez que se lee — barato y defensivo.
function _normalizarNumerosAlerta(a) {
  if (a.valor       != null) a.valor        = Number(a.valor);
  if (a.porcentaje  != null) a.porcentaje   = Number(a.porcentaje);
  if (a.consecutivos != null) a.consecutivos = Number(a.consecutivos);
  return a;
}

function getAlertas() {
  try {
    const raw  = localStorage.getItem(ALERTS_KEY);
    const list = JSON.parse(raw || '[]');
    return list.map(a => _normalizarNumerosAlerta({ ...a, tipo: migrarTipo(a.tipo) }));
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

  // Contar cuántas veces se ejecuta por ciclo de vida de la página.
  // Si aparece más de 1 en el mismo segundo → hay loops/listeners duplicados.
  console.count('[evalAlertas] ejecutado');

  // Lee SIEMPRE desde localStorage para reflejar eliminaciones inmediatas.
  // getAlertas() normaliza campos numéricos en cada lectura (ver _normalizarNumerosAlerta).
  const alertas    = getAlertas();
  const lastPrices = _getLastPrices(); // precios del ciclo anterior

  console.log(`[evalAlertas] ${alertas.length} alerta(s) en localStorage:`,
    alertas.map(a => ({
      id:         a.id,
      tipAlerta:  a.tipAlerta,
      condicion:  a.condicion,
      valor:      a.valor,
      tipoValor:  typeof a.valor,
      triggered:  a.triggered,
      repeating:  a.repeating,
    }))
  );

  const triggered = [];

  for (const alert of alertas) {
    try {
      // ── Alertas no-repetibles ya disparadas: ignorar para siempre ─
      if (alert.triggered && !alert.repeating) continue;

      const prices = cotizaciones[alert.tipo];
      if (!prices) continue;

      // ── Normalización numérica estricta ────────────────────────
      // Aunque getAlertas() ya normaliza, coercemos de nuevo aquí por seguridad.
      // Esto cubre cotizaciones que vengan con strings desde la API.
      const precioRaw    = prices[alert.campo];
      const precioActual = Number(precioRaw);

      if (precioRaw == null || Number.isNaN(precioActual)) {
        console.warn('[evalAlertas] precioActual inválido', { tipo: alert.tipo, campo: alert.campo, precioRaw });
        continue;
      }

      const tipAlerta = alert.tipAlerta || 'umbral';
      let fired   = false;
      let mensaje = '';

      // ── Umbral ──────────────────────────────────────────────────
      //
      // Lógica de CRUCE DE UMBRAL:
      //   "baja de X" → dispara SOLO cuando el precio cruza X hacia abajo
      //                 (precio anterior ≥ X, precio actual < X)
      //   "sube de X" → dispara SOLO cuando el precio cruza X hacia arriba
      //                 (precio anterior ≤ X, precio actual > X)
      //
      // Para alertas repetibles:
      //   - Una vez disparada (triggered=true), NO vuelve a disparar mientras
      //     el precio siga en la zona de disparo.
      //   - Se auto-resetea cuando el precio vuelve a la "zona segura".
      //   - Luego puede dispararse nuevamente en el próximo cruce.
      //
      if (tipAlerta === 'umbral') {
        // Coerción explícita — alert.valor pudo persistir como string en localStorage
        const valorObjetivo = Number(alert.valor);

        if (Number.isNaN(valorObjetivo)) {
          console.warn('[evalAlertas] alert.valor inválido, saltando', { alertaId: alert.id, valor: alert.valor, tipoValor: typeof alert.valor });
          continue;
        }

        const key              = `${alert.tipo}.${alert.campo}`;
        const precioAnteriorRaw = lastPrices[key];
        const precioAnterior    = precioAnteriorRaw != null ? Number(precioAnteriorRaw) : null;

        // ── LOG DETALLADO DE COMPARACIÓN ────────────────────────
        console.log('[evalAlertas] umbral check', {
          alertaId:    alert.id,
          condicion:   alert.condicion,
          precio:      precioActual,
          tipoPrecio:  typeof precioActual,
          objetivo:    valorObjetivo,
          tipoObjetivo: typeof valorObjetivo,
          precioPrevio: precioAnterior,
          triggered:   alert.triggered,
          repeating:   alert.repeating,
        });

        if (alert.condicion === 'baja') {
          const ahoraBajo = precioActual < valorObjetivo; // ESTRICTO — NO <=
          console.log(`[evalAlertas] comparación: ${precioActual} < ${valorObjetivo} = ${ahoraBajo}`);

          // Auto-reset para repetibles: precio volvió a zona segura (≥ umbral)
          if (alert.triggered && alert.repeating && !ahoraBajo) {
            console.log(`[evalAlertas] auto-reset alerta ${alert.id}: ${precioActual} ≥ ${valorObjetivo}`);
            resetAlerta(alert.id);
            alert.triggered = false; // sincronizar copia local
          }

          // Cruce descendente: ahora < umbral, Y antes estaba ≥ umbral (o primer ciclo)
          if (ahoraBajo && !alert.triggered) {
            const cruzó = (precioAnterior === null) || (precioAnterior >= valorObjetivo);
            console.log(`[evalAlertas] cruce "baja": ahoraBajo=${ahoraBajo}, precioAnterior=${precioAnterior}, cruzó=${cruzó}`);
            fired = cruzó;
          }

          if (fired) {
            const ant = precioAnterior !== null ? `$${precioAnterior.toLocaleString('es-AR')} → ` : '';
            mensaje = `${TIPO_LABEL[alert.tipo]} ${alert.campo} bajó de $${valorObjetivo.toLocaleString('es-AR')} (${ant}$${precioActual.toLocaleString('es-AR')})`;
          }
        }

        else if (alert.condicion === 'sube') {
          const ahoraArriba = precioActual > valorObjetivo; // ESTRICTO — NO >=
          console.log(`[evalAlertas] comparación: ${precioActual} > ${valorObjetivo} = ${ahoraArriba}`);

          // Auto-reset para repetibles: precio volvió a zona segura (≤ umbral)
          if (alert.triggered && alert.repeating && !ahoraArriba) {
            console.log(`[evalAlertas] auto-reset alerta ${alert.id}: ${precioActual} ≤ ${valorObjetivo}`);
            resetAlerta(alert.id);
            alert.triggered = false;
          }

          // Cruce ascendente: ahora > umbral, Y antes estaba ≤ umbral (o primer ciclo)
          if (ahoraArriba && !alert.triggered) {
            const cruzó = (precioAnterior === null) || (precioAnterior <= valorObjetivo);
            console.log(`[evalAlertas] cruce "sube": ahoraArriba=${ahoraArriba}, precioAnterior=${precioAnterior}, cruzó=${cruzó}`);
            fired = cruzó;
          }

          if (fired) {
            const ant = precioAnterior !== null ? `$${precioAnterior.toLocaleString('es-AR')} → ` : '';
            mensaje = `${TIPO_LABEL[alert.tipo]} ${alert.campo} subió de $${valorObjetivo.toLocaleString('es-AR')} (${ant}$${precioActual.toLocaleString('es-AR')})`;
          }
        }
      }

      // ── Variación % ─────────────────────────────────────────────
      else if (tipAlerta === 'variacion' && history.length >= 2) {
        const porcentaje = Number(alert.porcentaje);
        if (Number.isNaN(porcentaje)) continue;

        const periodoMs = PERIODO_MS[alert.periodo] || PERIODO_MS['24h'];
        const targetTs  = Date.now() - periodoMs;
        const snaps     = history.filter(s => s[alert.tipo]?.[alert.campo] != null);
        if (snaps.length >= 2) {
          const snapOld   = snaps.reduce((b, s) =>
            Math.abs(s.ts - targetTs) < Math.abs(b.ts - targetTs) ? s : b, snaps[0]
          );
          const precioOld = Number(snapOld[alert.tipo][alert.campo]);
          if (!Number.isNaN(precioOld) && precioOld !== 0) {
            const pct     = ((precioActual - precioOld) / precioOld) * 100;
            const condMet =
              (alert.condicion === 'sube' && pct >=  porcentaje) ||
              (alert.condicion === 'baja' && pct <= -porcentaje);

            // Auto-reset para repetibles: condición dejó de cumplirse
            if (alert.triggered && alert.repeating && !condMet) {
              resetAlerta(alert.id);
              alert.triggered = false;
            }

            fired = condMet && !alert.triggered;
            if (fired) {
              const s = pct > 0 ? '+' : '';
              mensaje = `${TIPO_LABEL[alert.tipo]} varió ${s}${pct.toFixed(2)}% en ${alert.periodo}`;
            }
          }
        }
      }

      // ── Extremo ─────────────────────────────────────────────────
      else if (tipAlerta === 'extremo' && history.length >= 10) {
        const periodoMs = PERIODO_MS[alert.periodo] || PERIODO_MS['7d'];
        const fromTs    = Date.now() - periodoMs;
        const vals = history
          .filter(s => s.ts >= fromTs && s[alert.tipo]?.[alert.campo] != null)
          .map(s => Number(s[alert.tipo][alert.campo]))
          .filter(v => !Number.isNaN(v));
        if (vals.length >= 5) {
          const extremoVal = alert.extremo === 'minimo' ? Math.min(...vals) : Math.max(...vals);
          const diff       = Math.abs(precioActual - extremoVal) / extremoVal;
          const condMet    = diff < 0.002;

          // Auto-reset para repetibles
          if (alert.triggered && alert.repeating && !condMet) {
            resetAlerta(alert.id);
            alert.triggered = false;
          }

          fired = condMet && !alert.triggered;
          if (fired) {
            const lbl = alert.extremo === 'minimo' ? 'mínimo' : 'máximo';
            mensaje = `${TIPO_LABEL[alert.tipo]} tocó ${lbl} de ${alert.periodo}: $${precioActual.toLocaleString('es-AR')}`;
          }
        }
      }

      // ── Tendencia ────────────────────────────────────────────────
      else if (tipAlerta === 'tendencia' && history.length >= 4) {
        const n      = (Number(alert.consecutivos) || 3) + 1;
        const recent = history
          .filter(s => s[alert.tipo]?.[alert.campo] != null)
          .slice(-n)
          .map(s => Number(s[alert.tipo][alert.campo]))
          .filter(v => !Number.isNaN(v));
        if (recent.length >= n) {
          const esSubida = recent.every((v, i) => i === 0 || v > recent[i - 1]);
          const esBajada = recent.every((v, i) => i === 0 || v < recent[i - 1]);
          const condMet  =
            (alert.tendencia === 'subiendo' && esSubida) ||
            (alert.tendencia === 'bajando'  && esBajada);

          // Auto-reset para repetibles: tendencia rota
          if (alert.triggered && alert.repeating && !condMet) {
            resetAlerta(alert.id);
            alert.triggered = false;
          }

          fired = condMet && !alert.triggered;
          if (fired) {
            const lbl = alert.tendencia === 'subiendo' ? 'alcista' : 'bajista';
            mensaje = `${TIPO_LABEL[alert.tipo]} tendencia ${lbl}: $${precioActual.toLocaleString('es-AR')}`;
          }
        }
      }

      if (fired) {
        console.log(`[evalAlertas] 🔔 DISPARO alerta ${alert.id}: ${mensaje}`);
        triggerAlerta(alert.id);
        triggered.push({ alert, tipo: alert.tipo, precio: precioActual, mensaje });
      }

    } catch (err) {
      console.error('[evalAlertas] error evaluando alerta', alert?.id, err);
    }
  }

  // Guardar precios actuales como referencia para el próximo ciclo
  _saveLastPrices(cotizaciones);

  return triggered;
}

// ── Helpers de debug (disponibles en consola del navegador) ───────────
//
//   window._alertasDebug.estado()         → muestra alertas + lastPrices
//   window._alertasDebug.limpiarPrecios() → resetea lastPrices (útil para forzar re-cruce)
//   window._alertasDebug.limpiarAlertas() → borra TODAS las alertas de localStorage
//
window._alertasDebug = {
  estado() {
    console.table(getAlertas().map(a => ({
      id: a.id, tipo: a.tipo, campo: a.campo, tipAlerta: a.tipAlerta,
      condicion: a.condicion, valor: a.valor, tipoValor: typeof a.valor,
      triggered: a.triggered, repeating: a.repeating,
    })));
    console.log('lastPrices:', _getLastPrices());
  },
  limpiarPrecios() {
    localStorage.removeItem(LAST_PRICES_KEY);
    console.log('[debug] lastPrices borrado — el próximo ciclo considera todos los precios como "primer cruce"');
  },
  limpiarAlertas() {
    localStorage.removeItem(ALERTS_KEY);
    localStorage.removeItem(LAST_PRICES_KEY);
    console.log('[debug] TODAS las alertas y precios borrados de localStorage');
  },
};

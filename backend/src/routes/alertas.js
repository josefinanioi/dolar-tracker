const router = require('express').Router();
const storage = require('../storage');

// ── Validaciones ──────────────────────────────────────────────────────────────

const TIPOS_VALIDOS      = ['blue', 'oficial', 'mep', 'ccl'];
const CAMPOS_VALIDOS     = ['compra', 'venta'];
const TIP_ALERTA_VALIDOS = ['umbral', 'variacion', 'extremo', 'tendencia'];
const CONDICIONES_VALIDAS = ['baja', 'sube'];
const PERIODOS_VALIDOS   = ['1h', '24h', '7d', '30d'];

function validationError(res, msg) {
  return res.status(400).json({ error: msg });
}

// ── Rutas ─────────────────────────────────────────────────────────────────────

router.get('/:userId', (req, res) => {
  const alerts = storage.getAlerts().filter(a => a.userId === req.params.userId);
  res.json(alerts);
});

router.post('/', (req, res) => {
  const { userId, tipo, campo, tipAlerta = 'umbral', repeating, ...rest } = req.body;

  // Campos comunes
  if (!userId)
    return validationError(res, 'userId requerido');
  if (!TIPOS_VALIDOS.includes(tipo))
    return validationError(res, `tipo inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}`);
  if (!CAMPOS_VALIDOS.includes(campo))
    return validationError(res, 'campo debe ser "compra" o "venta"');
  if (!TIP_ALERTA_VALIDOS.includes(tipAlerta))
    return validationError(res, `tipAlerta inválido. Válidos: ${TIP_ALERTA_VALIDOS.join(', ')}`);

  // Validar campos específicos de cada tipo
  if (tipAlerta === 'umbral') {
    if (!CONDICIONES_VALIDAS.includes(rest.condicion))
      return validationError(res, 'condicion debe ser "baja" o "sube"');
    if (rest.valor == null || isNaN(rest.valor))
      return validationError(res, 'valor numérico requerido');
  }

  if (tipAlerta === 'variacion') {
    if (!CONDICIONES_VALIDAS.includes(rest.condicion))
      return validationError(res, 'condicion debe ser "baja" o "sube"');
    if (!rest.porcentaje || isNaN(rest.porcentaje) || rest.porcentaje <= 0)
      return validationError(res, 'porcentaje > 0 requerido');
    if (!PERIODOS_VALIDOS.includes(rest.periodo))
      return validationError(res, `periodo inválido. Válidos: ${PERIODOS_VALIDOS.join(', ')}`);
  }

  if (tipAlerta === 'extremo') {
    if (!['minimo', 'maximo'].includes(rest.extremo))
      return validationError(res, 'extremo debe ser "minimo" o "maximo"');
    if (!PERIODOS_VALIDOS.includes(rest.periodo))
      return validationError(res, `periodo inválido. Válidos: ${PERIODOS_VALIDOS.join(', ')}`);
  }

  if (tipAlerta === 'tendencia') {
    if (!['subiendo', 'bajando'].includes(rest.tendencia))
      return validationError(res, 'tendencia debe ser "subiendo" o "bajando"');
  }

  // Normalizar números
  const numericFields = ['valor', 'porcentaje', 'consecutivos'];
  const normalizedRest = Object.fromEntries(
    Object.entries(rest).map(([k, v]) =>
      numericFields.includes(k) ? [k, parseFloat(v)] : [k, v]
    )
  );

  const alert = storage.createAlert({
    userId,
    tipo,
    campo,
    tipAlerta,
    repeating: Boolean(repeating),
    ...normalizedRest,
  });

  res.status(201).json(alert);
});

router.delete('/:id', (req, res) => {
  storage.deleteAlert(req.params.id);
  res.json({ success: true });
});

router.patch('/:id/reset', (req, res) => {
  storage.resetAlert(req.params.id);
  res.json({ success: true });
});

module.exports = router;

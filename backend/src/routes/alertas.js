const router = require('express').Router();
const storage = require('../storage');

// Tipos válidos: ahora usando las claves del nuevo formato unificado
const TIPOS_VALIDOS     = ['blue', 'oficial', 'mep', 'ccl'];
const CAMPOS_VALIDOS    = ['compra', 'venta'];
const CONDICIONES_VALIDAS = ['baja', 'sube'];

router.get('/:userId', (req, res) => {
  const alerts = storage.getAlerts().filter(a => a.userId === req.params.userId);
  res.json(alerts);
});

router.post('/', (req, res) => {
  const { userId, tipo, campo, condicion, valor, repeating } = req.body;

  if (!userId || !tipo || !campo || !condicion || valor == null)
    return res.status(400).json({ error: 'Faltan campos: userId, tipo, campo, condicion, valor' });
  if (!TIPOS_VALIDOS.includes(tipo))
    return res.status(400).json({ error: `tipo inválido. Valores válidos: ${TIPOS_VALIDOS.join(', ')}` });
  if (!CAMPOS_VALIDOS.includes(campo))
    return res.status(400).json({ error: 'campo debe ser "compra" o "venta"' });
  if (!CONDICIONES_VALIDAS.includes(condicion))
    return res.status(400).json({ error: 'condicion debe ser "baja" o "sube"' });

  const alert = storage.createAlert({
    userId,
    tipo,
    campo,
    condicion,
    valor:     parseFloat(valor),
    repeating: Boolean(repeating),
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

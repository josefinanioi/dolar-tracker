require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { init: initPush } = require('./pushService');
const { start: startScheduler } = require('./scheduler');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

app.use('/api/cotizaciones', require('./routes/cotizaciones'));
app.use('/api/alertas', require('./routes/alertas'));
app.use('/api/push', require('./routes/push'));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  initPush();
  startScheduler();
});

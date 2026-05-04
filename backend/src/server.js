require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { init: initPush } = require('./pushService');
const { start: startScheduler } = require('./scheduler');

const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim())
  : ['*'];

app.use(cors({
  origin: (origin, cb) => {
    // Permitir requests sin origin (curl, Postman, apps móviles)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado para origin: ${origin}`));
  },
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

# 💵 Dólar AR – PWA de seguimiento del dólar en Argentina

Aplicación web progresiva que muestra cotizaciones en tiempo real (Blue, Oficial, MEP, CCL) con alertas personalizadas y notificaciones push.

## Arquitectura

```
dolar-tracker/
├── backend/          # Node.js + Express (deploy en Render)
│   ├── src/
│   │   ├── server.js
│   │   ├── dolar.js        # Consume DolarAPI
│   │   ├── storage.js      # Persistencia en JSON
│   │   ├── scheduler.js    # Cron cada 5 minutos
│   │   ├── pushService.js  # Web Push (web-push)
│   │   └── routes/
│   │       ├── cotizaciones.js
│   │       ├── alertas.js
│   │       └── push.js
│   └── generate-vapid.js
└── frontend/         # PWA estática (deploy en Vercel)
    ├── index.html
    ├── manifest.json
    ├── sw.js           # Service Worker
    ├── config.js       # URL del backend
    └── js/
        ├── api.js
        ├── alerts.js
        ├── notifications.js
        ├── chart.js
        └── app.js
```

---

## Instalación local (paso a paso)

### 1. Clonar / descomprimir el proyecto

```bash
cd dolar-tracker
```

### 2. Backend

```bash
cd backend
npm install

# Copiar el archivo de variables de entorno
cp .env.example .env
```

Editar `.env` con tus datos, **generando primero las claves VAPID**:

```bash
npm run generate-vapid
# Copia VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY al .env
```

Iniciar el servidor:

```bash
npm run dev      # desarrollo (nodemon)
npm start        # producción
```

El backend corre en `http://localhost:3001`.

### 3. Frontend

El frontend es HTML/CSS/JS puro — no necesita build. Solo servilo con cualquier servidor estático.

**Opción A – VS Code Live Server:**  
Abrí `frontend/index.html` con la extensión Live Server.

**Opción B – `npx serve`:**

```bash
cd frontend
npx serve . -p 5500
```

**Opción C – Python:**

```bash
cd frontend
python -m http.server 5500
```

Abrir: `http://localhost:5500`

### 4. Generar íconos PWA

Abrir `frontend/generate-icons.html` en el navegador → **Descargar todos** → mover los PNG descargados a `frontend/icons/`.

### 5. Conectar frontend con backend (opcional)

Editar `frontend/config.js`:

```js
const CONFIG = {
  BACKEND_URL: 'http://localhost:3001',  // <── agregar
  ...
};
```

Con el backend conectado se habilitan: historial de 24hs, push notifications del servidor y sincronización de alertas.

> **Modo standalone** (sin backend): el frontend llama a DolarAPI directamente, las alertas se guardan en `localStorage` y las notificaciones son locales del navegador.

---

## Deploy en producción

### Backend → Render.com

1. Crear cuenta en [render.com](https://render.com) → **New Web Service**
2. Conectar el repositorio (o usar deploy manual)
3. Configurar:
   - **Build command:** `cd backend && npm install`
   - **Start command:** `cd backend && npm start`
4. Agregar **Environment Variables** en el dashboard de Render:
   ```
   VAPID_EMAIL=tu@email.com
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   FRONTEND_URL=https://tu-app.vercel.app
   ```
5. Copiar la URL pública del servicio (ej: `https://dolar-ar-api.onrender.com`)

### Frontend → Vercel

1. Crear cuenta en [vercel.com](https://vercel.com) → **New Project**
2. Subir la carpeta `frontend/` (o conectar repo)
3. **Antes del deploy**, editar `frontend/config.js`:
   ```js
   const CONFIG = {
     BACKEND_URL: 'https://dolar-ar-api.onrender.com',
     ...
   };
   ```
4. Deploy — Vercel sirve archivos estáticos con HTTPS automático ✓

> HTTPS es **obligatorio** para Service Workers y Web Push.

---

## API del backend

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/cotizaciones` | Cotizaciones actuales |
| `GET` | `/api/cotizaciones/historial` | Snapshots de las últimas 24hs |
| `GET` | `/api/alertas/:userId` | Alertas de un usuario |
| `POST` | `/api/alertas` | Crear alerta |
| `DELETE` | `/api/alertas/:id` | Eliminar alerta |
| `PATCH` | `/api/alertas/:id/reset` | Reactivar alerta disparada |
| `GET` | `/api/push/vapid-public-key` | Clave pública VAPID |
| `POST` | `/api/push/subscribe` | Registrar suscripción push |
| `DELETE` | `/api/push/subscribe/:userId` | Cancelar suscripción |

**Cuerpo para crear alerta:**

```json
{
  "userId": "u-...",
  "tipo": "blue",
  "campo": "venta",
  "condicion": "sube",
  "valor": 1100,
  "repeating": false
}
```

Tipos válidos: `blue`, `oficial`, `bolsa`, `contadoconliqui`

---

## Fuente de datos

[DolarAPI](https://dolarapi.com) — API pública y gratuita, sin auth requerida.

---

## Notas de seguridad para producción

- Configurar `FRONTEND_URL` en `.env` con el dominio exacto (no `*`)
- Las claves VAPID son sensibles — nunca commitearlas al repositorio
- Agregar `.env` y `data/` al `.gitignore`

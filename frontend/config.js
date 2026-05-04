// ─────────────────────────────────────────────────────────────────
// Configuración de Dólar AR
// Cambiar BACKEND_URL con tu URL de Render en producción:
//   const CONFIG = { BACKEND_URL: 'https://mi-backend.onrender.com', ... }
// Si BACKEND_URL está vacío, el frontend llama a DolarAPI directamente
// (sin historial ni push notifications del servidor).
// ─────────────────────────────────────────────────────────────────
const CONFIG = {
  BACKEND_URL: 'https://dolar-ar-api.onrender.com',
  DOLAR_API_URL: 'https://dolarapi.com/v1',
  UPDATE_INTERVAL: 5 * 60 * 1000,
};

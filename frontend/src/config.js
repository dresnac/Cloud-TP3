const env = import.meta.env;

export const config = {
  apiUrl: (env.VITE_API_URL || "").replace(/\/$/, ""),
  userPoolId: env.VITE_USER_POOL_ID || "",
  clientIds: {
    cliente: env.VITE_CLIENT_ID_CLIENTE || "",
    repartidor: env.VITE_CLIENT_ID_REPARTIDOR || "",
  },
  ofertaTimeoutSegundos: Number(env.VITE_OFERTA_TIMEOUT_SEGUNDOS || 60),
  // Cuánto se sigue buscando repartidor antes de cancelar el pedido.
  esperaRepartidorSegundos: Number(env.VITE_ESPERA_REPARTIDOR_SEGUNDOS || 300),
  // Endpoint de Cognito. Solo se cambia para probar contra un mock local;
  // vacío, la librería usa el de la región del User Pool.
  cognitoUrl: env.VITE_COGNITO_URL || undefined,
};

export const configCompleta = Boolean(
  config.apiUrl && config.userPoolId && config.clientIds.cliente && config.clientIds.repartidor
);

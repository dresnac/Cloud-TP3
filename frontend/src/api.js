// Cliente de la API de la plataforma (API Gateway + autorizador JWT de Cognito).
import { config } from "./config";
import { idToken, SesionVencida } from "./auth";

export class ApiError extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// La sesión venció o el token fue rechazado: la app vuelve al login.
function sesionVencida(app) {
  window.dispatchEvent(new CustomEvent("sesion-vencida", { detail: app }));
}

export async function api(app, metodo, ruta, cuerpo) {
  let token;
  try {
    token = await idToken(app);
  } catch (e) {
    if (e instanceof SesionVencida) sesionVencida(app);
    throw e;
  }
  const r = await fetch(`${config.apiUrl}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401) sesionVencida(app);
    const mensaje = datos?.error || datos?.message || `Error ${r.status}`;
    throw new ApiError(r.status, mensaje);
  }
  return datos;
}

// Sube la foto directo a S3 con el POST prefirmado que devuelve la API (sin pasar
// por la API). Los `fields` llevan la policy firmada (tipo image/jpeg, hasta 5 MB)
// y tienen que ir antes del archivo, que S3 exige como último campo del form.
export async function subirAS3({ url, fields }, blob) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", blob);
  const r = await fetch(url, { method: "POST", body: form });
  if (!r.ok) throw new Error(`S3 rechazó la subida (${r.status})`);
}

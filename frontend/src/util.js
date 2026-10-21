import { useEffect, useRef, useState, useCallback } from "react";

// Las fechas llegan de PostgreSQL como "2026-10-19 12:00:00.123456+00:00".
export function parseFecha(texto) {
  if (!texto) return null;
  const iso = String(texto).replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

export function hora(texto) {
  const d = parseFecha(texto);
  return d ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
}

export function fechaHora(texto) {
  const d = parseFecha(texto);
  return d ? d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23" }) : "";
}

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
export const precio = (v) => pesos.format(Number(v || 0));

// Distancia en metros entre dos puntos {lat, lng}.
export function distancia(a, b) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Ejecuta `fn` al montar y cada `ms`. Devuelve { datos, error, cargando, recargar }.
// Con activo = false no consulta.
export function usePolling(fn, ms, deps = [], activo = true) {
  const [estado, setEstado] = useState({ datos: undefined, error: null, cargando: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const recargar = useCallback(async () => {
    try {
      const datos = await fnRef.current();
      setEstado({ datos, error: null, cargando: false });
    } catch (error) {
      setEstado((e) => ({ ...e, error, cargando: false }));
    }
  }, []);

  useEffect(() => {
    if (!activo) return undefined;
    recargar();
    if (!ms) return undefined;
    const id = setInterval(recargar, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, activo, ms]);

  return { ...estado, recargar };
}

// Fuerza un re-render cada `ms` (para cuentas regresivas).
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

// Convierte cualquier imagen a JPEG (el comprobante se firma como image/jpeg) y la achica.
export async function aJpeg(archivo, maxLado = 1600) {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, mal) =>
    canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo convertir la imagen"))), "image/jpeg", 0.85)
  );
}

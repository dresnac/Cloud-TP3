// Rutas por calles con OSRM (Open Source Routing Machine) sobre datos de
// OpenStreetMap, el mismo origen que los tiles del mapa y Nominatim.
// Es un servidor público de demostración, sin garantías: si no responde, quien
// llama sigue en línea recta. Por eso cada ruta se pide una sola vez y se guarda.
import { distancia } from "./util";

const BASE = "https://router.project-osrm.org/route/v1/driving";
const TIEMPO_MAX_MS = 5000;
const memoria = new Map();

// paradas: [{ lat, lng }, ...] (al menos dos). Devuelve los puntos de la ruta,
// empezando y terminando exactamente en la primera y la última parada, o null.
export function rutaPorCalles(paradas) {
  const coords = paradas.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  if (!memoria.has(coords)) {
    const pedido = pedirRuta(coords).then((puntos) => {
      if (!puntos) memoria.delete(coords); // se puede reintentar más tarde
      return puntos && [paradas[0], ...puntos, paradas[paradas.length - 1]];
    });
    memoria.set(coords, pedido);
  }
  return memoria.get(coords);
}

async function pedirRuta(coords) {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), TIEMPO_MAX_MS);
  try {
    const r = await fetch(`${BASE}/${coords}?overview=full&geometries=geojson`, { signal: control.signal });
    if (!r.ok) return null;
    const datos = await r.json();
    const ruta = datos.code === "Ok" && datos.routes?.[0];
    return ruta ? ruta.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(corte);
  }
}

export function largo(puntos) {
  let m = 0;
  for (let i = 1; i < puntos.length; i++) m += distancia(puntos[i - 1], puntos[i]);
  return m;
}

// Proyección de `p` sobre el tramo a-b (aproximación plana, suficiente a escala de ciudad).
function proyectar(p, a, b) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = a.lng * k, ay = a.lat, bx = b.lng * k, by = b.lat, px = p.lng * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// Lo que queda de la ruta a partir de la posición `p`: busca el tramo más cercano
// y devuelve [p, ...puntos que siguen]. `desvio` es la distancia de p a la ruta.
export function restoDeRuta(puntos, p) {
  let mejor = { desvio: Infinity, i: 0 };
  for (let i = 1; i < puntos.length; i++) {
    const d = distancia(p, proyectar(p, puntos[i - 1], puntos[i]));
    if (d < mejor.desvio) mejor = { desvio: d, i };
  }
  return { puntos: [p, ...puntos.slice(mejor.i)], desvio: mejor.desvio };
}

// Avanza `metros` sobre la ruta desde el punto `i` (el próximo a alcanzar).
// Devuelve la nueva posición, el nuevo índice y si llegó al final.
export function avanzar(puntos, pos, i, metros) {
  let actual = pos;
  let resto = metros;
  while (i < puntos.length) {
    const d = distancia(actual, puntos[i]);
    if (d > resto) {
      const f = resto / d;
      return { pos: { lat: actual.lat + (puntos[i].lat - actual.lat) * f, lng: actual.lng + (puntos[i].lng - actual.lng) * f }, i, llego: false };
    }
    resto -= d;
    actual = puntos[i];
    i += 1;
  }
  return { pos: actual, i, llego: true };
}

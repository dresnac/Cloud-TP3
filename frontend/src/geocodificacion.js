// Direcciones <-> coordenadas con Nominatim (OpenStreetMap), el mismo proveedor de
// los tiles del mapa. Es un servicio público: admite como mucho 1 consulta por
// segundo, por eso la búsqueda se hace con debounce y nunca en cada tecla.
import { distancia } from "./util";

const BASE = "https://nominatim.openstreetmap.org";

// "Avenida Callao 100, Balvanera" a partir del detalle que devuelve Nominatim.
function formatear(r) {
  const a = r.address || {};
  const calle = [a.road || a.pedestrian || a.footway, a.house_number].filter(Boolean).join(" ");
  const zona = a.suburb || a.neighbourhood || a.city_district || a.city || a.town;
  if (calle) return [calle, zona].filter(Boolean).join(", ");
  return r.display_name.split(",").slice(0, 2).join(",").trim();
}

async function pedir(ruta, params) {
  const url = `${BASE}/${ruta}?${new URLSearchParams({ format: "jsonv2", addressdetails: "1", "accept-language": "es", ...params })}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo consultar el buscador de direcciones.");
  return r.json();
}

// Hasta 5 resultados en Argentina, priorizando los cercanos a `cerca` ({lat, lng}).
export async function buscarDireccion(texto, cerca) {
  const params = { q: texto, countrycodes: "ar", limit: "5" };
  if (cerca) {
    const d = 0.15; // ~15 km alrededor del comercio
    params.viewbox = [cerca.lng - d, cerca.lat + d, cerca.lng + d, cerca.lat - d].join(",");
  }
  const resultados = (await pedir("search", params)).map((r) => ({
    direccion: formatear(r),
    lat: Number(r.lat),
    lng: Number(r.lon),
  }));
  // Nominatim devuelve a veces el mismo lugar dos veces (calle y edificio): se deja uno
  // por texto, y primero los más cercanos al comercio.
  const unicos = [...new Map(resultados.map((r) => [r.direccion, r])).values()];
  if (cerca) unicos.sort((a, b) => distancia(a, cerca) - distancia(b, cerca));
  return unicos;
}

// Dirección del punto, o null si Nominatim no encuentra nada ahí.
export async function direccionDe({ lat, lng }) {
  const r = await pedir("reverse", { lat: String(lat), lon: String(lng), zoom: "18" });
  return r && !r.error ? formatear(r) : null;
}

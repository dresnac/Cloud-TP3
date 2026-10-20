import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

const ETIQUETAS = {
  RECIBIDO: "Recibido",
  CREADO: "Buscando repartidor",
  ASIGNADO: "En camino",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
  DISPONIBLE: "Disponible",
  OCUPADO: "Ocupado",
  DESCONECTADO: "Desconectado",
};

export function Estado({ estado }) {
  return <span className={`estado estado-${(estado || "").toLowerCase()}`}>{ETIQUETAS[estado] || estado}</span>;
}

export function ErrorAviso({ error, onReintentar }) {
  if (!error) return null;
  return (
    <div className="aviso error">
      {error.message || String(error)}
      {onReintentar && (
        <button className="btn chico" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }) {
  return (
    <div className="cargando">
      <span className="spinner" /> {texto}
    </div>
  );
}

const COLORES = { comercio: "#ea580c", destino: "#2563eb", repartidor: "#16a34a", yo: "#16a34a" };

function Encuadre({ puntos }) {
  const map = useMap();
  const clave = puntos.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (puntos.length === 1) map.setView([puntos[0].lat, puntos[0].lng], 15);
    else if (puntos.length > 1) map.fitBounds(puntos.map((p) => [p.lat, p.lng]), { padding: [40, 40], maxZoom: 16 });
    // Solo re-encuadra cuando cambia el conjunto de puntos (redondeado).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map]);
  return null;
}

function Clicks({ onClick }) {
  useMapEvents({ click: (e) => onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

// puntos: [{ lat, lng, tipo: "comercio" | "destino" | "repartidor" | "yo", etiqueta }]
export function Mapa({ puntos, ruta, onClick, alto = 260 }) {
  const validos = puntos.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const centro = validos[0] || { lat: -34.6037, lng: -58.3816 };
  return (
    <div className="mapa" style={{ height: alto }}>
      <MapContainer center={[centro.lat, centro.lng]} zoom={14} scrollWheelZoom={false} style={{ height: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {ruta && <Polyline positions={ruta.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#64748b", dashArray: "6 6" }} />}
        {validos.map((p, i) => (
          <CircleMarker
            key={`${p.tipo}-${i}`}
            center={[p.lat, p.lng]}
            radius={p.tipo === "repartidor" || p.tipo === "yo" ? 10 : 8}
            pathOptions={{ color: "#fff", weight: 2, fillColor: COLORES[p.tipo] || "#334155", fillOpacity: 1 }}
          >
            {p.etiqueta && <Tooltip>{p.etiqueta}</Tooltip>}
          </CircleMarker>
        ))}
        <Encuadre puntos={validos} />
        <Clicks onClick={onClick} />
      </MapContainer>
    </div>
  );
}

export function Leyenda({ items }) {
  return (
    <div className="leyenda">
      {items.map((t) => (
        <span key={t.tipo}>
          <i style={{ background: COLORES[t.tipo] }} /> {t.texto}
        </span>
      ))}
    </div>
  );
}

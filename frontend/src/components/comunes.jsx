import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { Check, Cruz } from "./iconos";

const ETIQUETAS = {
  RECIBIDO: "Recibido",
  CREADO: "Buscando repartidor",
  ASIGNADO: "En camino",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
  DISPONIBLE: "Disponible",
  OCUPADO: "Con pedido",
  DESCONECTADO: "Desconectado",
};

export function Estado({ estado }) {
  return <span className={`estado estado-${(estado || "").toLowerCase()}`}>{ETIQUETAS[estado] || estado}</span>;
}

export function ErrorAviso({ error, onReintentar }) {
  if (!error) return null;
  return (
    <div className="aviso error" role="alert">
      <span>{error.message || String(error)}</span>
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

// Recorrido de un pedido. Un pedido cancelado corta la línea en el paso donde se canceló.
const PASOS = ["RECIBIDO", "CREADO", "ASIGNADO", "ENTREGADO"];

export function Pasos({ estado }) {
  const cancelado = estado === "CANCELADO";
  const actual = cancelado ? PASOS.indexOf("CREADO") : Math.max(0, PASOS.indexOf(estado));
  return (
    <ol className={`pasos ${cancelado ? "cortados" : ""}`}>
      {PASOS.map((p, i) => {
        const hecho = i < actual || (i === actual && estado === "ENTREGADO");
        const enCurso = i === actual && !hecho;
        const clase = hecho ? "hecho" : enCurso ? (cancelado ? "fallido" : "actual") : "";
        return (
          <li key={p} className={clase}>
            <span className="paso-marca">
              {hecho && <Check tam={14} />}
              {enCurso && cancelado && <Cruz tam={14} />}
            </span>
            <span className="paso-texto">{enCurso && cancelado ? "Cancelado" : ETIQUETAS[p]}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------ mapa
const ICONOS = {};
function icono(tipo) {
  if (!ICONOS[tipo]) {
    const movil = tipo === "repartidor" || tipo === "yo";
    ICONOS[tipo] = L.divIcon({
      className: "",
      html: movil ? `<span class="pin-movil pin-${tipo}"></span>` : `<span class="pin pin-${tipo}"><i></i></span>`,
      iconSize: movil ? [22, 22] : [28, 36],
      iconAnchor: movil ? [11, 11] : [14, 34],
      tooltipAnchor: movil ? [12, 0] : [14, -22],
    });
  }
  return ICONOS[tipo];
}

function Encuadre({ puntos }) {
  const map = useMap();
  const clave = puntos.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (puntos.length === 1) map.setView([puntos[0].lat, puntos[0].lng], 15);
    else if (puntos.length > 1) map.fitBounds(puntos.map((p) => [p.lat, p.lng]), { padding: [48, 48], maxZoom: 16 });
    // Solo re-encuadra cuando cambia el conjunto de puntos (redondeado).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map]);
  return null;
}

function Clicks({ onClick }) {
  useMapEvents({ click: (e) => onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Punto({ punto, onArrastrar }) {
  const arrastrable = Boolean(onArrastrar) && punto.tipo === "destino";
  const eventos = useMemo(
    () => ({
      dragend: (e) => {
        const { lat, lng } = e.target.getLatLng();
        onArrastrar?.({ lat, lng });
      },
    }),
    [onArrastrar]
  );
  return (
    <Marker position={[punto.lat, punto.lng]} icon={icono(punto.tipo)} draggable={arrastrable} eventHandlers={eventos}>
      {punto.etiqueta && <Tooltip>{punto.etiqueta}</Tooltip>}
    </Marker>
  );
}

// puntos: [{ lat, lng, tipo: "comercio" | "destino" | "repartidor" | "yo", etiqueta }]
// onClick y onArrastrar (solo el destino) permiten elegir un punto en el mapa.
export function Mapa({ puntos, ruta, onClick, onArrastrar, alto = 260 }) {
  const validos = puntos.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const centro = validos[0] || { lat: -34.6037, lng: -58.3816 };
  return (
    <div className={`mapa ${onClick ? "elegible" : ""}`} style={{ height: alto }}>
      <MapContainer center={[centro.lat, centro.lng]} zoom={14} scrollWheelZoom={false} style={{ height: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {ruta && <Polyline positions={ruta.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#6a7080", dashArray: "6 6" }} />}
        {validos.map((p, i) => (
          <Punto key={`${p.tipo}-${i}`} punto={p} onArrastrar={onArrastrar} />
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
          <i className={`marca-${t.tipo}`} /> {t.texto}
        </span>
      ))}
    </div>
  );
}

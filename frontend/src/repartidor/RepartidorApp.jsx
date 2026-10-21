import { useEffect, useRef, useState } from "react";
import { api, ApiError, subirAS3 } from "../api";
import { useSesion } from "../components/AppShell";
import { Cargando, ErrorAviso, Estado, Leyenda, Mapa } from "../components/comunes";
import { Camara } from "../components/iconos";
import { config } from "../config";
import { aJpeg, distancia, fechaHora, parseFecha, precio, usePolling, useTick } from "../util";

const SIM_TICK_MS = 5000; // cada cuánto se mueve y se envía la posición simulada
const SIM_PASO_M = 90; // metros por tick (~65 km/h: rápido a propósito para la demo)
const GPS_ENVIO_MS = 10000; // con GPS real, como mucho un envío cada 10 s
const CONFIRMACION_MAX_MS = 90000; // si la entrega no se confirma en este tiempo, se deja reintentar

function mover(desde, hacia, metros) {
  const d = distancia(desde, hacia);
  if (d <= metros) return { ...hacia };
  const f = metros / d;
  return { lat: desde.lat + (hacia.lat - desde.lat) * f, lng: desde.lng + (hacia.lng - desde.lng) * f };
}

// ---------------------------------------------------------------- estado
function TarjetaEstado({ estado, ocupado, onCambiar }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function cambiar(nuevo) {
    setEnviando(true);
    setError(null);
    try {
      await onCambiar(nuevo);
    } catch (e) {
      setError(e);
    } finally {
      setEnviando(false);
    }
  }

  const visible = ocupado ? "OCUPADO" : estado;
  return (
    <div className="tarjeta">
      <div className="encabezado">
        <h3>Tu estado</h3>
        <Estado estado={visible} />
      </div>
      {ocupado ? (
        <p className="muted chico">Tenés un pedido en curso. Cuando lo entregues volvés a quedar disponible.</p>
      ) : (
        <div className="segmentado">
          {["DISPONIBLE", "DESCONECTADO"].map((e) => (
            <button key={e} className={estado === e ? "activo" : ""} disabled={enviando} onClick={() => cambiar(e)}>
              <i className={`punto ${e === "DISPONIBLE" ? "punto-ok" : ""}`} /> {e === "DISPONIBLE" ? "Disponible" : "Desconectado"}
            </button>
          ))}
        </div>
      )}
      <ErrorAviso error={error} />
    </div>
  );
}

// ---------------------------------------------------------------- posición
function TarjetaPosicion({ modo, setModo, posicion, ultimoEnvio, errorEnvio, emitiendo, zonas, zona, setZona, pedido }) {
  const gpsDisponible = window.isSecureContext && "geolocation" in navigator;
  const puntos = [{ ...posicion, tipo: "yo", etiqueta: "Vos" }];
  if (pedido) {
    puntos.push({ lat: pedido.comercio_lat, lng: pedido.comercio_lng, tipo: "comercio", etiqueta: `Retiro: ${pedido.comercio}` });
    puntos.push({ lat: pedido.entrega_lat, lng: pedido.entrega_lng, tipo: "destino", etiqueta: "Entrega" });
  } else if (zona) {
    puntos.push({ lat: zona.lat, lng: zona.lng, tipo: "comercio", etiqueta: zona.nombre });
  }

  return (
    <div className="tarjeta">
      <div className="encabezado">
        <h3>Tu posición</h3>
        <span className="muted chico">
          {!emitiendo ? "No se envía mientras estés desconectado" : ultimoEnvio ? `Enviada hace ${Math.round((Date.now() - ultimoEnvio) / 1000)} s` : "Enviando…"}
        </span>
      </div>
      <div className="segmentado">
        <button className={modo === "simulada" ? "activo" : ""} onClick={() => setModo("simulada")}>
          Simular recorrido
        </button>
        <button className={modo === "gps" ? "activo" : ""} disabled={!gpsDisponible} onClick={() => setModo("gps")}>
          GPS del celular
        </button>
      </div>
      {!gpsDisponible && (
        <p className="muted chico">El GPS del navegador solo funciona con HTTPS o en localhost. Mientras tanto se usa la simulación.</p>
      )}
      {modo === "simulada" && !pedido && zonas.length > 0 && (
        <label className="chico">
          Esperar pedidos cerca de
          <select value={zona?.id || ""} onChange={(e) => setZona(zonas.find((z) => z.id === Number(e.target.value)))}>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {posicion ? <Mapa puntos={puntos} alto={220} /> : <Cargando texto="Obteniendo posición…" />}
      <Leyenda
        items={[
          { tipo: "yo", texto: "Vos" },
          { tipo: "comercio", texto: pedido ? "Retiro" : "Comercio" },
          ...(pedido ? [{ tipo: "destino", texto: "Entrega" }] : []),
        ]}
      />
      <ErrorAviso error={errorEnvio} />
    </div>
  );
}

// ---------------------------------------------------------------- ofertas
function Oferta({ oferta, onResponder }) {
  useTick(1000);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const ofrecida = parseFecha(oferta.creado_en);
  const restan = ofrecida ? Math.max(0, Math.round(config.ofertaTimeoutSegundos - (Date.now() - ofrecida) / 1000)) : null;

  async function responder(acepta) {
    setEnviando(true);
    setError(null);
    try {
      await onResponder(oferta, acepta);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? new Error("Esta oferta ya venció o ya fue respondida.") : e);
      setEnviando(false);
    }
  }

  return (
    <div className="tarjeta oferta">
      <div className="encabezado">
        <span className="eyebrow">Nueva oferta</span>
        {restan != null && <span className={`cuenta ${restan < 20 ? "urgente" : ""}`}>{restan} s</span>}
      </div>
      {restan != null && (
        <div className="tiempo" aria-hidden="true">
          <span style={{ width: `${(100 * restan) / config.ofertaTimeoutSegundos}%` }} />
        </div>
      )}
      <p className="monto fuerte grande">{precio(oferta.total)}</p>
      <ol className="paradas">
        <li className="parada-retiro">
          <span className="muted chico bloque">Retirás en</span>
          <strong>{oferta.comercio}</strong>
          <span className="muted chico bloque">{oferta.direccion_comercio}</span>
        </li>
        <li className="parada-entrega">
          <span className="muted chico bloque">Entregás en</span>
          <strong>{oferta.direccion_entrega}</strong>
        </li>
      </ol>
      <ErrorAviso error={error} />
      <div className="fila-botones">
        <button className="btn" disabled={enviando || restan === 0} onClick={() => responder(false)}>
          Rechazar
        </button>
        <button className="btn primario crece" disabled={enviando || restan === 0} onClick={() => responder(true)}>
          Aceptar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pedido en curso
function PedidoEnCurso({ pedido, fase, confirmando, onEntregar }) {
  const [paso, setPaso] = useState(null); // null | "subiendo" | Error
  const inputRef = useRef(null);

  async function elegirFoto(e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setPaso("subiendo");
    try {
      await onEntregar(pedido, archivo);
      setPaso(null);
    } catch (err) {
      setPaso(err);
    }
  }

  return (
    <div className="tarjeta destacada">
      <div className="encabezado">
        <h3>Pedido en curso</h3>
        <Estado estado={pedido.estado} />
      </div>
      <ol className="paradas">
        <li className={`parada-retiro ${fase === "retiro" ? "activa" : "hecha"}`}>
          <span className="muted chico bloque">{fase === "retiro" ? "Ahora: retirá en" : "Retirado en"}</span>
          <strong>{pedido.comercio}</strong>
        </li>
        <li className={`parada-entrega ${fase === "entrega" ? "activa" : ""}`}>
          <span className="muted chico bloque">{fase === "entrega" ? "Ahora: entregá en" : "Después: entregá en"}</span>
          <strong>{pedido.direccion_entrega}</strong>
        </li>
      </ol>
      {pedido.items.map((i) => (
        <div key={i.producto_id} className="fila-detalle chico">
          <span>
            {i.cantidad} × {i.nombre}
          </span>
        </div>
      ))}
      {confirmando ? (
        <Cargando texto="Confirmando la entrega: se verifica la foto…" />
      ) : (
        <>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" hidden onChange={elegirFoto} />
          <button className="btn primario ancho" disabled={paso === "subiendo"} onClick={() => inputRef.current?.click()}>
            {paso === "subiendo" ? "Subiendo la foto…" : <><Camara tam={18} /> Sacar foto y confirmar la entrega</>}
          </button>
          {paso instanceof Error && <ErrorAviso error={paso} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- app
export default function RepartidorApp() {
  const { app, sesion } = useSesion();
  const claveEstado = `delivery.repartidor.estado.${sesion.sub}`;
  const [estado, setEstado] = useState(() => localStorage.getItem(claveEstado) || "DESCONECTADO");
  const [modo, setModo] = useState("simulada");
  const [posicion, setPosicion] = useState(null);
  const [zona, setZona] = useState(null);
  const [ultimoEnvio, setUltimoEnvio] = useState(null);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [respondidas, setRespondidas] = useState(() => new Set());
  const [confirmando, setConfirmando] = useState(() => new Map()); // pedido_id -> inicio de la confirmación
  const [aviso, setAviso] = useState(null);
  const fases = useRef({}); // pedido_id -> "retiro" | "entrega" (solo para la simulación)
  useTick(5000);

  const comercios = usePolling(() => api(app, "GET", "/comercios"), 0);
  const zonas = comercios.datos || [];
  useEffect(() => {
    if (!zona && zonas.length) setZona(zonas[0]);
  }, [zonas, zona]);

  // Pedidos asignados a este repartidor: los ASIGNADO se piden con detalle (coordenadas e ítems).
  // GET /pedidos también trae los que el usuario pidió como cliente, por eso se filtra por repartidor_id.
  const pedidos = usePolling(async () => {
    const lista = (await api(app, "GET", "/pedidos")).filter((p) => p.repartidor_id === sesion.sub);
    const enCurso = await Promise.all(
      lista.filter((p) => p.estado === "ASIGNADO").map((p) => api(app, "GET", `/pedidos/${p.id}`))
    );
    return { lista, enCurso };
  }, 5000);
  const enCurso = pedidos.datos?.enCurso || [];
  const pedido = enCurso[0] || null;
  const ocupado = enCurso.length > 0;
  const emitiendo = ocupado || estado === "DISPONIBLE";

  // Cuando un pedido que se estaba confirmando deja de estar en curso, se avisa.
  // Si sigue en curso pasado CONFIRMACION_MAX_MS, el workflow no lo pudo confirmar: se deja reintentar.
  useEffect(() => {
    if (!pedidos.datos) return;
    const ids = new Set(enCurso.map((p) => p.id));
    const terminados = [...confirmando.keys()].filter((id) => !ids.has(id));
    const trabados = [...confirmando]
      .filter(([id, desde]) => ids.has(id) && Date.now() - desde > CONFIRMACION_MAX_MS)
      .map(([id]) => id);
    const quitar = new Set([...terminados, ...trabados]);
    if (!quitar.size) return;
    setConfirmando((m) => new Map([...m].filter(([id]) => !quitar.has(id))));
    if (terminados.length) {
      setAviso("¡Entrega confirmada! Volviste a quedar disponible.");
      setEstado("DISPONIBLE");
      localStorage.setItem(claveEstado, "DISPONIBLE");
    } else {
      setAviso("No se pudo confirmar la entrega. Sacá la foto de nuevo.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos.datos]);

  const ofertas = usePolling(() => api(app, "GET", "/asignaciones/pendientes"), 4000, [], estado === "DISPONIBLE" && !ocupado);
  const visibles = estado === "DISPONIBLE" && !ocupado ? (ofertas.datos || []).filter((o) => !respondidas.has(o.task_token)) : [];

  // Al abrir la app se reenvía el último estado elegido (la base puede ser nueva tras un apply).
  useEffect(() => {
    if (estado === "DISPONIBLE") api(app, "PUT", "/repartidores/me/estado", { disponible: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cambiarEstado(nuevo) {
    await api(app, "PUT", "/repartidores/me/estado", { disponible: nuevo === "DISPONIBLE" });
    setEstado(nuevo);
    localStorage.setItem(claveEstado, nuevo);
  }

  async function responder(oferta, acepta) {
    await api(app, "POST", `/asignaciones/${oferta.pedido_id}/respuesta`, { aceptar: acepta, task_token: oferta.task_token });
    setRespondidas((s) => new Set(s).add(oferta.task_token));
    if (acepta) {
      fases.current[oferta.pedido_id] = "retiro";
      setAviso("Pedido aceptado. Andá a retirarlo.");
    }
    pedidos.recargar();
  }

  async function entregar(p, archivo) {
    const foto = await aJpeg(archivo);
    const subida = await api(app, "POST", `/pedidos/${p.id}/comprobante`);
    await subirAS3(subida, foto);
    await api(app, "POST", `/pedidos/${p.id}/entrega`);
    setConfirmando((m) => new Map(m).set(p.id, Date.now()));
  }

  async function enviar(pos) {
    try {
      await api(app, "PUT", "/repartidores/me/posicion", { lat: pos.lat, lng: pos.lng });
      setUltimoEnvio(Date.now());
      setErrorEnvio(null);
    } catch (e) {
      // 503: Kinesis al límite. Se descarta esta posición y va la siguiente.
      if (!(e instanceof ApiError && e.status === 503)) setErrorEnvio(e);
    }
  }

  // Referencias para que los intervalos lean siempre el estado actual.
  const actual = useRef({});
  actual.current = { posicion, pedido, zona, emitiendo };

  // Simulación: arranca a ~1 km del comercio elegido y se acerca; con un pedido va al comercio y después al destino.
  useEffect(() => {
    if (modo !== "simulada") return undefined;
    const tick = () => {
      const { posicion: pos, pedido: p, zona: z, emitiendo: emite } = actual.current;
      if (!z && !p) return;
      let siguiente = pos || { lat: z.lat + 0.008, lng: z.lng + 0.004 };
      if (p) {
        const comercio = { lat: p.comercio_lat, lng: p.comercio_lng };
        const destino = { lat: p.entrega_lat, lng: p.entrega_lng };
        const fase = fases.current[p.id] || "retiro";
        if (fase === "retiro" && distancia(siguiente, comercio) < 30) fases.current[p.id] = "entrega";
        siguiente = mover(siguiente, fases.current[p.id] === "entrega" ? destino : comercio, SIM_PASO_M);
      } else if (distancia(siguiente, z) > 150) {
        siguiente = mover(siguiente, z, SIM_PASO_M);
      }
      setPosicion(siguiente);
      if (emite) enviar(siguiente);
    };
    tick();
    const id = setInterval(tick, SIM_TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, zona?.id]);

  // GPS real del navegador.
  useEffect(() => {
    if (modo !== "gps") return undefined;
    let ultimo = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        setPosicion(pos);
        if (actual.current.emitiendo && Date.now() - ultimo > GPS_ENVIO_MS) {
          ultimo = Date.now();
          enviar(pos);
        }
      },
      () => {
        setErrorEnvio(new Error("No se pudo leer el GPS. Usá la simulación."));
        setModo("simulada");
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const historial = (pedidos.datos?.lista || []).filter((p) => p.estado === "ENTREGADO").slice(0, 5);

  return (
    <section className="grilla-repartidor">
      {aviso && (
        <div className="aviso ok" onClick={() => setAviso(null)}>
          {aviso}
        </div>
      )}
      <ErrorAviso error={pedidos.error} />

      <div className="columna">
        {pedido && (
          <PedidoEnCurso
            pedido={pedido}
            fase={fases.current[pedido.id] || "retiro"}
            confirmando={confirmando.has(pedido.id)}
            onEntregar={entregar}
          />
        )}
        {visibles.map((o) => (
          <Oferta key={o.task_token} oferta={o} onResponder={responder} />
        ))}
        {estado === "DISPONIBLE" && !ocupado && visibles.length === 0 && (
          <div className="tarjeta centrado">
            <Cargando texto="Esperando ofertas…" />
            <p className="muted chico">
              Te llegan los pedidos de comercios a menos de 5 km mientras estés disponible y tu posición se esté enviando.
            </p>
          </div>
        )}
        <TarjetaEstado estado={estado} ocupado={ocupado} onCambiar={cambiarEstado} />
      </div>

      <div className="columna">
        <TarjetaPosicion
          modo={modo}
          setModo={setModo}
          posicion={posicion}
          ultimoEnvio={ultimoEnvio}
          errorEnvio={errorEnvio}
          emitiendo={emitiendo}
          zonas={zonas}
          zona={zona}
          setZona={(z) => {
            setZona(z);
            setPosicion(null);
          }}
          pedido={pedido}
        />
        {historial.length > 0 && (
          <div className="tarjeta">
            <h3>Tus últimas entregas</h3>
            {historial.map((p) => (
              <div key={p.id} className="fila-detalle chico">
                <span>{p.comercio}</span>
                <span className="muted">{fechaHora(p.creado_en)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

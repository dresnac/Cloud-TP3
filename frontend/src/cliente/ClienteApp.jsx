import { useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useSesion } from "../components/AppShell";
import { Cargando, ErrorAviso, Estado, Leyenda, Mapa } from "../components/comunes";
import { fechaHora, hora, parseFecha, precio, usePolling } from "../util";

const FINALES = ["ENTREGADO", "CANCELADO"];

// ---------------------------------------------------------------- comercios
function Comercios() {
  const { app } = useSesion();
  const { datos, error, cargando, recargar } = usePolling(() => api(app, "GET", "/comercios"), 0);
  const activos = usePolling(() => api(app, "GET", "/pedidos"), 15000);
  const enCurso = (activos.datos || []).filter((p) => !FINALES.includes(p.estado));

  return (
    <section>
      {enCurso.map((p) => (
        <Link key={p.id} to={`pedidos/${p.id}`} className="aviso info enlace">
          Pedido en {p.comercio}: <Estado estado={p.estado} /> <span className="flecha">→</span>
        </Link>
      ))}
      <h2>¿Qué querés pedir?</h2>
      <ErrorAviso error={error} onReintentar={recargar} />
      {cargando && <Cargando />}
      <div className="lista">
        {(datos || []).map((c) => (
          <Link key={c.id} to={`comercios/${c.id}`} className="tarjeta fila enlace">
            <span className="emoji">🏪</span>
            <div className="crece">
              <strong>{c.nombre}</strong>
              <div className="muted chico">{c.direccion}</div>
            </div>
            <span className="flecha">→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- menú, carrito y pedido
function Comercio() {
  const { app } = useSesion();
  const { id } = useParams();
  const comercioId = Number(id); // los ids de comercio y producto son enteros
  const navigate = useNavigate();
  const comercios = usePolling(() => api(app, "GET", "/comercios"), 0);
  const productos = usePolling(() => api(app, "GET", `/comercios/${comercioId}/productos`), 0, [comercioId]);
  const comercio = (comercios.datos || []).find((c) => c.id === comercioId);
  // Lo genera el cliente: si el POST se reintenta, la cola FIFO lo deduplica por este id.
  const [pedidoId] = useState(() => crypto.randomUUID());

  const [carrito, setCarrito] = useState({});
  const [direccion, setDireccion] = useState("Callao 100, CABA");
  const [destino, setDestino] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  // Destino por defecto: unas cuadras al oeste del comercio (dentro del radio de búsqueda).
  const destinoEfectivo = destino || (comercio && { lat: comercio.lat, lng: comercio.lng - 0.004 });

  const items = Object.entries(carrito)
    .filter(([, n]) => n > 0)
    .map(([pid, n]) => [Number(pid), n]);
  const total = items.reduce((s, [pid, n]) => s + n * Number((productos.datos || []).find((p) => p.id === pid)?.precio || 0), 0);
  const cambiar = (pid, delta) => setCarrito((c) => ({ ...c, [pid]: Math.max(0, (c[pid] || 0) + delta) }));

  function miUbicacion() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setDestino({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError(new Error("No se pudo obtener tu ubicación. Elegila tocando el mapa."))
    );
  }

  async function pedir() {
    setEnviando(true);
    setError(null);
    try {
      const r = await api(app, "POST", "/pedidos", {
        pedido_id: pedidoId,
        comercio_id: comercioId,
        items: items.map(([producto_id, cantidad]) => ({ producto_id, cantidad })),
        entrega: { direccion: direccion.trim(), lat: destinoEfectivo.lat, lng: destinoEfectivo.lng },
      });
      navigate(`/cliente/pedidos/${r.pedido_id}`);
    } catch (e) {
      setError(e);
      setEnviando(false);
    }
  }

  return (
    <section>
      <Link to="/cliente" className="volver">
        ← Comercios
      </Link>
      <h2>{comercio?.nombre || "…"}</h2>
      {comercio && <p className="muted chico">{comercio.direccion}</p>}
      <ErrorAviso error={productos.error} onReintentar={productos.recargar} />
      {productos.cargando && <Cargando />}

      <div className="lista">
        {(productos.datos || []).map((p) => (
          <div key={p.id} className="tarjeta fila">
            <div className="crece">
              <strong>{p.nombre}</strong>
              <div className="muted">{precio(p.precio)}</div>
            </div>
            <div className="contador">
              <button className="btn redondo" onClick={() => cambiar(p.id, -1)} disabled={!carrito[p.id]} aria-label="Quitar">
                −
              </button>
              <span>{carrito[p.id] || 0}</span>
              <button className="btn redondo" onClick={() => cambiar(p.id, 1)} aria-label="Agregar">
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && comercio && (
        <div className="tarjeta checkout">
          <h3>Entrega</h3>
          <label>
            Dirección
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} required />
          </label>
          <p className="muted chico">Tocá el mapa para marcar el punto de entrega.</p>
          <Mapa
            puntos={[
              { ...comercio, tipo: "comercio", etiqueta: comercio.nombre },
              { ...destinoEfectivo, tipo: "destino", etiqueta: "Entrega" },
            ]}
            onClick={setDestino}
            alto={220}
          />
          <div className="fila-botones">
            <Leyenda items={[{ tipo: "comercio", texto: "Comercio" }, { tipo: "destino", texto: "Entrega" }]} />
            <button className="btn chico" onClick={miUbicacion}>
              📍 Mi ubicación
            </button>
          </div>
          <ErrorAviso error={error} />
          <button className="btn primario ancho" onClick={pedir} disabled={enviando || !direccion.trim()}>
            {enviando ? "Enviando…" : `Pedir · ${precio(total)}`}
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- mis pedidos
function Pedidos() {
  const { app } = useSesion();
  const { datos, error, cargando, recargar } = usePolling(() => api(app, "GET", "/pedidos"), 10000);
  return (
    <section>
      <h2>Mis pedidos</h2>
      <ErrorAviso error={error} onReintentar={recargar} />
      {cargando && <Cargando />}
      {datos?.length === 0 && <p className="muted">Todavía no hiciste pedidos.</p>}
      <div className="lista">
        {(datos || []).map((p) => (
          <Link key={p.id} to={p.id} className="tarjeta fila enlace">
            <div className="crece">
              <strong>{p.comercio}</strong>
              <div className="muted chico">
                {fechaHora(p.creado_en)} · {precio(p.total)}
              </div>
            </div>
            <Estado estado={p.estado} />
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- seguimiento
function Calificar({ pedidoId }) {
  const { app } = useSesion();
  const [puntaje, setPuntaje] = useState(0);
  const [comentario, setComentario] = useState("");
  const [estado, setEstado] = useState(null); // null | "enviando" | "ok" | Error

  async function enviar() {
    setEstado("enviando");
    try {
      await api(app, "POST", `/pedidos/${pedidoId}/calificacion`, { puntaje, comentario: comentario || undefined });
      setEstado("ok");
    } catch (e) {
      setEstado(e instanceof ApiError && e.status === 409 ? "ok" : e);
    }
  }

  if (estado === "ok") return <div className="aviso ok">¡Gracias por calificar!</div>;
  return (
    <div className="tarjeta">
      <h3>¿Cómo estuvo?</h3>
      <div className="estrellas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={n <= puntaje ? "activa" : ""} onClick={() => setPuntaje(n)} aria-label={`${n} estrellas`}>
            ★
          </button>
        ))}
      </div>
      <textarea placeholder="Comentario (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      {estado instanceof Error && <ErrorAviso error={estado} />}
      <button className="btn primario ancho" disabled={!puntaje || estado === "enviando"} onClick={enviar}>
        Enviar calificación
      </button>
    </div>
  );
}

function Seguimiento() {
  const { app } = useSesion();
  const { id } = useParams();
  const [final, setFinal] = useState(false);
  const { datos: pedido, error, recargar } = usePolling(
    async () => {
      try {
        const p = await api(app, "GET", `/pedidos/${id}`);
        if (FINALES.includes(p.estado)) setFinal(true);
        return p;
      } catch (e) {
        // Recién encolado: el workflow todavía no lo registró en la base.
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    final ? 0 : 4000,
    [id]
  );

  const puntos = useMemo(() => {
    if (!pedido) return [];
    const p = [
      { lat: pedido.comercio_lat, lng: pedido.comercio_lng, tipo: "comercio", etiqueta: pedido.comercio },
      { lat: pedido.entrega_lat, lng: pedido.entrega_lng, tipo: "destino", etiqueta: "Entrega" },
    ];
    if (pedido.repartidor_lat != null)
      p.push({ lat: pedido.repartidor_lat, lng: pedido.repartidor_lng, tipo: "repartidor", etiqueta: "Repartidor" });
    return p;
  }, [pedido]);

  if (pedido === undefined) return error ? <ErrorAviso error={error} onReintentar={recargar} /> : <Cargando />;

  if (pedido === null)
    return (
      <section>
        <Link to="/cliente/pedidos" className="volver">
          ← Mis pedidos
        </Link>
        <div className="tarjeta centrado">
          <Estado estado="RECIBIDO" />
          <p>Recibimos tu pedido. Lo estamos registrando…</p>
          <Cargando texto="Esperando al workflow" />
        </div>
      </section>
    );

  const cancelado = pedido.eventos.find((e) => e.estado === "CANCELADO");
  const posHace = pedido.repartidor_actualizado_en
    ? Math.round((Date.now() - parseFecha(pedido.repartidor_actualizado_en)) / 1000)
    : null;

  return (
    <section>
      <Link to="/cliente/pedidos" className="volver">
        ← Mis pedidos
      </Link>
      <div className="encabezado">
        <h2>{pedido.comercio}</h2>
        <Estado estado={pedido.estado} />
      </div>
      <ErrorAviso error={error} />

      {pedido.estado === "CREADO" && <Cargando texto="Buscando un repartidor cerca del comercio…" />}
      {cancelado && <div className="aviso error">Pedido cancelado: no encontramos un repartidor disponible.</div>}

      <Mapa puntos={puntos} />
      <div className="fila-botones">
        <Leyenda
          items={[
            { tipo: "comercio", texto: "Comercio" },
            { tipo: "destino", texto: "Entrega" },
            { tipo: "repartidor", texto: "Repartidor" },
          ]}
        />
        {posHace != null && <span className="muted chico">posición hace {posHace}s</span>}
      </div>

      {pedido.estado === "ENTREGADO" && <Calificar pedidoId={pedido.id} />}

      <div className="tarjeta">
        <h3>Detalle</h3>
        {pedido.items.map((i) => (
          <div key={i.producto_id} className="fila-detalle">
            <span>
              {i.cantidad} × {i.nombre}
            </span>
            <span>{precio(i.cantidad * i.precio_unitario)}</span>
          </div>
        ))}
        <div className="fila-detalle total">
          <span>Total</span>
          <span>{precio(pedido.total)}</span>
        </div>
        <p className="muted chico">Entrega en {pedido.direccion_entrega}</p>
      </div>

      <div className="tarjeta">
        <h3>Historial</h3>
        <ol className="linea-tiempo">
          {pedido.eventos.map((e, i) => (
            <li key={i}>
              <Estado estado={e.estado} /> <span className="muted chico">{hora(e.creado_en)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function ClienteApp() {
  return (
    <>
      <nav className="nav-inferior">
        <NavLink to="/cliente" end>
          🏪 Comercios
        </NavLink>
        <NavLink to="/cliente/pedidos">🧾 Mis pedidos</NavLink>
      </nav>
      <Routes>
        <Route index element={<Comercios />} />
        <Route path="comercios/:id" element={<Comercio />} />
        <Route path="pedidos" element={<Pedidos />} />
        <Route path="pedidos/:id" element={<Seguimiento />} />
      </Routes>
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useSesion } from "../components/AppShell";
import { Cargando, ErrorAviso, Estado, Leyenda, Mapa, Pasos } from "../components/comunes";
import { Atras, Buscar, Chevron, Local, Mira, Pin, Recibo } from "../components/iconos";
import { config } from "../config";
import { buscarDireccion, direccionDe } from "../geocodificacion";
import { fechaHora, hora, parseFecha, precio, usePolling, useTick } from "../util";

const FINALES = ["ENTREGADO", "CANCELADO"];

function Volver({ to, children }) {
  return (
    <Link to={to} className="volver">
      <Atras tam={16} /> {children}
    </Link>
  );
}

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
          <span>
            Tu pedido en <b>{p.comercio}</b>: <Estado estado={p.estado} />
          </span>
          <Chevron tam={18} />
        </Link>
      ))}
      <h2 className="titulo-pantalla">¿Qué querés pedir?</h2>
      <ErrorAviso error={error} onReintentar={recargar} />
      {cargando && <Cargando />}
      <div className="lista">
        {(datos || []).map((c) => (
          <Link key={c.id} to={`comercios/${c.id}`} className="fila-comercio enlace">
            <span className="avatar" aria-hidden="true">
              {c.nombre.slice(0, 1)}
            </span>
            <span className="crece">
              <strong>{c.nombre}</strong>
              <span className="muted chico bloque">{c.direccion}</span>
            </span>
            <Chevron tam={18} className="muted" />
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- dirección de entrega
// El texto y el punto del mapa siempre describen el mismo lugar: escribir busca la
// dirección y mueve el pin; tocar el mapa, arrastrar el pin o usar la ubicación
// completan el texto con la dirección de ese punto.
function DireccionEntrega({ comercio, valor, onCambio }) {
  const [texto, setTexto] = useState(valor?.direccion || "");
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const consulta = useRef(0); // descarta respuestas viejas si llegan desordenadas
  const escrito = useRef(false); // solo se busca lo que tipeó la persona

  useEffect(() => {
    if (!escrito.current) return undefined;
    const q = texto.trim();
    if (q.length < 5) {
      setSugerencias([]);
      return undefined;
    }
    const id = setTimeout(async () => {
      const n = ++consulta.current;
      setBuscando(true);
      setError(null);
      try {
        const r = await buscarDireccion(q, comercio);
        if (n === consulta.current) {
          setSugerencias(r);
          if (!r.length) setError(new Error("No encontramos esa dirección. Probá con calle y altura, o marcala en el mapa."));
        }
      } catch (e) {
        if (n === consulta.current) setError(e);
      } finally {
        if (n === consulta.current) setBuscando(false);
      }
    }, 800);
    return () => clearTimeout(id);
  }, [texto, comercio]);

  function elegir(s) {
    escrito.current = false;
    setTexto(s.direccion);
    setSugerencias([]);
    setError(null);
    onCambio({ direccion: s.direccion, lat: s.lat, lng: s.lng });
  }

  async function marcar(punto) {
    escrito.current = false;
    consulta.current++;
    setSugerencias([]);
    setError(null);
    setBuscando(true);
    onCambio({ direccion: texto.trim(), ...punto });
    try {
      const direccion = await direccionDe(punto);
      if (direccion) {
        setTexto(direccion);
        onCambio({ direccion, ...punto });
      }
    } catch (e) {
      setError(e);
    } finally {
      setBuscando(false);
    }
  }

  function miUbicacion() {
    if (!navigator.geolocation) {
      setError(new Error("Este navegador no da la ubicación. Marcá el punto en el mapa."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => marcar({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError(new Error("No pudimos obtener tu ubicación. Marcá el punto en el mapa."))
    );
  }

  const puntos = [{ ...comercio, tipo: "comercio", etiqueta: comercio.nombre }];
  if (valor) puntos.push({ lat: valor.lat, lng: valor.lng, tipo: "destino", etiqueta: "Entrega" });

  return (
    <div className="entrega">
      <h3>¿Dónde lo entregamos?</h3>
      <div className="campo-direccion">
        <Buscar tam={18} className="campo-icono" />
        <input
          value={texto}
          placeholder="Calle y altura, por ejemplo Callao 100"
          aria-label="Dirección de entrega"
          autoComplete="off"
          onChange={(e) => {
            escrito.current = true;
            setTexto(e.target.value);
            if (valor) onCambio(null); // el punto anterior ya no corresponde al texto
          }}
        />
        {buscando && <span className="spinner campo-spinner" />}
        {sugerencias.length > 0 && (
          <ul className="sugerencias" role="listbox">
            {sugerencias.map((s, i) => (
              <li key={i}>
                <button type="button" onClick={() => elegir(s)}>
                  <Pin tam={16} /> {s.direccion}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ErrorAviso error={error} />
      <Mapa puntos={puntos} onClick={marcar} onArrastrar={marcar} alto={240} />
      <div className="fila-botones">
        <span className="muted chico">{valor ? "Podés arrastrar el pin para ajustar." : "También podés tocar el mapa."}</span>
        <button type="button" className="btn chico" onClick={miUbicacion}>
          <Mira tam={16} /> Mi ubicación
        </button>
      </div>
    </div>
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
  const [entrega, setEntrega] = useState(null); // { direccion, lat, lng }
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const items = Object.entries(carrito)
    .filter(([, n]) => n > 0)
    .map(([pid, n]) => [Number(pid), n]);
  const unidades = items.reduce((s, [, n]) => s + n, 0);
  const total = items.reduce((s, [pid, n]) => s + n * Number((productos.datos || []).find((p) => p.id === pid)?.precio || 0), 0);
  const cambiar = (pid, delta) => setCarrito((c) => ({ ...c, [pid]: Math.max(0, (c[pid] || 0) + delta) }));
  const listo = Boolean(entrega?.direccion && Number.isFinite(entrega?.lat));

  async function pedir() {
    setEnviando(true);
    setError(null);
    try {
      const r = await api(app, "POST", "/pedidos", {
        pedido_id: pedidoId,
        comercio_id: comercioId,
        items: items.map(([producto_id, cantidad]) => ({ producto_id, cantidad })),
        entrega: { direccion: entrega.direccion, lat: entrega.lat, lng: entrega.lng },
      });
      navigate(`/cliente/pedidos/${r.pedido_id}`);
    } catch (e) {
      setError(e);
      setEnviando(false);
    }
  }

  return (
    <section className={items.length ? "con-barra-pedido" : ""}>
      <Volver to="/cliente">Comercios</Volver>
      <div className="cabecera-comercio">
        <span className="avatar grande" aria-hidden="true">
          {comercio?.nombre.slice(0, 1) || <Local tam={22} />}
        </span>
        <div>
          <h2 className="titulo-pantalla">{comercio?.nombre || "…"}</h2>
          {comercio && <p className="muted chico">{comercio.direccion}</p>}
        </div>
      </div>
      <ErrorAviso error={productos.error} onReintentar={productos.recargar} />
      {productos.cargando && <Cargando />}

      <div className="menu">
        {(productos.datos || []).map((p) => (
          <div key={p.id} className={`fila-producto ${carrito[p.id] ? "elegido" : ""}`}>
            <div className="crece">
              <strong>{p.nombre}</strong>
              <span className="monto bloque">{precio(p.precio)}</span>
            </div>
            <div className="contador">
              {carrito[p.id] > 0 && (
                <>
                  <button className="btn redondo" onClick={() => cambiar(p.id, -1)} aria-label={`Quitar ${p.nombre}`}>
                    −
                  </button>
                  <span aria-live="polite">{carrito[p.id]}</span>
                </>
              )}
              <button className="btn redondo primario" onClick={() => cambiar(p.id, 1)} aria-label={`Agregar ${p.nombre}`}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && comercio && (
        <>
          <DireccionEntrega comercio={comercio} valor={entrega} onCambio={setEntrega} />
          <ErrorAviso error={error} />
          <div className="barra-pedido">
            <div className="barra-pedido-resumen">
              <span className="muted chico">
                {unidades} {unidades === 1 ? "producto" : "productos"}
              </span>
              <span className="monto fuerte">{precio(total)}</span>
            </div>
            <button className="btn primario" onClick={pedir} disabled={enviando || !listo}>
              {enviando ? "Enviando…" : listo ? "Hacer el pedido" : "Falta la dirección"}
            </button>
          </div>
        </>
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
      <h2 className="titulo-pantalla">Mis pedidos</h2>
      <ErrorAviso error={error} onReintentar={recargar} />
      {cargando && <Cargando />}
      {datos?.length === 0 && (
        <div className="vacio">
          <Recibo tam={28} />
          <p>Todavía no hiciste pedidos.</p>
          <Link to="/cliente" className="btn primario">
            Ver comercios
          </Link>
        </div>
      )}
      <div className="lista">
        {(datos || []).map((p) => (
          <Link key={p.id} to={p.id} className="fila-comercio enlace">
            <span className="crece">
              <strong>{p.comercio}</strong>
              <span className="muted chico bloque">
                {fechaHora(p.creado_en)} · <span className="monto">{precio(p.total)}</span>
              </span>
            </span>
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

  if (estado === "ok") return <div className="aviso ok">Gracias, guardamos tu calificación.</div>;
  return (
    <div className="tarjeta">
      <h3>¿Cómo estuvo la entrega?</h3>
      <div className="estrellas" role="radiogroup" aria-label="Puntaje">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={n <= puntaje ? "activa" : ""}
            onClick={() => setPuntaje(n)}
            role="radio"
            aria-checked={n === puntaje}
            aria-label={`${n} de 5`}
          >
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

const reloj = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Buscando({ desde }) {
  useTick(1000);
  const limite = config.esperaRepartidorSegundos;
  const lleva = desde ? Math.max(0, (Date.now() - desde) / 1000) : 0;
  return (
    <div className="buscando">
      <span className="radar" aria-hidden="true" />
      <div>
        <strong>Buscando un repartidor cerca del comercio</strong>
        <span className="muted chico bloque">
          Lleva <span className="monto">{reloj(lleva)}</span>. Si en <span className="monto">{reloj(limite)}</span> no
          aparece ninguno, el pedido se cancela.
        </span>
      </div>
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
        <Volver to="/cliente/pedidos">Mis pedidos</Volver>
        <Pasos estado="RECIBIDO" />
        <div className="tarjeta centrado">
          <Cargando texto="Recibimos tu pedido. Lo estamos registrando…" />
        </div>
      </section>
    );

  const posHace = pedido.repartidor_actualizado_en
    ? Math.round((Date.now() - parseFecha(pedido.repartidor_actualizado_en)) / 1000)
    : null;

  return (
    <section>
      <Volver to="/cliente/pedidos">Mis pedidos</Volver>
      <h2 className="titulo-pantalla">{pedido.comercio}</h2>
      <Pasos estado={pedido.estado} />
      <ErrorAviso error={error} />

      {pedido.estado === "CREADO" && <Buscando desde={parseFecha(pedido.creado_en)} />}
      {pedido.estado === "CANCELADO" && (
        <div className="aviso error">No conseguimos un repartidor para este pedido y lo cancelamos.</div>
      )}

      <Mapa puntos={puntos} />
      <div className="fila-botones">
        <Leyenda
          items={[
            { tipo: "comercio", texto: "Comercio" },
            { tipo: "destino", texto: "Entrega" },
            { tipo: "repartidor", texto: "Repartidor" },
          ]}
        />
        {posHace != null && <span className="muted chico">Posición de hace {posHace} s</span>}
      </div>

      {pedido.estado === "ENTREGADO" && <Calificar pedidoId={pedido.id} />}

      <div className="comanda">
        <div className="comanda-cabecera">
          <span>Pedido</span>
          <span className="monto">#{pedido.id.slice(0, 8)}</span>
        </div>
        {pedido.items.map((i) => (
          <div key={i.producto_id} className="comanda-fila">
            <span>
              <span className="monto">{i.cantidad}×</span> {i.nombre}
            </span>
            <span className="monto">{precio(i.cantidad * i.precio_unitario)}</span>
          </div>
        ))}
        <div className="comanda-fila total">
          <span>Total</span>
          <span className="monto">{precio(pedido.total)}</span>
        </div>
        <div className="comanda-pie">
          <Pin tam={15} /> {pedido.direccion_entrega}
        </div>
        <ol className="comanda-historial">
          {pedido.eventos.map((e, i) => (
            <li key={i}>
              <span className="monto">{hora(e.creado_en)}</span> <Estado estado={e.estado} />
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
      <nav className="nav-inferior" aria-label="Secciones">
        <NavLink to="/cliente" end>
          <Local tam={20} /> Comercios
        </NavLink>
        <NavLink to="/cliente/pedidos">
          <Recibo tam={20} /> Mis pedidos
        </NavLink>
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

import { createContext, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { login, logout, sesionGuardada } from "../auth";
import { Cargando } from "./comunes";
import { Atras, Bolsa, Moto, Salir } from "./iconos";

const SesionContext = createContext(null);
export const useSesion = () => useContext(SesionContext);

function Login({ app, titulo, onIngreso }) {
  const [email, setEmail] = useState(`${app}.demo@example.com`);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      onIngreso(await login(app, email.trim(), password));
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={`login tema-${app}`}>
      <form className="login-form" onSubmit={enviar}>
        <Link to="/" className="volver">
          <Atras tam={16} /> Elegir otra app
        </Link>
        <span className="login-icono">{app === "cliente" ? <Bolsa tam={28} /> : <Moto tam={28} />}</span>
        <h1>{app === "cliente" ? "Ingresá para pedir" : "Ingresá para repartir"}</h1>
        <label>
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="aviso error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primario ancho" disabled={enviando}>
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="nota">
          Las contraseñas de los usuarios de demo salen de <code>terraform output -json usuarios_demo</code>.
        </p>
      </form>
    </main>
  );
}

// Envuelve una app: pide login, verifica el grupo de Cognito y muestra la barra superior.
export default function AppShell({ app, titulo, grupo, children }) {
  const [sesion, setSesion] = useState(undefined); // undefined = restaurando la sesión guardada

  useEffect(() => {
    let vigente = true;
    sesionGuardada(app).then((s) => vigente && setSesion(s));
    return () => {
      vigente = false;
    };
  }, [app]);

  useEffect(() => {
    const salir = (e) => {
      if (e.detail === app) {
        logout(app);
        setSesion(null);
      }
    };
    window.addEventListener("sesion-vencida", salir);
    return () => window.removeEventListener("sesion-vencida", salir);
  }, [app]);

  const cerrar = () => {
    logout(app);
    setSesion(null);
  };

  if (sesion === undefined) return <Cargando texto="Recuperando la sesión…" />;
  if (!sesion) return <Login app={app} titulo={titulo} onIngreso={setSesion} />;

  if (!sesion.grupos.includes(grupo)) {
    return (
      <main className={`login tema-${app}`}>
        <div className="login-form">
          <h1>Sin permiso</h1>
          <p>
            <b>{sesion.email}</b> no está en el grupo <code>{grupo}</code> de Cognito.
          </p>
          <p className="muted chico">
            Agregarlo con <code>aws cognito-idp admin-add-user-to-group --group-name {grupo}</code>.
          </p>
          <button className="btn ancho" onClick={cerrar}>
            Usar otro usuario
          </button>
        </div>
      </main>
    );
  }

  return (
    <SesionContext.Provider value={{ app, sesion }}>
      <div className={`shell tema-${app}`}>
        <header className="barra">
          <Link to={`/${app}`} className="barra-titulo">
            <span className="barra-marca">{app === "cliente" ? <Bolsa tam={18} /> : <Moto tam={18} />}</span>
            {titulo}
          </Link>
          <div className="barra-usuario">
            <span className="ocultar-movil">{sesion.email}</span>
            <button className="btn-texto" onClick={cerrar} aria-label="Salir">
              <Salir tam={18} />
              <span className="ocultar-movil">Salir</span>
            </button>
          </div>
        </header>
        <div className="contenido">{children}</div>
      </div>
    </SesionContext.Provider>
  );
}

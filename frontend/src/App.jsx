import { Link, Navigate, Route, Routes } from "react-router-dom";
import { configCompleta } from "./config";
import AppShell from "./components/AppShell";
import ClienteApp from "./cliente/ClienteApp";
import RepartidorApp from "./repartidor/RepartidorApp";
import { Bolsa, Chevron, Moto } from "./components/iconos";

function Inicio() {
  return (
    <main className="inicio">
      <p className="eyebrow">TP3 · Cloud Computing</p>
      <h1>Delivery</h1>
      <p className="muted">Elegí con qué app entrar. Podés abrir las dos a la vez, en ventanas distintas.</p>
      <div className="inicio-apps">
        <Link to="/cliente" className="tarjeta-app tema-cliente">
          <span className="tarjeta-app-icono">
            <Bolsa tam={26} />
          </span>
          <strong>Cliente</strong>
          <span>Pedí en los comercios de la zona y seguí el envío en el mapa.</span>
          <span className="tarjeta-app-ir">
            Entrar <Chevron tam={16} />
          </span>
        </Link>
        <Link to="/repartidor" className="tarjeta-app tema-repartidor">
          <span className="tarjeta-app-icono">
            <Moto tam={26} />
          </span>
          <strong>Repartidor</strong>
          <span>Recibí ofertas cerca tuyo, retirá el pedido y entregalo con foto.</span>
          <span className="tarjeta-app-ir">
            Entrar <Chevron tam={16} />
          </span>
        </Link>
      </div>
    </main>
  );
}

function SinConfiguracion() {
  return (
    <main className="inicio">
      <h1>Falta la configuración</h1>
      <p>
        No está el archivo <code>frontend/.env.local</code>. Después del <code>terraform apply</code>, correr:
      </p>
      <pre>cd frontend{"\n"}npm run config{"\n"}npm run dev</pre>
      <p className="muted">
        Los usuarios de demo y sus contraseñas: <code>terraform -chdir=terraform/organization output -json usuarios_demo</code>.
      </p>
    </main>
  );
}

export default function App() {
  if (!configCompleta) return <SinConfiguracion />;
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route
        path="/cliente/*"
        element={
          <AppShell app="cliente" titulo="Delivery" grupo="cliente">
            <ClienteApp />
          </AppShell>
        }
      />
      <Route
        path="/repartidor/*"
        element={
          <AppShell app="repartidor" titulo="Delivery Repartidor" grupo="repartidor">
            <RepartidorApp />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

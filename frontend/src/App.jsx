import { Link, Navigate, Route, Routes } from "react-router-dom";
import { configCompleta } from "./config";
import AppShell from "./components/AppShell";
import ClienteApp from "./cliente/ClienteApp";
import RepartidorApp from "./repartidor/RepartidorApp";

function Inicio() {
  return (
    <main className="inicio">
      <h1>Delivery</h1>
      <p className="muted">Apps de demo sobre la infraestructura del TP3.</p>
      <div className="inicio-apps">
        <Link to="/cliente" className="tarjeta-app cliente">
          <span className="emoji">🛍️</span>
          <strong>App del cliente</strong>
          <span>Pedí, seguí tu envío y calificá</span>
        </Link>
        <Link to="/repartidor" className="tarjeta-app repartidor">
          <span className="emoji">🛵</span>
          <strong>App del repartidor</strong>
          <span>Recibí ofertas, retirá y entregá</span>
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
        Los usuarios de demo y sus contraseñas: <code>terraform -chdir=terraform output -json usuarios_demo</code>.
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
          <AppShell app="repartidor" titulo="Delivery · Repartidor" grupo="repartidor">
            <RepartidorApp />
          </AppShell>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

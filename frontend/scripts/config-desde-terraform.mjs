// Genera frontend/.env.local con los outputs de Terraform (URL de la API, User Pool, App Clients
// timeout de las ofertas y espera de repartidor).
// Uso: npm run config   (después del terraform apply)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const tfDir = path.resolve(aqui, "../../terraform/organization");
const destino = path.resolve(aqui, "../.env.local");

let out;
try {
  out = JSON.parse(execFileSync("terraform", [`-chdir=${tfDir}`, "output", "-json"], { encoding: "utf8" }));
} catch (e) {
  console.error("No se pudieron leer los outputs de Terraform. ¿Corriste terraform apply en terraform/organization?");
  process.exit(1);
}

const valor = (nombre) => {
  if (!out[nombre]) {
    console.error(`Falta el output "${nombre}". ¿El apply terminó bien?`);
    process.exit(1);
  }
  return out[nombre].value;
};

const clientes = valor("cognito_client_ids");
const env = {
  VITE_API_URL: valor("api_url").replace(/\/$/, ""),
  VITE_USER_POOL_ID: valor("cognito_user_pool_id"),
  VITE_CLIENT_ID_CLIENTE: clientes.cliente,
  VITE_CLIENT_ID_REPARTIDOR: clientes.repartidor,
  VITE_OFERTA_TIMEOUT_SEGUNDOS: valor("asignacion_timeout_segundos"),
  VITE_ESPERA_REPARTIDOR_SEGUNDOS: valor("asignacion_espera_segundos"),
};

writeFileSync(destino, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
console.log(`Escrito ${destino}`);
for (const [k, v] of Object.entries(env)) console.log(`  ${k}=${v}`);

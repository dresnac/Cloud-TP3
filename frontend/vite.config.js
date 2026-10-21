import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Puerto fijo: http://localhost:5173 es el origen permitido por CORS en la API
// y en el bucket (variable cors_origenes de Terraform). strictPort evita que Vite
// se mude a otro puerto y las llamadas fallen por CORS.
export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js depende de `buffer`, que usa el `global` de Node.
  // En dev las dependencias se pre-empaquetan con esbuild sin ese alias; el build
  // de producción ya lo resuelve. Solo afecta a node_modules, no al código de la app.
  optimizeDeps: {
    esbuildOptions: { define: { global: "globalThis" } },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});

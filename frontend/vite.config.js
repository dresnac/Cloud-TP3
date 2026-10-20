import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Puerto fijo: http://localhost:5173 es el origen permitido por CORS en la API
// y en el bucket (variable cors_origenes de Terraform). strictPort evita que Vite
// se mude a otro puerto y las llamadas fallen por CORS.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});

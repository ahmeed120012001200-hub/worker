import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const clientDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: clientDirectory,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://localhost:3001" }
  },
  build: {
    outDir: resolve(clientDirectory, "../dist/client"),
    emptyOutDir: true
  }
});
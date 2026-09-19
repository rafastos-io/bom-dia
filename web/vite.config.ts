import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const BACKEND = process.env.BOMDIA_API_TARGET ?? "http://127.0.0.1:9463"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5199,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: false },
      "/login": { target: BACKEND, changeOrigin: false },
      "/logout": { target: BACKEND, changeOrigin: false },
      "/health": { target: BACKEND, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})

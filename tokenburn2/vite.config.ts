/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// TokenBurn 2.0 — Vite config (also configures Vitest).
// In local dev, the optional serverless proxy can be run separately (e.g.
// `vercel dev`) and proxied here so `/api/count` works during `npm run dev`.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

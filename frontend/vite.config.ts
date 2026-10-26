import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // API_URL lets a second dev server point at a backend on another port.
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: { "/api": env.API_URL || "http://localhost:8000" },
    },
  };
});

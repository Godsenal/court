import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 8434,
    proxy: {
      "/api": "http://localhost:8433",
      "/ws": { target: "ws://localhost:8433", ws: true },
    },
  },
});

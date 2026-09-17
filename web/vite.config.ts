import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5179,
  },
  build: {
    outDir: "../pages/settings",
    emptyOutDir: true,
  },
});

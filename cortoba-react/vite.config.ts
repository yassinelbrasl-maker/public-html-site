import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the live PHP backend during dev.
      // Change target to http://localhost:<php-port> if running PHP locally.
      "/cortoba-plateforme/api": {
        target: "https://cortobaarchitecture.com",
        changeOrigin: true,
        secure: true,
      },
      "/img": {
        target: "https://cortobaarchitecture.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: "dist",
    // The build output will be copied to the public root when ready to deploy.
    emptyOutDir: true,
  },
});

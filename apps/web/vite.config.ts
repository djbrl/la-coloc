import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Where the API runs. :4100 by default; COLOC_DEV_API points the dev proxy somewhere else (a stand-in API to test
// the "core is down" screens against, say). Not COLOC_API_URL: that one is the caretaker's address for the hub.
// Multiprise starts the API on a port of its choosing and tells the web which (VITE_API_PORT / API_PORT).
const apiPort = process.env.VITE_API_PORT ?? process.env.API_PORT ?? "4100";
const api = process.env.COLOC_DEV_API ?? `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [vue()],
  server: {
    // The one dev port: the API's COLOC_PUBLIC_URL default, the GitHub App's callback and `npm run share` all say 5175.
    port: 5175,
    strictPort: true,
    // Proxying keeps the browser on one origin (no CORS, SSE just works).
    proxy: {
      "/api": api,
      // The lobby's live line (who's walking where).
      "/lobby-ws": { target: api.replace(/^http/, "ws"), ws: true },
      // A caretaker's line, so the install command shown in development (ws://localhost:5175/agent) connects.
      "/agent": { target: api.replace(/^http/, "ws"), ws: true },
    },
  },
});

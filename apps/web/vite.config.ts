import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Where the API runs. :4100 by default; COLOC_DEV_API points the dev proxy somewhere else (a stand-in API to test
// the "core is down" screens against, say). Not COLOC_API_URL: that one is the caretaker's address for the hub.
const api = process.env.COLOC_DEV_API ?? "http://127.0.0.1:4100";

export default defineConfig({
  plugins: [vue()],
  server: {
    // Proxying keeps the browser on one origin (no CORS, SSE just works).
    proxy: {
      "/api": api,
      // The lobby's live line (who's walking where).
      "/lobby-ws": { target: api.replace(/^http/, "ws"), ws: true },
    },
  },
});

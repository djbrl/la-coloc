import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    // The API runs on :4100; proxying keeps the browser on one origin (no CORS, SSE just works).
    proxy: {
      "/api": "http://127.0.0.1:4100",
      // The lobby's live line (who's walking where).
      "/lobby-ws": { target: "ws://127.0.0.1:4100", ws: true },
    },
  },
});

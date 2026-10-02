import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    // The API runs on :4000; proxying keeps the browser on one origin (no CORS, SSE just works).
    proxy: { "/api": "http://127.0.0.1:4000" },
  },
});

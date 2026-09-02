import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  server: {
    watch: {
      // D1 lokal menulis ke .wrangler/state setiap ada query. Tanpa ini,
      // setiap request API terlihat seperti perubahan source dan memicu reload.
      ignored: ["**/.wrangler/**", "**/dist/**"],
    },
  },
});

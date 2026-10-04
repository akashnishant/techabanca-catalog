import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: process.env.CLOUDFLARE_ENV === "staging" ? "dist-staging" : "dist" },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      // Keep Vite development on the same local Cloudflare state
      // that repository-root Wrangler migration commands populate.
      persistState: {
        path: "../../.wrangler/state",
      },
    }),
  ],
});

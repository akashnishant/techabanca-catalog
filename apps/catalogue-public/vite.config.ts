import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: process.env.CLOUDFLARE_ENV === "production" ? "dist-production" : process.env.CLOUDFLARE_ENV === "staging" ? "dist-staging" : "dist" },
  plugins: [cloudflare({ remoteBindings: false, persistState: { path: "../../.wrangler/state" } })],
});

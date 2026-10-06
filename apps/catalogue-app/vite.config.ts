import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
  const sharedLocal = command === "serve" && !process.env.CLOUDFLARE_ENV && process.env.CATALOGUE_LOCAL_SHARED_WORKERS === "true";
  return {
  build: { outDir: process.env.CLOUDFLARE_ENV === "production" ? "dist-production" : process.env.CLOUDFLARE_ENV === "staging" ? "dist-staging" : "dist" },
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      remoteBindings: false,
      ...(sharedLocal ? {
        config: config => ({ ...config, services: [...(config.services ?? []), { binding: "LOCAL_PUBLIC_WORKER", service: "techabanca-catalogue-public" }] }),
        auxiliaryWorkers: [{ configPath: "../catalogue-public/wrangler.jsonc", config: config => ({ ...config, vars: { ...config.vars, LOCAL_PREVIEW: "true", DEPLOYMENT_ENVIRONMENT: "local" } }) }],
      } : {}),
      // Keep Vite development on the same local Cloudflare state
      // that repository-root Wrangler migration commands populate.
      persistState: {
        path: "../../.wrangler/state",
      },
    }),
  ],
  };
});

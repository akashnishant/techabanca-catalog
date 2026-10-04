import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const migrationsPath = fileURLToPath(new URL("../../database/migrations/", import.meta.url));
export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations(migrationsPath), LOCAL_PREVIEW: "false", PUBLICATION_PREVIEW_SECRET: "b".repeat(64) } },
  }))],
  test: { setupFiles: ["./test/apply-migrations.ts"] },
});

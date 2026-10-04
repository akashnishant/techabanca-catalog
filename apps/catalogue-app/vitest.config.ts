import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const migrationsPath = fileURLToPath(
  new URL("../../database/migrations/", import.meta.url),
);

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
          ASSET_UPLOAD_SIGNING_SECRET: "a".repeat(64),
          PUBLICATION_PREVIEW_SECRET: "b".repeat(64),
          ALLOW_UNSUBSCRIBED_PUBLISHING: "false",
          LOCAL_PREVIEW: "false",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});

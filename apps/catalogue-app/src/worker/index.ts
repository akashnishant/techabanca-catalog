import { Hono } from "hono";
import type { CatalogueAppEnv } from "./app-env";
import { createAuthRoutes } from "./routes/auth-routes";
import { createTenantAccessRoutes } from "./routes/tenant-access-routes";

const app = new Hono<CatalogueAppEnv>();

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    service: "techabanca-catalogue-app",
  }),
);

app.route("/api/v1/auth", createAuthRoutes());
app.route("/api/v1/auth", createTenantAccessRoutes());

export default app;

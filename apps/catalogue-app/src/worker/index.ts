import { Hono } from "hono";
import { createAuthRoutes } from "./routes/auth-routes";

type CatalogueAppEnv = {
  Bindings: Env;
};

const app = new Hono<CatalogueAppEnv>();

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    service: "techabanca-catalogue-app",
  }),
);

app.route("/api/v1/auth", createAuthRoutes());

export default app;

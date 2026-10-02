import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { CatalogueAppEnv } from "./app-env";
import { requireSameOrigin } from "./middleware/require-same-origin";
import { createAuthRoutes } from "./routes/auth-routes";
import { createCategoryRoutes } from "./routes/category-routes";
import { createItemRoutes } from "./routes/item-routes";
import { createOnboardingRoutes } from "./routes/onboarding-routes";
import { createTenantAccessRoutes } from "./routes/tenant-access-routes";

const app = new Hono<CatalogueAppEnv>();

app.use("/api/*", secureHeaders());
app.use("/api/v1/auth/*", requireSameOrigin);
app.use("/api/v1/onboarding/*", requireSameOrigin);
app.use("/api/v1/catalogue/*", requireSameOrigin);

app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    service: "techabanca-catalogue-app",
  }),
);

app.route("/api/v1/auth", createAuthRoutes());
app.route("/api/v1/auth", createTenantAccessRoutes());
app.route("/api/v1/onboarding", createOnboardingRoutes());
app.route("/api/v1/catalogue", createCategoryRoutes());
app.route("/api/v1/catalogue", createItemRoutes());

export default app;

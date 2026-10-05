import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { apiError, ensureApiRequestId } from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { AnalyticsError, AnalyticsService } from "../services/analytics-service";

export function createAnalyticsRoutes() {
  const routes = new Hono<CatalogueAppEnv>();
  routes.use("/analytics*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); c.header("Referrer-Policy", "no-referrer"); });
  routes.get("/analytics", requireAuthentication, requireTenantAccess, async c => {
    try {
      const data = await new AnalyticsService(c.env.DB).summary(c.get("tenantAccess").tenant, new URL(c.req.url).searchParams);
      ensureApiRequestId(c); return c.json({ data });
    } catch (error) {
      if (error instanceof AnalyticsError) return apiError(c, error.status, error.code, error.message);
      return apiError(c, 503, "analytics_unavailable", "Analytics are temporarily unavailable. Please try again.");
    }
  });
  return routes;
}

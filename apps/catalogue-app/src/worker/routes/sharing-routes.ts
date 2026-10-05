import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { apiError, ensureApiRequestId } from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { SharingError, SharingService } from "../services/sharing-service";

export function createSharingRoutes() {
  const routes = new Hono<CatalogueAppEnv>();
  routes.use("/sharing*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); c.header("Referrer-Policy", "no-referrer"); });
  routes.get("/sharing", requireAuthentication, requireTenantAccess, async c => {
    try {
      const data = await new SharingService(c.env.DB, c.env.DEPLOYMENT_ENVIRONMENT, c.env.LOCAL_PREVIEW)
        .view(c.get("tenantAccess").tenant, new URL(c.req.url).searchParams);
      ensureApiRequestId(c); return c.json({ data });
    } catch (error) {
      if (error instanceof SharingError) return apiError(c, error.status, error.code, error.message);
      return apiError(c, 503, "sharing_unavailable", "Sharing tools are temporarily unavailable. Please try again.");
    }
  });
  return routes;
}

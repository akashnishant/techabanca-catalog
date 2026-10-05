import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { apiError, ensureApiRequestId } from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { SubscriptionError, SubscriptionService, subscriptionInput, requireSubscriptionManager } from "../services/subscription-service";

export function createSubscriptionRoutes() {
  const routes = new Hono<CatalogueAppEnv>(), auth = [requireAuthentication, requireTenantAccess] as const;
  routes.use("/subscription*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); c.header("Referrer-Policy", "no-referrer"); });
  routes.get("/subscription", ...auth, async c => {
    try { const access = c.get("tenantAccess");
      const data = await new SubscriptionService(c.env).summary(access.tenant, access.role);
      ensureApiRequestId(c); return c.json({ data });
    } catch { return apiError(c, 503, "subscription_unavailable", "Your subscription is temporarily unavailable. Try again."); }
  });
  for (const action of ["trial", "checkout", "cancel"] as const) routes.post("/subscription/" + action, ...auth, async c => {
    try {
      const access = c.get("tenantAccess"), actor = { role: access.role, userId: c.get("authSession").userId };
      requireSubscriptionManager(actor);
      const body = await subscriptionInput(c.req.raw, action === "trial" ? [] : action === "checkout" ? ["offerId", "requestId"] : ["id", "version"]);
      const service = new SubscriptionService(c.env);
      const data = action === "trial" ? await service.startTrial(access.tenant, actor)
        : action === "checkout" ? await service.checkout(access.tenant, actor, body.offerId, body.requestId)
        : await service.cancel(access.tenant, actor, body.id, body.version);
      ensureApiRequestId(c); return c.json({ data });
    } catch (error) { if (error instanceof SubscriptionError) return apiError(c, error.status, error.code, error.message);
      return apiError(c, 503, "subscription_unavailable", "The subscription change could not be completed. Refresh the status before trying again."); }
  });
  return routes;
}

export function createPaymentWebhookRoutes() {
  const routes = new Hono<CatalogueAppEnv>();
  routes.use("*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); });
  routes.post("/razorpay", async c => {
    try { const data = await new SubscriptionService(c.env).webhook(c.req.raw); ensureApiRequestId(c); return c.json({ data }); }
    catch (error) { if (error instanceof SubscriptionError) return apiError(c, error.status, error.code, error.message);
      return apiError(c, 503, "webhook_unavailable", "The webhook could not be processed. Retry this delivery."); }
  });
  return routes;
}

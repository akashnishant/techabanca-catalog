import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { isManagementHost, readCatalogueDeployment } from "@techabanca/domain";
import type { CatalogueAppEnv } from "./app-env";
import { requireSameOrigin } from "./middleware/require-same-origin";
import { createAssetRoutes } from "./routes/asset-routes";
import { createAttributeRoutes } from "./routes/attribute-routes";
import { createAuthRoutes } from "./routes/auth-routes";
import { createCategoryRoutes } from "./routes/category-routes";
import { createItemRoutes } from "./routes/item-routes";
import { createMediaRoutes } from "./routes/media-routes";
import { createPublicationRoutes } from "./routes/publication-routes";
import { createOnboardingRoutes } from "./routes/onboarding-routes";
import { createTenantAccessRoutes } from "./routes/tenant-access-routes";
import { createEnquiryRoutes } from "./routes/enquiry-routes";
import { purgeExpiredEnquiries } from "./services/enquiry-service";
import { createSubscriptionRoutes, createPaymentWebhookRoutes } from "./routes/subscription-routes";
const app = new Hono<CatalogueAppEnv>();
app.use("*", async (c, next) => {
  c.header("X-Robots-Tag", "noindex, nofollow");
  const deployment = readCatalogueDeployment(c.env.DEPLOYMENT_ENVIRONMENT);
  if (deployment === null) return c.json({ error: { code: "deployment_unavailable", message: "This workspace is unavailable." } }, 503);
  c.header("X-Techabanca-Environment", deployment);
  const url = new URL(c.req.url);
  if (!isManagementHost(url, deployment)) return c.text("Not found", 404);
  if (deployment !== "local" && url.protocol !== "https:") {
    url.protocol = "https:";
    return c.redirect(url.toString(), 308);
  }
  await next();
  if (c.res.headers.get("Content-Type")?.startsWith("text/html")) c.header("Cache-Control", "no-store");
});
app.use("/api/*", secureHeaders());
app.use("/api/v1/auth/*", requireSameOrigin);
app.use("/api/v1/onboarding/*", requireSameOrigin);
app.use("/api/v1/catalogue/*", requireSameOrigin);
app.get("/robots.txt", c => c.text("User-agent: *\nDisallow: /\n"));
app.get("/api/health", c => c.json({ status: "ok", service: "techabanca-catalogue-app" }));
app.route("/api/v1/auth", createAuthRoutes());
app.route("/api/v1/auth", createTenantAccessRoutes());
app.route("/api/v1/onboarding", createOnboardingRoutes());
app.route("/api/v1/catalogue", createPublicationRoutes());
app.route("/api/v1/catalogue", createEnquiryRoutes());
app.route("/api/v1/catalogue", createSubscriptionRoutes());
app.route("/api/v1/payments/webhooks", createPaymentWebhookRoutes());
app.route("/api/v1/catalogue", createMediaRoutes());
app.route("/api/v1/catalogue", createAssetRoutes());
app.route("/api/v1/catalogue", createAttributeRoutes());
app.route("/api/v1/catalogue", createCategoryRoutes());
app.route("/api/v1/catalogue", createItemRoutes());
app.notFound(async c => {
  if (new URL(c.req.url).pathname.startsWith("/api")) return c.json({ error: { code: "not_found", message: "The endpoint was not found." } }, 404);
  if (!c.env.STATIC_ASSETS) return c.text("Not found", 404);
  const response = await c.env.STATIC_ASSETS.fetch(c.req.raw);
  return c.newResponse(response.body, response);
});
export default Object.assign(app, {
  async scheduled(controller: ScheduledController, env: CatalogueAppEnv["Bindings"]) {
    if (controller.cron !== "0 3 * * *" || readCatalogueDeployment(env.DEPLOYMENT_ENVIRONMENT) === null) return;
    const cleanup = await purgeExpiredEnquiries(env.DB);
    if (cleanup.hasMore) throw new Error("enquiry_retention_backlog");
  },
});

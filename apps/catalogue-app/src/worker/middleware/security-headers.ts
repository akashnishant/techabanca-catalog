import { createMiddleware } from "hono/factory";
import type { CatalogueAppEnv } from "../app-env";
// The local Vite server needs its refresh script and WebSocket. Hosted HTML
// permits only bundled scripts and the explicitly integrated challenge provider.
export const securityHeaders = createMiddleware<CatalogueAppEnv>(async (c, next) => {
  await next();
  const url = new URL(c.req.url);
  if (c.env.DEPLOYMENT_ENVIRONMENT === "local" && url.hostname.endsWith(".localhost")) return;
  const local = c.env.DEPLOYMENT_ENVIRONMENT === "local";
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!local && url.protocol === "https:") c.header("Strict-Transport-Security", "max-age=31536000");
  if (!c.res.headers.has("Content-Security-Policy")) c.header("Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; "
    + "script-src 'self' https://challenges.cloudflare.com" + (local ? " 'unsafe-inline'" : "") + "; "
    + "style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; "
    + "connect-src 'self' https://challenges.cloudflare.com" + (local ? " ws://127.0.0.1:* ws://localhost:*" : "") + "; "
    + "frame-src https://challenges.cloudflare.com; worker-src 'self'");
  if (url.pathname.startsWith("/api") || c.res.headers.get("Content-Type")?.startsWith("text/html")) c.header("Cache-Control", c.res.headers.get("Cache-Control")?.startsWith("private") ? "private, no-store" : "no-store");
});

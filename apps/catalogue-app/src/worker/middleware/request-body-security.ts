import { createMiddleware } from "hono/factory";
import { parseStrictJson } from "@techabanca/domain";
import type { CatalogueAppEnv } from "../app-env";
import { apiError } from "../http/api-response";
import { boundedRequestBytes, RequestBodyError } from "../http/request-json";
// Finish bounded JSON bodies before resolving authentication and membership.
// Signed binary uploads and raw payment webhooks retain their route validation.
export const requestBodySecurity = createMiddleware<CatalogueAppEnv>(async (c, next) => {
  if (!c.req.raw.body || !["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)
    || !/^application\/json(?:\s*;|$)/i.test(c.req.header("Content-Type") ?? "")
    || c.req.path.startsWith("/api/v1/payments/webhooks/")) return next();
  try {
    const max = c.req.path.startsWith("/api/v1/catalogue/assets/") ? 8192
      : c.req.path.startsWith("/api/v1/auth/") || c.req.path.startsWith("/api/v1/catalogue/subscription") ? 16384 : 65536;
    const bytes = await boundedRequestBytes(c.req.raw, max);
    parseStrictJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    c.req.raw = new Request(c.req.raw, { body: bytes });
  } catch (error) {
    if (error instanceof RequestBodyError && error.status === 413) return apiError(c, 413, "request_too_large", "The request is too large.");
    return apiError(c, 400, "invalid_request", "A valid, bounded JSON request body is required.");
  }
  await next();
});

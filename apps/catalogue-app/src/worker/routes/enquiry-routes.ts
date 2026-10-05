import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { apiError, ensureApiRequestId } from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { EnquiryError, EnquiryService } from "../services/enquiry-service";

async function input(request: Request, keys: string[]) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    throw new EnquiryError(400, "invalid_request", "Send a JSON enquiry request.");
  const reader = request.body?.getReader(); if (!reader) throw new EnquiryError(400, "invalid_request", "Send an enquiry request.");
  const bytes = new Uint8Array(16384); let length = 0;
  try { for (;;) { const chunk = await reader.read(); if (chunk.done) break;
    if (length + chunk.value.length > bytes.length) { await reader.cancel(); throw new EnquiryError(400, "invalid_request", "The enquiry request is too large."); }
    bytes.set(chunk.value, length); length += chunk.value.length;
  }} finally { reader.releaseLock(); }
  let value: Record<string, unknown>;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes.subarray(0, length))); }
  catch { throw new EnquiryError(400, "invalid_request", "Send a valid enquiry request."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== keys.sort().join(",")
    || !Number.isSafeInteger(value.version) || (value.version as number) <= 0)
    throw new EnquiryError(400, "invalid_request", "Refresh the enquiry before trying again.");
  return value;
}
export function createEnquiryRoutes() {
  const routes = new Hono<CatalogueAppEnv>(), auth = [requireAuthentication, requireTenantAccess] as const;
  routes.use("/enquiries*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); c.header("Referrer-Policy", "no-referrer"); });
  routes.get("/enquiries", ...auth, async c => {
    try {
      const data = await new EnquiryService(c.env.DB).list(c.get("tenantAccess").tenant, new URL(c.req.url).searchParams);
      ensureApiRequestId(c); return c.json({ data });
    } catch (error) { if (error instanceof EnquiryError) return apiError(c, error.status, error.code, error.message);
      return apiError(c, 503, "enquiries_unavailable", "Enquiries are temporarily unavailable. Please try again."); }
  });
  routes.get("/enquiries/:id", ...auth, async c => {
    try { const data = await new EnquiryService(c.env.DB).detail(c.get("tenantAccess").tenant, c.req.param("id"));
      ensureApiRequestId(c); return c.json({ data });
    } catch (error) { if (error instanceof EnquiryError) return apiError(c, error.status, error.code, error.message);
      return apiError(c, 503, "enquiries_unavailable", "Enquiries are temporarily unavailable. Please try again."); }
  });
  for (const action of ["status", "notes"] as const) routes.post("/enquiries/:id/" + action, ...auth, async c => {
    try {
      const access = c.get("tenantAccess"), actor = { role: access.role, userId: c.get("authSession").userId };
      // Reject read-only callers before parsing their body.
      if (actor.role !== "owner" && actor.role !== "admin") throw new EnquiryError(403, "enquiry_read_only", "Only owners and admins can manage enquiries.");
      const body = await input(c.req.raw, ["version", action === "status" ? "status" : "note"]);
      if (typeof body[action === "status" ? "status" : "note"] !== "string") throw new EnquiryError(400, "invalid_request", "Check the enquiry request.");
      const service = new EnquiryService(c.env.DB);
      const data = action === "status"
        ? await service.status(access.tenant, actor, c.req.param("id") ?? "", body.version as number, body.status as string)
        : await service.note(access.tenant, actor, c.req.param("id") ?? "", body.version as number, body.note as string);
      ensureApiRequestId(c); return c.json({ data });
    } catch (error) { if (error instanceof EnquiryError) return apiError(c, error.status, error.code, error.message);
      return apiError(c, 503, "enquiries_unavailable", "The enquiry could not be changed. Refresh and try again."); }
  });
  routes.delete("/enquiries/:id", ...auth, async c => {
    try { const access = c.get("tenantAccess");
      if (access.role !== "owner" && access.role !== "admin") throw new EnquiryError(403, "enquiry_read_only", "Only owners and admins can manage enquiries.");
      const body = await input(c.req.raw, ["version"]);
      await new EnquiryService(c.env.DB).remove(access.tenant, access.role, c.req.param("id") ?? "", body.version as number);
      return c.body(null, 204);
    } catch (error) { if (error instanceof EnquiryError) return apiError(c, error.status, error.code, error.message);
      return apiError(c, 503, "enquiries_unavailable", "The enquiry could not be deleted. Refresh and try again."); }
  });
  return routes;
}

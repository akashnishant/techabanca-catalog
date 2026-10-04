import { hasPublicIdPrefix } from "@techabanca/domain";
import { Hono, type Context } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { apiError, ensureApiRequestId } from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { PublicationError, PublicationService } from "../services/publication-service";
type PublicationContext = Context<CatalogueAppEnv>;
async function input(c: PublicationContext, withId = false) {
 if (!c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")) throw new PublicationError(400, "invalid_request", "Send a JSON publication request.");
 const reader = c.req.raw.body?.getReader();
 if (!reader) throw new PublicationError(400, "invalid_request", "A publication request body is required.");
 const bytes = new Uint8Array(2048); let length = 0;
 try { for (;;) { const chunk = await reader.read(); if (chunk.done) break;
  if (chunk.value.length > bytes.length - length) { await reader.cancel(); throw new PublicationError(413, "request_too_large", "Publication request is too large."); }
  bytes.set(chunk.value, length); length += chunk.value.length;
 }} finally { reader.releaseLock(); }
 let value: unknown;
 try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes.subarray(0, length))); }
 catch { throw new PublicationError(400, "invalid_request", "Send a valid JSON publication request."); }
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new PublicationError(400, "invalid_request", "Check the publication request.");
 const body = value as { sourceRevision: number; publicationId?: string };
 const keys = Object.keys(body).sort().join(",");
 if (keys !== (withId ? "publicationId,sourceRevision" : "sourceRevision") || !Number.isSafeInteger(body.sourceRevision) || body.sourceRevision <= 0
  || (withId && (!body.publicationId || !hasPublicIdPrefix(body.publicationId, "pub")))) {
  throw new PublicationError(400, "invalid_request", "Refresh the publication details and try again.");
 }
 return body;
}
function failure(c: PublicationContext, error: unknown) {
 if (error instanceof PublicationError) return apiError(c, error.status, error.code, error.message);
 if (error instanceof Error && /publication_source_changed|NOT NULL constraint failed: published_catalogues.publication_id|UNIQUE constraint failed: public_catalogue_routes/.test(error.message)) {
  return apiError(c, 409, "publication_source_changed", "The catalogue or public address changed. Refresh and prepare a new preview.");
 }
 return apiError(c, 503, "publication_unavailable", "Publishing is temporarily unavailable. Your live catalogue has not been changed.");
}
function service(c: PublicationContext) { return new PublicationService(c.env.DB, c.env.ASSETS, c.env); }
function actor(c: PublicationContext) { return { role: c.get("tenantAccess").role, userId: c.get("authSession").userId }; }
export function createPublicationRoutes() {
 const routes = new Hono<CatalogueAppEnv>();
 const auth = [requireAuthentication, requireTenantAccess] as const;
 routes.use("/publications*", async (c, next) => { await next(); c.header("Cache-Control", "no-store"); c.header("Referrer-Policy", "no-referrer"); });
 routes.get("/publications", ...auth, async c => {
  try { const data = await service(c).status(c.get("tenantAccess").tenant, actor(c), c.req.url); ensureApiRequestId(c); return c.json({ data }); }
  catch (error) { return failure(c, error); }
 });
 routes.post("/publications/prepare", ...auth, async c => {
  try { const body = await input(c); const data = await service(c).prepare(c.get("tenantAccess").tenant, actor(c), body.sourceRevision, c.req.url);
   ensureApiRequestId(c); return c.json({ data }, 201); } catch (error) { return failure(c, error); }
 });
 routes.post("/publications/activate", ...auth, async c => {
  try { const body = await input(c, true); const data = await service(c).activate(c.get("tenantAccess").tenant, actor(c), body.publicationId!, body.sourceRevision, c.req.url);
   ensureApiRequestId(c); return c.json({ data }); } catch (error) { return failure(c, error); }
 });
 routes.post("/publications/unpublish", ...auth, async c => {
  try { const body = await input(c, true); await service(c).unpublish(c.get("tenantAccess").tenant, actor(c), body.sourceRevision, body.publicationId!);
   return c.body(null, 204); } catch (error) { return failure(c, error); }
 });
 routes.delete("/publications/:publicationId", ...auth, async c => {
  try { const id = c.req.param("publicationId"); if (!hasPublicIdPrefix(id, "pub")) throw new PublicationError(400, "invalid_publication_id", "Choose a valid publication.");
   await service(c).discard(c.get("tenantAccess").tenant, actor(c), id); return c.body(null, 204); }
  catch (error) { return failure(c, error); }
 });
 return routes;
}

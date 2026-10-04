import { hasPublicIdPrefix } from "@techabanca/domain";
import { Hono, type Context } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { apiError, ensureApiRequestId } from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { MediaRepository } from "../repositories/media-repository";
import { MediaError, MediaService, parseItemMedia, parseWebsiteMedia } from "../services/media-service";
type MediaContext = Context<CatalogueAppEnv>;
function mutate(c: MediaContext) {
  if (!["owner", "admin"].includes(c.get("tenantAccess").role)) throw new MediaError(403, "insufficient_permissions", "Owner or admin access is required.");
}
async function json(c: MediaContext): Promise<unknown> {
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new MediaError(400, "invalid_request", "A JSON request body is required.");
  const buffer = new Uint8Array(16384);
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value.length > buffer.length - length) {
        await reader.cancel();
        throw new MediaError(413, "request_too_large", "Media request is too large.");
      }
      buffer.set(chunk.value, length);
      length += chunk.value.length;
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(buffer.subarray(0, length))); }
  catch { throw new MediaError(400, "invalid_request", "A valid JSON request body is required."); }
}
function failure(c: MediaContext, error: unknown) {
  if (error instanceof MediaError) return apiError(c, error.status, error.code, error.message);
  if (error instanceof Error && /invalid_item_(image|document)_asset|invalid_catalogue_(logo|hero)_asset/.test(error.message)) {
    return apiError(c, 400, "invalid_media_asset", "A chosen file is no longer available. Reload and choose a verified file.");
  }
  return apiError(c, 500, "internal_error", "Media could not be saved or loaded.");
}
export function createMediaRoutes() {
  const routes = new Hono<CatalogueAppEnv>();
  const auth = [requireAuthentication, requireTenantAccess] as const;
  routes.get("/assets", ...auth, async c => {
    try {
      const kind = c.req.query("kind");
      const after = c.req.query("after");
      if ((kind !== "image" && kind !== "document") || (after !== undefined && !hasPublicIdPrefix(after, "ast"))) {
        throw new MediaError(400, "invalid_asset_filter", "Choose images or documents and a valid cursor.");
      }
      const data = await new MediaRepository(c.env.DB).readyAssets(c.get("tenantAccess").tenant, kind, after ?? null);
      c.header("Cache-Control", "no-store");
      ensureApiRequestId(c);
      return c.json({ data });
    } catch (error) { return failure(c, error); }
  });
  routes.get("/items/:itemId/media", ...auth, async c => {
    try {
      const media = await new MediaService(c.env.DB).getItem(c.get("tenantAccess").tenant, c.req.param("itemId"));
      c.header("Cache-Control", "no-store"); ensureApiRequestId(c);
      return c.json({ data: { media } });
    } catch (error) { return failure(c, error); }
  });
  routes.put("/items/:itemId/media", ...auth, async c => {
    try {
      mutate(c);
      const input = parseItemMedia(await json(c));
      const media = await new MediaService(c.env.DB).replaceItem(c.get("tenantAccess").tenant, c.req.param("itemId"), input);
      c.header("Cache-Control", "no-store"); ensureApiRequestId(c);
      return c.json({ data: { media } });
    } catch (error) { return failure(c, error); }
  });
  routes.get("/website/media", ...auth, async c => {
    try {
      const media = await new MediaService(c.env.DB).getWebsite(c.get("tenantAccess").tenant);
      c.header("Cache-Control", "no-store"); ensureApiRequestId(c);
      return c.json({ data: { media } });
    } catch (error) { return failure(c, error); }
  });
  routes.put("/website/media", ...auth, async c => {
    try {
      mutate(c);
      const media = await new MediaService(c.env.DB).replaceWebsite(c.get("tenantAccess").tenant, parseWebsiteMedia(await json(c)));
      c.header("Cache-Control", "no-store"); ensureApiRequestId(c);
      return c.json({ data: { media } });
    } catch (error) { return failure(c, error); }
  });
  return routes;
}

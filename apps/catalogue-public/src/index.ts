import { Hono } from "hono";
import { hasPublicIdPrefix, isValidItemSlug } from "@techabanca/domain";
import { publicThemeCss } from "@techabanca/themes";
import type { PublicBindings } from "./model";
import { PublicRepository } from "./repository";
import { FilterError, readFilters, resolveHost } from "./routing";
import { about, catalogue, contact, home, itemDetail, unavailable } from "./render";
import { serveMedia } from "./media";
import { faviconSvg } from "./brand";

const app = new Hono<{ Bindings: PublicBindings }>();
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Cache-Control", "no-store");
});
app.get("/health", c => c.json({ status: "ok", service: "techabanca-catalogue-public" }));
app.get("/favicon.svg", c => {
  c.header("Content-Type", "image/svg+xml; charset=utf-8");
  return c.body(faviconSvg);
});
app.get("/theme.css", c => {
  c.header("Content-Type", "text/css; charset=utf-8");
  return c.body(publicThemeCss(c.req.query("theme") ?? "professional"));
});
function html(request: Request, body: string, status = 200): Response {
  return new Response(request.method === "HEAD" ? null : body, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...(status === 405 ? { Allow: "GET, HEAD" } : {}) } });
}
app.all("*", async c => {
  const request = c.req.raw;
  if (request.method !== "GET" && request.method !== "HEAD") {
    c.header("Allow", "GET, HEAD");
    return html(request, unavailable("Method not allowed", "Use a catalogue page link to continue."), 405);
  }
  const url = new URL(request.url);
  const host = resolveHost(url, c.env.LOCAL_PREVIEW === "true");
  if (!host) return html(request, unavailable(), 404);
  if (!host.local && url.protocol !== "https:") {
    url.protocol = "https:"; url.port = "";
    return c.redirect(url.toString(), 308);
  }
  const repository = new PublicRepository(c.env.DB);
  const site = await repository.site(host.slug);
  if (!site) return html(request, unavailable(), 404);
  const path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) return c.redirect(path.slice(0, -1) + url.search, 308);
  const mediaMatch = /^\/media\/(pub_[a-f0-9]{32})\/(ast_[a-f0-9]{32})$/.exec(path);
  if (mediaMatch) {
    if (mediaMatch[1] !== site.publication_public_id || !hasPublicIdPrefix(mediaMatch[2], "ast")) return html(request, unavailable(), 404);
    const media = await repository.media(site, mediaMatch[2]);
    if (!media) return html(request, unavailable(), 404);
    return serveMedia(request, c.env.ASSETS, media);
  }
  if (path === "/robots.txt") {
    c.header("Content-Type", "text/plain; charset=utf-8");
    return new Response(request.method === "HEAD" ? null : "User-agent: *\n" + (host.preview ? "Disallow: /\n" : "Allow: /\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const categories = await repository.categories(site);
  if (path === "/") {
    const featured = site.show_featured_items === 1 ? await repository.items(site, { query: "", type: "all", category: "", page: 1, featured: true }, null, 6) : { items: [] };
    return html(request, home(site, host, categories, featured.items));
  }
  if (path === "/about" && site.show_about === 1) return html(request, about(site, host));
  if (path === "/contact" && site.show_contact === 1) {
    const itemSlug = url.searchParams.get("item");
    if (itemSlug && !isValidItemSlug(itemSlug)) return html(request, unavailable("Item not found", "This item is not available in this catalogue.", site, host, path), 404);
    const detail = itemSlug ? await repository.detail(site, itemSlug) : null;
    if (itemSlug && !detail) return html(request, unavailable("Item not found", "This item is not available in this catalogue.", site, host, path), 404);
    return html(request, contact(site, host, detail?.item));
  }
  const itemMatch = /^\/items\/([^/]+)$/.exec(path);
  if (itemMatch) {
    let slug: string;
    try { slug = decodeURIComponent(itemMatch[1]); } catch { slug = ""; }
    const detail = isValidItemSlug(slug) ? await repository.detail(site, slug) : null;
    if (!detail) return html(request, unavailable("Item not found", "This item is not available in this catalogue.", site, host, path), 404);
    return html(request, itemDetail(site, host, categories, detail));
  }
  const categoryMatch = /^\/categories\/([^/]+)$/.exec(path);
  if (path === "/catalogue" || (categoryMatch && site.show_categories === 1)) {
    try {
      const filters = readFilters(url);
      if (categoryMatch) { try { filters.category = decodeURIComponent(categoryMatch[1]); } catch { throw new FilterError("Check the category address and try again."); } }
      if (filters.category && site.show_categories !== 1) throw new FilterError("Category filtering is unavailable.");
      const category = filters.category ? categories.find(category => category.slug === filters.category) : undefined;
      if (filters.category && !category) return html(request, unavailable("Category not found", "This category is not available in this catalogue.", site, host, path), 404);
      const page = await repository.items(site, filters, category?.category_public_id);
      if (filters.page > Math.max(1, Math.ceil(page.total / page.pageSize))) return html(request, unavailable("Page not found", "Choose a page from the catalogue results.", site, host, path), 404);
      return html(request, catalogue(site, host, categories, page, filters, categoryMatch ? category : undefined));
    } catch (error) {
      if (error instanceof FilterError) return html(request, unavailable("Check your search", error.message, site, host, path), 400);
      throw error;
    }
  }
  return html(request, unavailable("Page not found", "The page you requested could not be found. Browse the catalogue to continue.", site, host, path), 404);
});
app.onError((_error, c) => html(c.req.raw, unavailable("Catalogue temporarily unavailable", "Please try again in a little while."), 503));
export default app;

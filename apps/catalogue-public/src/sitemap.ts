import type { Site } from "./model";
import type { PublicHost } from "./routing";
import type { PublicRepository } from "./repository";

export const SITEMAP_PAGE_SIZE = 1000;
export type SitemapKind = "items" | "categories";
// A sitemap index is bounded by the protocol's 50,000-entry limit.
const MAX_SHARDS = 49999;
const xmlns = ' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
function xml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}
function response(request: Request, body: string): Response {
  return new Response(request.method === "HEAD" ? null : body, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function entries(origin: string, paths: string[]): string {
  return '<?xml version="1.0" encoding="UTF-8"?><urlset' + xmlns + '>'
    + paths.map(path => "<url><loc>" + xml(origin + path) + "</loc></url>").join("") + "</urlset>";
}
export async function sitemap(request: Request, site: Site, host: PublicHost, repository: PublicRepository, path: string): Promise<Response | null> {
  // Staging/local and signed candidates have no discovery documents.
  if (host.preview || host.privatePreview) return null;
  if (path === "/sitemap.xml") {
    const counts = await repository.sitemapCounts(site);
    const itemPages = Math.ceil(counts.items / SITEMAP_PAGE_SIZE);
    const categoryPages = Math.ceil(counts.categories / SITEMAP_PAGE_SIZE);
    if (itemPages + categoryPages > MAX_SHARDS) throw new Error("sitemap_index_limit");
    const paths = ["/sitemap-pages.xml",
      ...Array.from({ length: itemPages }, (_, index) => "/sitemap-items-" + (index + 1) + ".xml"),
      ...Array.from({ length: categoryPages }, (_, index) => "/sitemap-categories-" + (index + 1) + ".xml")];
    return response(request, '<?xml version="1.0" encoding="UTF-8"?><sitemapindex' + xmlns + '>'
      + paths.map(path => "<sitemap><loc>" + xml(host.canonicalOrigin + path) + "</loc></sitemap>").join("") + "</sitemapindex>");
  }
  if (path === "/sitemap-pages.xml") {
    return response(request, entries(host.canonicalOrigin, ["/", "/catalogue",
      ...(site.show_about === 1 ? ["/about"] : []), ...(site.show_contact === 1 ? ["/contact"] : [])]));
  }
  const match = /^\/sitemap-(items|categories)-([1-9][0-9]{0,4})\.xml$/.exec(path);
  if (!match || Number(match[2]) > MAX_SHARDS) return null;
  const kind = match[1] as SitemapKind;
  if (kind === "categories" && site.show_categories !== 1) return null;
  const slugs = await repository.sitemapSlugs(site, kind, Number(match[2]), SITEMAP_PAGE_SIZE);
  if (!slugs.length) return null;
  return response(request, entries(host.canonicalOrigin, slugs.map(slug => "/" + kind + "/" + encodeURIComponent(slug))));
}

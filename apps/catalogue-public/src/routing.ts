import { isValidCatalogueSlug, readCatalogueDeployment } from "@techabanca/domain";
import type { Filters } from "./model";

const reserved = new Set(["www", "techabanca", "billing", "billing-api", "catalogue", "catalogue-preview", "catalog", "api", "admin", "support", "help", "legal", "privacy", "security", "mail", "status", "assets", "static"]);
export type PublicHost = { slug: string; preview: boolean; privatePreview?: boolean; local: boolean; canonicalOrigin: string };
export function resolveHost(url: URL, localEnabled = false, environment?: string): PublicHost | null {
  const deployment = readCatalogueDeployment(environment);
  if (deployment === null || (deployment !== "local" && url.port !== "")) return null;
  const hostname = url.hostname.toLowerCase();
  let slug: string;
  let preview = false;
  let local = false;
  if (deployment !== "production" && hostname.endsWith(".catalogue-preview.techabanca.com")) {
    slug = hostname.slice(0, -".catalogue-preview.techabanca.com".length); preview = true;
  } else if (deployment !== "staging" && hostname.endsWith(".techabanca.com")) {
    slug = hostname.slice(0, -".techabanca.com".length);
  } else if (deployment === "local" && localEnabled && hostname.endsWith(".localhost")) {
    slug = hostname.slice(0, -".localhost".length); preview = true; local = true;
  } else return null;
  if (!isValidCatalogueSlug(slug) || reserved.has(slug) || /^(draft|deleted)-/.test(slug)) return null;
  return { slug, preview, local, canonicalOrigin: "https://" + slug + ".techabanca.com" };
}
export class FilterError extends Error {}
export function readFilters(url: URL): Filters {
  const query = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type") ?? "all";
  const category = url.searchParams.get("category") ?? "";
  const pageText = url.searchParams.get("page") ?? "1";
  if (query.length > 100 || !["all", "product", "service"].includes(type)
    || !/^\d{1,4}$/.test(pageText) || Number(pageText) < 1
    || category.length > 80) throw new FilterError("Check your search and filters, then try again.");
  return { query, type: type as Filters["type"], category, page: Number(pageText) };
}
export function filterUrl(path: string, filters: Filters, page: number): string {
  const search = new URLSearchParams();
  if (filters.query) search.set("q", filters.query);
  if (filters.type !== "all") search.set("type", filters.type);
  if (filters.category && !path.startsWith("/categories/")) search.set("category", filters.category);
  if (page > 1) search.set("page", String(page));
  return path + (search.size ? "?" + search.toString() : "");
}
export function mediaUrl(site: { publication_public_id: string }, assetId: string): string {
  return "/media/" + encodeURIComponent(site.publication_public_id) + "/" + encodeURIComponent(assetId);
}

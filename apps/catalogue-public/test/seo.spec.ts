import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { signPreview } from "@techabanca/domain";
import app from "../src";
import { PublicRepository } from "../src/repository";
import { resolveHost } from "../src/routing";
import { contact } from "../src/render";
import { SITEMAP_PAGE_SIZE, sitemap } from "../src/sitemap";
import { createFixture, publicId, now } from "./fixtures";

const secret = "b".repeat(64);
const bindings = { ...env, DEPLOYMENT_ENVIRONMENT: "production", PUBLICATION_PREVIEW_SECRET: secret };
type Fixture = Awaited<ReturnType<typeof createFixture>>;
const get = (f: Fixture, path = "/", options: RequestInit = {}) => app.fetch(new Request(f.origin + path, options), bindings);
const text = async (f: Fixture, path = "/") => (await get(f, path)).text();
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
async function candidate(f: Fixture) {
  const id = f.n + 3000000, publicPublication = publicId("pub", id);
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  await env.DB.prepare("INSERT INTO catalogue_publications (id,public_id,catalogue_id,catalogue_public_id,revision_number,state,source_catalogue_version,created_at,preview_expires_at) VALUES (?,?,?,?,2,'building',1,?,?)")
    .bind(id, publicPublication, f.n, f.catalogueId, now, new Date(expiresAt * 1000).toISOString()).run();
  for (const table of ["published_catalogues", "published_categories", "published_items", "published_item_attributes", "published_item_images", "published_item_documents"]) {
    const columns = (await env.DB.prepare("PRAGMA table_info(" + table + ")").all<{ name: string }>()).results.map(row => row.name).filter(name => name !== "publication_id");
    await env.DB.prepare("INSERT INTO " + table + " (publication_id," + columns.join(",") + ") SELECT ?," + columns.join(",") + " FROM " + table + " WHERE publication_id=?").bind(id, f.n).run();
  }
  return { id, publicPublication, expiresAt };
}
async function activate(f: Fixture, id: number) {
  await env.DB.batch([
    env.DB.prepare("UPDATE catalogue_publications SET state='retired',retired_at=? WHERE id=?").bind(now, f.n),
    env.DB.prepare("UPDATE catalogue_publications SET state='active',activated_at=? WHERE id=?").bind(now, id),
    env.DB.prepare("UPDATE public_catalogue_routes SET publication_id=?,updated_at=? WHERE slug=?").bind(id, now, f.slug),
  ]);
}

describe("published catalogue SEO", () => {
  it("uses immutable published home metadata and absolute sharing images", async () => {
    const f = await createFixture(), html = await text(f);
    expect(html).toContain("<title>Northstar products and services</title>");
    expect(html).toContain('name="description" content="Published SEO description."');
    expect(html).toContain('rel="canonical" href="' + f.origin + '/"');
    expect(html).toContain('property="og:site_name" content="Northstar Supply"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:image" content="' + f.origin + "/media/" + f.publicationId + "/" + f.heroId + '"');
    expect(html).not.toContain("SECRET");
  });
  it("falls back from blank metadata and normalizes whitespace", async () => {
    const f = await createFixture({ seo_title: "   ", seo_description: "   ", hero_subtitle: "Useful\n  published selection" });
    const html = await text(f);
    expect(html).toContain("<title>Northstar Supply | Northstar Catalogue</title>");
    expect(html).toContain('name="description" content="Useful published selection"');
  });
  it("escapes and bounds hostile published metadata without enabling scripts", async () => {
    const hostile = '"><script>alert(1)</script>&', f = await createFixture({ seo_title: hostile.repeat(30), seo_description: hostile.repeat(30), business_name: hostile });
    const html = await text(f);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('content=""><script');
    expect(html.match(/<title>(.*?)<\/title>/)?.[1].length).toBeLessThan(1200);
    expect(html).not.toContain("onerror=");
    expect((await get(f)).headers.get("Content-Security-Policy")).toContain("script-src 'none'");
  });
  it("uses contextual About and Contact descriptions", async () => {
    const f = await createFixture();
    expect(await text(f, "/about")).toContain('name="description" content="Published business introduction."');
    expect(await text(f, "/contact")).toContain('name="description" content="Contact Northstar Supply for availability, product details or a quote."');
  });
  it("uses item content and its actual image alternative text", async () => {
    const f = await createFixture(), html = await text(f, "/items/precision-pump");
    expect(html).toContain('name="description" content="Reliable pump for everyday requirements."');
    expect(html).toContain('property="og:image:alt" content="Front of Precision Pump"');
    expect(html).toContain('name="twitter:image" content="' + f.origin + "/media/" + f.publicationId + "/" + f.imageId + '"');
  });
  it("keeps pages without an image on the summary card", async () => {
    const f = await createFixture({ hero_asset_public_id: null, hero_object_key: null, logo_asset_public_id: null, logo_object_key: null });
    const html = await text(f);
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(html).not.toContain('property="og:image"');
    expect(html).not.toContain('name="twitter:image"');
  });
  it("gives page two its own canonical, title and index policy", async () => {
    const f = await createFixture({}, 30), html = await text(f, "/catalogue?page=2&utm_source=ignored");
    expect(html).toContain('rel="canonical" href="' + f.origin + '/catalogue?page=2"');
    expect(html).toContain("<title>Catalogue – Page 2 | Northstar Supply</title>");
    expect(html).toContain('content="index,follow"');
    expect(html).toContain('href="/catalogue"');
  });
  it("normalizes page one, default filters and tracking parameters", async () => {
    const f = await createFixture(), html = await text(f, "/catalogue?page=01&type=all&q=&utm_campaign=test");
    expect(html).toContain('rel="canonical" href="' + f.origin + '/catalogue"');
    expect(html).not.toContain("utm_campaign");
  });
  it.each(["q=pump", "type=product", "category=hardware"])("keeps filtered listing %s out of the index", async query => {
    const f = await createFixture(), html = await text(f, "/catalogue?" + query);
    expect(html).toContain('content="noindex,follow"');
    expect(html).toContain('rel="canonical" href="' + f.origin + '/catalogue?' + query + '"');
  });
  it("indexes fixed category pages and their subsequent pages", async () => {
    const f = await createFixture({}, 30);
    for (const path of ["/categories/hardware", "/categories/hardware?page=2"]) {
      const html = await text(f, path);
      expect(html).toContain('content="index,follow"');
      expect(html).toContain('rel="canonical" href="' + f.origin + path + '"');
    }
  });
  it("marks search errors and missing pages noindex without discovery metadata", async () => {
    const f = await createFixture();
    for (const path of ["/missing", "/catalogue?page=9999", "/catalogue?page=0", "/items/hidden-only"]) {
      const response = await get(f, path), html = await response.text();
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(html).toContain('content="noindex,follow"');
      expect(html).not.toContain('rel="canonical"');
      expect(html).not.toContain('property="og:url"');
      expect(html).not.toContain("itemscope");
      expect(html).not.toContain('name="twitter:image"');
    }
  });
  it("keeps item-specific and receipt contact views noindex", async () => {
    const f = await createFixture();
    for (const path of ["/contact?item=precision-pump", "/contact?sent=1"]) expect(await text(f, path)).toContain('content="noindex,follow"');
    const site = (await new PublicRepository(env.DB).site(f.slug))!;
    const html = contact(site, resolveHost(new URL(f.origin))!, undefined, { notice: "Please retry" });
    expect(html).toContain('content="noindex,follow"');
  });
  it("describes visible site and organization names through script-free microdata", async () => {
    const f = await createFixture(), html = await text(f);
    for (const type of ["WebSite", "Organization"]) expect(html).toContain('itemtype="https://schema.org/' + type + '"');
    expect(html).toContain('itemprop="name" content="Northstar Supply"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("aggregateRating");
    expect(html).not.toContain("sameAs");
  });
  it.each([["precision-pump", "Product"], ["maintenance-visit", "Service"]])("describes %s using the correct schema type", async (slug, type) => {
    const f = await createFixture(), html = await text(f, "/items/" + slug);
    expect(html).toContain('itemtype="https://schema.org/' + type + '"');
    expect(html).toContain('itemprop="url" content="' + f.origin + "/items/" + slug + '"');
    expect(html).toContain('itemprop="description"');
    expect(html).toContain('itemtype="https://schema.org/BreadcrumbList"');
    expect(html).toContain('itemprop="position" content="4"');
    expect(html).not.toContain('itemprop="offers"');
    expect(html).not.toContain('itemprop="availability"');
    expect(html).not.toContain("999999");
  });
  it("includes visible product SKU and image in its own item scope", async () => {
    const f = await createFixture(), html = await text(f, "/items/precision-pump");
    expect(html).toContain('itemprop="sku">PUMP-01</span>');
    expect(html).toContain('<img itemprop="image"');
    expect(html).not.toContain("object_key");
  });
  it("excludes hidden contact and category data from schema", async () => {
    const f = await createFixture({ show_contact: 0, show_categories: 0, show_about: 0 });
    const html = await text(f, "/items/precision-pump");
    for (const value of ["orders@example.test", "98765", "Demo address", "Hardware", "/categories/"]) expect(html).not.toContain(value);
    expect(html).toContain('itemprop="position" content="3"');
  });
});

describe("fresh, bounded sitemap discovery", () => {
  it("advertises only the canonical production sitemap and protects private paths", async () => {
    const f = await createFixture(), robots = await text(f, "/robots.txt");
    expect(robots).toContain("Sitemap: " + f.origin + "/sitemap.xml");
    for (const path of ["/preview/", "/report", "/go/"]) expect(robots).toContain("Disallow: " + path);
    expect(robots).not.toContain("catalogue-preview");
  });
  it("separates static pages, items and populated categories", async () => {
    const f = await createFixture(), index = await text(f, "/sitemap.xml");
    expect(locs(index)).toEqual(["/sitemap-pages.xml", "/sitemap-items-1.xml", "/sitemap-categories-1.xml"].map(path => f.origin + path));
    const pages = await text(f, "/sitemap-pages.xml");
    expect(locs(pages)).toEqual(["/", "/catalogue", "/about", "/contact"].map(path => f.origin + path));
    expect(locs(await text(f, "/sitemap-items-1.xml"))).toEqual(["maintenance-visit", "precision-pump", "stainless-fastener"].map(slug => f.origin + "/items/" + slug));
    expect(locs(await text(f, "/sitemap-categories-1.xml"))).toEqual(["fasteners", "hardware", "services"].map(slug => f.origin + "/categories/" + slug));
    for (const value of ["SECRET", "hidden-only", "/report", "/media/", "/preview/", "?q=", "<lastmod>", "<priority>"]) expect(index + pages + await text(f, "/sitemap-items-1.xml")).not.toContain(value);
  });
  it("bounds a 1,003-item snapshot into complete, distinct shards", async () => {
    const f = await createFixture({}, 1000), index = await text(f, "/sitemap.xml");
    expect(index).toContain("/sitemap-items-2.xml");
    const first = locs(await text(f, "/sitemap-items-1.xml")), second = locs(await text(f, "/sitemap-items-2.xml"));
    expect(first.length).toBe(SITEMAP_PAGE_SIZE); expect(second.length).toBe(3);
    expect(new Set([...first, ...second]).size).toBe(1003);
    expect((await get(f, "/sitemap-items-3.xml")).status).toBe(404);
    for (const url of second) expect((await app.fetch(new Request(url), bindings)).status).toBe(200);
  });
  it("honors disabled public sections in discovery", async () => {
    const f = await createFixture({ show_about: 0, show_contact: 0, show_categories: 0 });
    expect(locs(await text(f, "/sitemap-pages.xml"))).toEqual([f.origin + "/", f.origin + "/catalogue"]);
    expect(await text(f, "/sitemap.xml")).not.toContain("sitemap-categories");
    expect((await get(f, "/sitemap-categories-1.xml")).status).toBe(404);
  });
  it("excludes empty categories while preserving populated parents and noindexes empty views", async () => {
    const f = await createFixture(), revision = await candidate(f);
    await env.DB.prepare("INSERT INTO published_categories (publication_id,category_public_id,name,slug) VALUES (?,?,'Empty','empty')").bind(revision.id, publicId("ctg", revision.id)).run();
    await env.DB.prepare("UPDATE published_items SET category_public_id=? WHERE publication_id=? AND slug='precision-pump'").bind(publicId("ctg",f.n*10+3),revision.id).run();
    await activate(f, revision.id);
    expect(await text(f, "/sitemap-categories-1.xml")).not.toContain("/categories/empty");
    expect(await text(f, "/sitemap-categories-1.xml")).toContain("/categories/hardware");
    expect(await text(f, "/categories/empty")).toContain('content="noindex,follow"');
  });
  it.each(["0", "01", "-1", "1.5", "99999", "100000", "evil"])("rejects invalid or absent sitemap shard %s", async page => {
    const f = await createFixture();
    expect((await get(f, "/sitemap-items-" + page + ".xml")).status).toBe(404);
  });
  it("serves XML with no-store, GET/HEAD parity and no validators", async () => {
    const f = await createFixture();
    for (const path of ["/sitemap.xml", "/sitemap-pages.xml", "/sitemap-items-1.xml", "/sitemap-categories-1.xml"]) {
      const response = await get(f, path), head = await get(f, path, { method: "HEAD", headers: { "If-None-Match": "*" } });
      expect(response.status).toBe(200); expect(head.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
      expect(head.headers.get("Content-Type")).toBe(response.headers.get("Content-Type"));
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await head.text()).toBe(""); expect(response.headers.get("ETag")).toBeNull();
    }
  });
  it.each([
    "UPDATE public_catalogue_routes SET status='suspended' WHERE publication_id=?",
    "UPDATE catalogues SET status='suspended' WHERE id=?",
    "UPDATE catalogues SET status='archived' WHERE id=?",
    "UPDATE catalogues SET deleted_at='2026-10-05' WHERE id=?",
    "UPDATE organizations SET status='suspended' WHERE id=?",
    "UPDATE organizations SET deleted_at='2026-10-05' WHERE id=?",
    "UPDATE subscriptions SET status='expired' WHERE organization_id=?",
    "UPDATE subscriptions SET trial_starts_at='2019-01-01T00:00:00.000Z',trial_ends_at='2020-01-01T00:00:00.000Z' WHERE organization_id=?",
    "UPDATE catalogue_publications SET state='retired',retired_at='2026-10-05' WHERE id=?",
  ])("rechecks publication access before discovery: %s", async sql => {
    const f = await createFixture();
    expect((await get(f, "/sitemap.xml")).status).toBe(200);
    await env.DB.prepare(sql).bind(f.n).run();
    for (const path of ["/sitemap.xml", "/sitemap-pages.xml", "/sitemap-items-1.xml", "/sitemap-categories-1.xml"]) {
      const response = await get(f, path, { headers: { "If-None-Match": "*" } });
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.text()).not.toContain(f.origin);
    }
  });
  it("ignores forwarded hosts and excludes reserved tenant routes", async () => {
    const f = await createFixture();
    expect(await text(f, "/sitemap.xml")).not.toContain("evil");
    expect((await get(f, "/sitemap.xml", { headers: { "X-Forwarded-Host": "evil.techabanca.com" } })).status).toBe(200);
    expect((await app.fetch(new Request('https://billing.techabanca.com/sitemap.xml', { headers: { 'X-Forwarded-Host': f.slug + '.techabanca.com' } }), bindings)).status).toBe(404);
    expect((await app.fetch(new Request('https://unknown-business.techabanca.com/sitemap.xml', { headers: { 'X-Forwarded-Host': f.slug + '.techabanca.com' } }), bindings)).status).toBe(404);
  });
  it("never discovers building revisions and changes atomically on activation", async () => {
    const f = await createFixture(), revision = await candidate(f);
    await env.DB.batch([
      env.DB.prepare("UPDATE published_catalogues SET seo_title='New published title' WHERE publication_id=?").bind(revision.id),
      env.DB.prepare("UPDATE published_items SET slug='new-pump' WHERE publication_id=? AND slug='precision-pump'").bind(revision.id),
    ]);
    expect(await text(f, "/sitemap-items-1.xml")).not.toContain("new-pump");
    expect(await text(f)).not.toContain("New published title");
    await activate(f, revision.id);
    const xml = await text(f, "/sitemap-items-1.xml");
    expect(xml).toContain("new-pump"); expect(xml).not.toContain("precision-pump");
    expect(await text(f)).toContain("New published title");
    expect((await get(f, "/items/precision-pump")).status).toBe(404);
  });
  it("does not expose sitemap or structured data in signed previews", async () => {
    const f = await createFixture(), revision = await candidate(f);
    await env.DB.prepare("UPDATE catalogue_publications SET sealed_at=? WHERE id=?").bind(now, revision.id).run();
    const token = await signPreview({ v: 1, publicationId: revision.publicPublication, slug: f.slug, expiresAt: revision.expiresAt }, secret);
    const prefix = "/preview/" + token;
    const html = await text(f, prefix + "/items/precision-pump");
    for (const value of ["itemscope", 'rel="canonical"', 'property="og:url"', 'property="og:image"', 'name="twitter:image"']) expect(html).not.toContain(value);
    expect(html).toContain("Private preview");
    expect(html).toContain('content="noindex, nofollow"');
    for (const path of ["/sitemap.xml", "/sitemap-pages.xml", "/sitemap-items-1.xml"]) expect((await get(f, prefix + path)).status).toBe(404);
    expect(await text(f, "/robots.txt")).not.toContain(token);
  });
  it.each(["staging", "local"])("excludes discovery on %s preview hosts", async deployment => {
    const f = await createFixture();
    const origin = deployment === "staging" ? "https://" + f.slug + ".catalogue-preview.techabanca.com" : "http://" + f.slug + ".localhost:5174";
    const previewBindings = { ...env, DEPLOYMENT_ENVIRONMENT: deployment, LOCAL_PREVIEW: "true" };
    const home = await app.fetch(new Request(origin + "/"), previewBindings), html = await home.text();
    expect(html).not.toContain("itemscope");
    expect(html).not.toContain('name="twitter:image"');
    expect(html).toContain('content="noindex,follow"');
    if (deployment === "staging") expect(home.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    const robots = await (await app.fetch(new Request(origin + "/robots.txt"), previewBindings)).text();
    expect(robots).toContain("Disallow: /"); expect(robots).not.toContain("Sitemap:");
    for (const path of ["/sitemap.xml", "/sitemap-pages.xml", "/sitemap-items-1.xml"]) expect((await app.fetch(new Request(origin + path), previewBindings)).status).toBe(404);
  });
  it("fails closed rather than allocating an oversized sitemap index", async () => {
    const f = await createFixture(), site = (await new PublicRepository(env.DB).site(f.slug))!;
    const repository = new PublicRepository(env.DB);
    const counts = vi.spyOn(repository, "sitemapCounts").mockResolvedValue({ items: 50000 * SITEMAP_PAGE_SIZE, categories: 0 });
    await expect(sitemap(new Request(f.origin + "/sitemap.xml"), site, resolveHost(new URL(f.origin))!, repository, "/sitemap.xml")).rejects.toThrow("sitemap_index_limit");
    counts.mockRestore();
  });
});

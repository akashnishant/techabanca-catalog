import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";
import { createFixture, now, publicId } from "./fixtures";

async function get(origin: string, path = "/", init?: RequestInit) { return exports.default.fetch(new Request(origin + path, { redirect: "manual", ...init })); }
describe("public catalogue renderer", () => {
  it("server-renders the home page, hero, featured items, categories, about and mandatory branding", async () => {
    const f = await createFixture();
    const response = await get(f.origin);
    const html = await response.text();
    expect(response.status).toBe(200);
    for (const text of ["Reliable supplies", "Precision Pump", "Maintenance Visit", "Explore by category", "Published business introduction", "Powered by", "TECHABANCA"]) expect(html).toContain(text);
    expect(html).toContain('href="https://techabanca.com"');
    expect(html).toContain('rel="canonical" href="' + f.origin + '/"');
    expect(html).toContain('content="index,follow"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("SECRET");
    expect(html).not.toContain(f.imageKey);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'none'");
  });
  it("serves published item details, public specifications and PDF links without authoring data", async () => {
    const f = await createFixture();
    await env.DB.prepare("UPDATE catalogue_items SET name = 'Later draft edit SECRET', updated_at = ? WHERE id = ?").bind(now, f.n * 10 + 1).run();
    const response = await get(f.origin, "/items/precision-pump");
    const html = await response.text();
    for (const text of ["Precision Pump", "Published long description", "Stainless steel", "Safety data sheet", "Front of Precision Pump", "Request a quote"]) expect(html).toContain(text);
    expect(html).toContain("₹1,275.25");
    expect(html).not.toContain("SECRET");
    expect(html).not.toContain(f.documentKey);
    expect((await get(f.origin, "/items/hidden-only")).status).toBe(404);
  });
  it("hides unpublished prices and formats service labels", async () => {
    const f = await createFixture();
    const html = await (await get(f.origin, "/items/maintenance-visit")).text();
    expect(html).toContain("Service");
    expect(html).toContain("Request a quote");
    expect(html).not.toContain("₹9,999.99");
    expect(html).not.toContain("999999");
  });
  it("supports literal, case-insensitive search and product/service filters", async () => {
    const f = await createFixture();
    const productHtml = await (await get(f.origin, "/catalogue?q=pUmP&type=product")).text();
    expect(productHtml).toContain("Precision Pump"); expect(productHtml).not.toContain("Maintenance Visit");
    expect(productHtml).toContain('content="noindex,follow"');
    const serviceHtml = await (await get(f.origin, "/catalogue?type=service")).text();
    expect(serviceHtml).toContain("Maintenance Visit"); expect(serviceHtml).not.toContain("Precision Pump");
    for (const query of ["100%25", "_"]) {
      const html = await (await get(f.origin, "/catalogue?q=" + query)).text();
      expect(html).toContain("Stainless Fastener"); expect(html).not.toContain("Precision Pump");
    }
  });
  it("includes child-category items in the parent category and supports category filters", async () => {
    const f = await createFixture();
    const parent = await (await get(f.origin, "/categories/hardware")).text();
    expect(parent).toContain("Precision Pump"); expect(parent).toContain("Stainless Fastener"); expect(parent).not.toContain("Maintenance Visit");
    const child = await (await get(f.origin, "/catalogue?category=fasteners")).text();
    expect(child).toContain("Stainless Fastener"); expect(child).not.toContain("Precision Pump");
    expect((await get(f.origin, "/categories/missing")).status).toBe(404);
    expect((await get(f.origin, "/catalogue?category=missing")).status).toBe(404);
  });
  it("paginates published results without losing filters or duplicating records", async () => {
    const f = await createFixture({}, 30);
    const first = await (await get(f.origin, "/catalogue?q=Batch&type=product&category=hardware")).text();
    const second = await (await get(f.origin, "/catalogue?q=Batch&type=product&category=hardware&page=2")).text();
    expect(first.match(/class="card"/g)?.length).toBe(24); expect(second.match(/class="card"/g)?.length).toBe(6);
    expect(first).toContain("Showing 1–24"); expect(second).toContain("Showing 25–30");
    expect(first).toContain('href="/catalogue?q=Batch&amp;type=product&amp;category=hardware&amp;page=2"');
    expect(first).not.toContain("Batch Pump 025"); expect(second).not.toContain("Batch Pump 001");
    expect((await get(f.origin, "/catalogue?page=9999")).status).toBe(404);
  });
  it("renders a useful empty-search state and rejects invalid inputs", async () => {
    const f = await createFixture();
    expect(await (await get(f.origin, "/catalogue?q=not-found")).text()).toContain("No matching products or services");
    for (const query of ["page=0", "type=invalid", "q=" + "x".repeat(101)]) expect((await get(f.origin, "/catalogue?" + query)).status).toBe(400);
  });
  it("renders About, Contact and item-specific contact actions from published settings", async () => {
    const f = await createFixture();
    expect(await (await get(f.origin, "/about")).text()).toContain("Published business introduction");
    const html = await (await get(f.origin, "/contact?item=precision-pump")).text();
    for (const text of ["Request a quote", "Precision Pump", "orders@example.test", "Demo address, Mumbai", "Enquire on WhatsApp", "Enquire by email"]) expect(html).toContain(text);
    expect(html).toContain("https://wa.me/919876543210?text=");
    expect(html).toContain('href="tel:+919876543210"');
    expect(html).toContain("mailto:orders%40example.test?subject=Request%20a%20quote%3A%20Precision%20Pump");
    expect((await get(f.origin, "/contact?item=hidden-only")).status).toBe(404);
    expect(html).toContain('action="/contact?item=precision-pump" method="post"');
    expect(html).toContain('name="formToken"');
    expect(html).toContain('name="consent"');
  });
  it("honors section and contact visibility without leaking hidden contact data", async () => {
    const f = await createFixture({ show_about: 0, show_categories: 0, show_contact: 0, show_email: 0, show_phone: 0, show_whatsapp: 0 });
    const home = await (await get(f.origin)).text();
    expect(home).not.toContain("Published business introduction"); expect(home).not.toContain("Explore by category");
    for (const path of ["/", "/catalogue", "/items/precision-pump"]) {
      const html = await (await get(f.origin, path)).text();
      for (const text of ["orders@example.test", "98765", "wa.me", "tel:", "mailto:"]) expect(html).not.toContain(text);
    }
    for (const path of ["/about", "/contact", "/categories/hardware"]) expect((await get(f.origin, path)).status).toBe(404);
    expect(await (await get(f.origin, "/catalogue")).text()).not.toContain('name="category"');
  });
  it("disables individual contact channels and handles missing contact details honestly", async () => {
    const f = await createFixture({ show_phone: 0, show_email: 0, show_whatsapp: 0, address_text: null });
    const html = await (await get(f.origin, "/contact")).text();
    expect(html).toContain("No direct enquiry channel is currently available");
    expect(html).not.toContain("orders@example.test"); expect(html).not.toContain("wa.me");
  });
  it("escapes hostile published text and never renders unsafe contact URL schemes", async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const f = await createFixture({ business_name: hostile, about_text: "<script>alert(1)</script>", hero_title: hostile, contact_email: "javascript:alert(1)", whatsapp_number: "javascript:alert(1)", contact_phone: "javascript:alert(1)", seo_title: hostile });
    const home = await (await get(f.origin)).text();
    expect(home).toContain("&lt;img"); expect(home).not.toContain("<img src=x"); expect(home).not.toContain("<script");
    const contact = await (await get(f.origin, "/contact")).text();
    expect(contact).not.toContain('href="javascript:'); expect(contact).not.toContain("tel:javascript");
    expect(contact).not.toContain("wa.me/javascript");
  });
  it("serves controlled Professional and Modern styles with the locked master brand geometry", async () => {
    const f = await createFixture({ theme_code: "modern" });
    expect(await (await get(f.origin)).text()).toContain("theme=modern");
    const css = await (await get(f.origin, "/theme.css?theme=modern")).text();
    expect(css).toContain(".hero{background:#0b1519;color:white}");
    expect(css).toContain("transform: rotate(45deg)");
    expect(css).toContain("left: 7px"); expect(css).toContain("top: 10px"); expect(css).toContain("width: 16px");
    expect(css).toContain("right: 3px"); expect(css).toContain("bottom: 3px"); expect(css).toContain("border-radius: 50%");
    const fallback = await createFixture({ theme_code: "unknown-future-theme" });
    expect(await (await get(fallback.origin)).text()).toContain("theme=professional");
  });
  it("serves local previews only behind the explicit switch and staging pages with noindex", async () => {
    const f = await createFixture();
    const local = "http://" + f.slug + ".localhost:5174/";
    expect((await app.fetch(new Request(local), env)).status).toBe(404);
    const response = await app.fetch(new Request(local), { ...env, LOCAL_PREVIEW: "true" });
    expect(response.status).toBe(200); expect(await response.text()).toContain('content="noindex,follow"');
    expect(await (await get("https://" + f.slug + ".catalogue-preview.techabanca.com")).text()).toContain('content="noindex,follow"');
    expect(await (await get("https://" + f.slug + ".catalogue-preview.techabanca.com", "/robots.txt")).text()).toContain("Disallow: /");
  });
  it("uses the URL hostname and ignores forwarded tenant headers", async () => {
    const f = await createFixture();
    expect((await get("https://unknown-business.techabanca.com", "/", { headers: { "X-Forwarded-Host": f.slug + ".techabanca.com", "X-Techabanca-Organization": publicId("org", f.n) } })).status).toBe(404);
    expect((await get(f.origin, "/", { headers: { "X-Forwarded-Host": "evil.techabanca.com" } })).status).toBe(200);
  });
  it("returns branded 404s for unknown paths and redirects trailing slashes and production HTTP", async () => {
    const f = await createFixture();
    const missing = await get(f.origin, "/missing");
    expect(missing.status).toBe(404); expect(await missing.text()).toContain("Powered by");
    expect((await get(f.origin, "/catalogue/")).headers.get("location")).toBe("/catalogue");
    const secure = await get(f.origin.replace("https:", "http:"), "/catalogue?q=pump");
    expect(secure.status).toBe(308); expect(secure.headers.get("location")).toBe(f.origin + "/catalogue?q=pump");
  });
  it("supports HEAD and rejects public mutations", async () => {
    const f = await createFixture();
    const head = await get(f.origin, "/catalogue", { method: "HEAD" });
    expect(head.status).toBe(200); expect(await head.text()).toBe("");
    const mutation = await get(f.origin, "/catalogue", { method: "POST", body: "{}" });
    expect(mutation.status).toBe(405); expect(mutation.headers.get("allow")).toBe("GET, HEAD");
  });
  it("immediately hides suspended routes including public media", async () => {
    const f = await createFixture();
    await env.DB.prepare("UPDATE public_catalogue_routes SET status = 'suspended' WHERE slug = ?").bind(f.slug).run();
    for (const path of ["/", "/catalogue", "/about", "/items/precision-pump", "/media/" + f.publicationId + "/" + f.imageId]) {
      const response = await get(f.origin, path);
      expect(response.status).toBe(404);
      const html = await response.text(); expect(html).not.toContain("Northstar Supply"); expect(html).not.toContain("Precision Pump");
    }
  });
  it("switches atomically to the activated revision and never exposes a building revision", async () => {
    const f = await createFixture();
    const revisionId = f.n + 2000000;
    const revisionPublicId = publicId("pub", revisionId);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO catalogue_publications (id, public_id, catalogue_id, catalogue_public_id, revision_number, state, source_catalogue_version, created_at) VALUES (?, ?, ?, ?, 2, 'building', 1, ?)").bind(revisionId, revisionPublicId, f.n, f.catalogueId, now),
      env.DB.prepare("INSERT INTO published_catalogues (publication_id, catalogue_public_id, slug, name, mode, theme_code, business_name, hero_title, published_at) VALUES (?, ?, ?, 'New catalogue', 'both', 'professional', 'New revision business', 'New revision hero', ?)").bind(revisionId, f.catalogueId, f.slug, now),
      env.DB.prepare("INSERT INTO published_items (publication_id, item_public_id, item_type, name, slug, show_price) VALUES (?, ?, 'product', 'New revision product', 'new-product', 0)").bind(revisionId, publicId("itm", revisionId)),
    ]);
    const old = await (await get(f.origin)).text(); expect(old).toContain("Northstar Supply"); expect(old).not.toContain("New revision");
    await env.DB.batch([
      env.DB.prepare("UPDATE catalogue_publications SET state = 'retired', retired_at = ? WHERE id = ?").bind(now, f.n),
      env.DB.prepare("UPDATE catalogue_publications SET state = 'active', activated_at = ? WHERE id = ?").bind(now, revisionId),
      env.DB.prepare("UPDATE public_catalogue_routes SET publication_id = ?, updated_at = ? WHERE slug = ?").bind(revisionId, now, f.slug),
    ]);
    const current = await (await get(f.origin, "/catalogue")).text();
    expect(current).toContain("New revision product"); expect(current).not.toContain("Precision Pump");
    expect((await get(f.origin, "/items/precision-pump")).status).toBe(404);
    expect((await get(f.origin, "/media/" + f.publicationId + "/" + f.imageId)).status).toBe(404);
  });
});

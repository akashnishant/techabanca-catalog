import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { signEnquiryToken, type EnquiryClaims } from "@techabanca/domain";
import app from "../src";
import { analyticsStatement, recordAnalytics } from "../src/analytics";
import { PublicRepository } from "../src/repository";
import { createFixture } from "./fixtures";
type Fixture = Awaited<ReturnType<typeof createFixture>>;
const excludedHeaders: Array<Record<string, string>> = [{ DNT: "1" }, { "Sec-GPC": "1" }, { Purpose: "prefetch" }, { "Sec-Purpose": "prefetch;prerender" }, { "User-Agent": "Googlebot" }, { "User-Agent": "" }, { "Sec-Fetch-Mode": "cors" }];
const human = { "User-Agent": "Mozilla/5.0 Chrome/145.0 Safari/537.36" };
const request = (f: Fixture, path = "/", init: RequestInit = {}) => {
  const headers = new Headers(human); new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return new Request(f.origin + path, { ...init, headers });
};
const counts = async (f: Fixture) => Object.fromEntries((await env.DB.prepare("SELECT event, SUM(count) AS n FROM catalogue_analytics_daily WHERE catalogue_id = ? GROUP BY event").bind(f.n).all<{ event: string; n: number }>()).results.map(r => [r.event, r.n]));
const config = { ...env, DEPLOYMENT_ENVIRONMENT: "local", PUBLICATION_PREVIEW_SECRET: "b".repeat(64) };
async function send(f: Fixture, nonce: string, extra: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const now = Math.floor(Date.now() / 1000), claims: EnquiryClaims = { v: 1, purpose: "form", slug: f.slug, catalogueId: f.catalogueId,
    publicationId: f.publicationId, itemId: f.productId, nonce, issuedAt: now - 10, expiresAt: now + 1700 };
  const formToken = await signEnquiryToken(claims, config.PUBLICATION_PREVIEW_SECRET);
  const body = new URLSearchParams({ contactName: "Private Synthetic Name", email: "private@example.test", phone: "", companyName: "", message: "Private message content", consent: "yes", formToken, ...extra });
  return app.fetch(request(f, "/contact?item=precision-pump", { method: "POST", headers: { Origin: f.origin, "Content-Type": "application/x-www-form-urlencoded", ...headers }, body }), config);
}
describe("published catalogue analytics", () => {
  it("records page, item, search and form-open metrics only after successful pages", async () => {
    const f = await createFixture();
    for (const path of ["/", "/items/precision-pump", "/catalogue?q=private%40example.test", "/contact?item=precision-pump", "/about"]) expect((await app.fetch(request(f, path), config)).status).toBe(200);
    expect(await counts(f)).toEqual({ catalogue_view: 5, item_view: 1, search: 1, enquiry_started: 1 });
    const rows = (await env.DB.prepare("SELECT * FROM catalogue_analytics_daily WHERE catalogue_id = ?").bind(f.n).all()).results;
    expect(JSON.stringify(rows)).not.toMatch(/private|example|Mozilla|contactName|message|phone|query|address|nonce/i);
    expect(Object.keys(rows[0]).sort()).toEqual(["catalogue_id", "count", "day", "event", "item_public_id"]);
  });
  it("counts first-page searches including no results but excludes invalid requests and later result pages", async () => {
    const f = await createFixture({}, 30);
    for (const path of ["/catalogue?q=Pump", "/catalogue?q=Pump&page=2", "/catalogue?q=NoResults", "/items/missing", "/catalogue?page=bad", "/catalogue?page=500", "/preview/invalid/catalogue"]) await app.fetch(request(f, path), config);
    expect(await counts(f)).toEqual({ catalogue_view: 3, search: 2 });
  });
  it.each(excludedHeaders)("excludes privacy and automated requests %j", async headers => {
    const f = await createFixture(); expect((await app.fetch(request(f, "/items/precision-pump", { headers }), config)).status).toBe(200); expect(await counts(f)).toEqual({});
  });
  it("excludes HEAD, assets, health checks, robots and canonical redirects", async () => {
    const f = await createFixture(); await app.fetch(request(f, "/items/precision-pump", { method: "HEAD" }), config);
    for (const path of ["/theme.css", "/health", "/robots.txt", "/favicon.svg", "/catalogue/"]) await app.fetch(request(f, path), config);
    expect(await counts(f)).toEqual({});
  });
  it("routes WhatsApp actions to a fixed published target and never accepts a caller URL", async () => {
    const f = await createFixture(), res = await app.fetch(request(f, "/go/whatsapp?item=precision-pump"), config);
    expect(res.status).toBe(302); expect(res.headers.get("Location")).toMatch(/^https:\/\/wa\.me\/[0-9]+\?text=/);
    expect(decodeURIComponent(res.headers.get("Location")!)).toContain("Precision Pump"); expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await counts(f)).toEqual({ whatsapp_click: 1 });
    expect((await app.fetch(request(f, "/go/whatsapp?url=https://evil.test"), config)).status).toBe(400);
    expect((await app.fetch(request(f, "/go/whatsapp?item=hidden-only"), config)).status).toBe(404);
    expect(await counts(f)).toEqual({ whatsapp_click: 1 });
  });
  it("renders tracked published links while keeping the public pages script-free", async () => {
    const f = await createFixture(), res = await app.fetch(request(f, "/contact?item=precision-pump"), config), html = await res.text();
    expect(html).toContain('href="/go/whatsapp?item=precision-pump"'); expect(html).not.toContain("<script");
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'none'");
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });
  it.each(["local", "staging"] as const)("tracks published WhatsApp links on %s hosts without confusing them with private previews", async deployment => {
    const f = await createFixture(), origin = deployment === "local" ? "http://" + f.slug + ".localhost" : "https://" + f.slug + ".catalogue-preview.techabanca.com";
    const bindings = { ...config, DEPLOYMENT_ENVIRONMENT: deployment, LOCAL_PREVIEW: "true" };
    const page = await app.fetch(new Request(origin + "/items/precision-pump", { headers: human }), bindings);
    expect(page.status).toBe(200); expect(await page.text()).toContain('href="/go/whatsapp?item=precision-pump"');
    const go = await app.fetch(new Request(origin + "/go/whatsapp?item=precision-pump", { headers: human }), bindings);
    expect(go.status).toBe(302); expect(await counts(f)).toEqual({ catalogue_view: 1, item_view: 1, whatsapp_click: 1 });
  });
  it("respects opt-outs on WhatsApp actions without breaking the redirect", async () => {
    const f = await createFixture(); expect((await app.fetch(request(f, "/go/whatsapp", { headers: { "Sec-GPC": "1" } }), config)).status).toBe(302);
    expect(await counts(f)).toEqual({});
  });
  it("increments one accepted enquiry once, including concurrent retries, without storing enquiry content in analytics", async () => {
    const f = await createFixture(), nonce = crypto.randomUUID().replace(/-/g, "");
    const responses = await Promise.all([send(f, nonce), send(f, nonce)]); expect(responses.map(r => r.status)).toEqual([303, 303]);
    expect(await counts(f)).toEqual({ enquiry_submitted: 1 });
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE catalogue_id = ?").bind(f.n).first<{ n: number }>(); expect(n!.n).toBe(1);
    expect(JSON.stringify((await env.DB.prepare("SELECT * FROM catalogue_analytics_daily WHERE catalogue_id = ?").bind(f.n).all()).results)).not.toContain("Private");
  });
  it("excludes opt-out submissions while retaining a valid enquiry", async () => {
    const f = await createFixture(); expect((await send(f, crypto.randomUUID().replace(/-/g, ""), {}, { DNT: "1" })).status).toBe(303);
    expect(await counts(f)).toEqual({}); expect((await env.DB.prepare("SELECT 1 FROM enquiries WHERE catalogue_id = ?").bind(f.n).first())).toBeTruthy();
  });
  it("does not count invalid submissions or honeypot success responses", async () => {
    const f = await createFixture(); await send(f, crypto.randomUUID().replace(/-/g, ""), { message: "" });
    await send(f, crypto.randomUUID().replace(/-/g, ""), { companyWebsite: "spam.example" }); expect(await counts(f)).toEqual({});
  });
  it("does not inflate accepted submissions on receipt pages", async () => {
    const f = await createFixture(), res = await send(f, crypto.randomUUID().replace(/-/g, ""));
    const cookie = res.headers.get("Set-Cookie")!.split(";")[0];
    await app.fetch(request(f, "/contact?sent=1", { headers: { Cookie: cookie } }), config);
    expect(await counts(f)).toEqual({ enquiry_submitted: 1, catalogue_view: 1 });
  });
  it("uses minimal versioned Analytics Engine points only after aggregate persistence", async () => {
    const f = await createFixture(), writer = vi.fn();
    await app.fetch(request(f, "/items/precision-pump?email=private@example.test", { headers: { Referer: "https://private.test/path?secret=x", "CF-Connecting-IP": "203.0.113.9" } }), { ...config, CATALOGUE_ANALYTICS: { writeDataPoint: writer } as unknown as AnalyticsEngineDataset });
    expect(writer.mock.calls.map(call => call[0])).toEqual([
      { indexes: [f.catalogueId], blobs: ["v1", "catalogue_view", f.publicationId, ""], doubles: [1] },
      { indexes: [f.catalogueId], blobs: ["v1", "item_view", f.publicationId, f.productId], doubles: [1] },
    ]);
  });
  it("does not let telemetry or aggregate write failures break a page response", async () => {
    const f = await createFixture(), writer = vi.fn(() => { throw new Error("synthetic telemetry failure"); });
    expect((await app.fetch(request(f), { ...config, CATALOGUE_ANALYTICS: { writeDataPoint: writer } as unknown as AnalyticsEngineDataset })).status).toBe(200);
    const db = { prepare: env.DB.prepare.bind(env.DB), batch: async () => { throw new Error("synthetic aggregate failure"); } } as unknown as D1Database;
    const site = (await new PublicRepository(env.DB).site(f.slug))!;
    await expect(recordAnalytics({ ...config, DB: db }, site, request(f), false, [{ event: "catalogue_view" }])).resolves.toBeUndefined();
  });
  it("atomically increments concurrent page counts without lost updates", async () => {
    const f = await createFixture(), site = (await new PublicRepository(env.DB).site(f.slug))!;
    await Promise.all(Array.from({ length: 20 }, () => recordAnalytics(config, site, request(f), false, [{ event: "catalogue_view" }])));
    expect(await counts(f)).toEqual({ catalogue_view: 20 });
  });
  it("rechecks publication and subscription availability inside aggregate writes and excludes previews", async () => {
    const f = await createFixture(), site = (await new PublicRepository(env.DB).site(f.slug))!;
    await recordAnalytics(config, site, request(f), true, [{ event: "catalogue_view" }]); expect(await counts(f)).toEqual({});
    await env.DB.prepare("UPDATE public_catalogue_routes SET status = 'suspended' WHERE slug = ?").bind(f.slug).run();
    expect((await analyticsStatement(config, site, { event: "catalogue_view" }, "2026-10-05").run()).meta.changes).toBe(0);
    await env.DB.prepare("UPDATE public_catalogue_routes SET status = 'active' WHERE slug = ?").bind(f.slug).run();
    await env.DB.prepare("UPDATE subscriptions SET status = 'expired' WHERE organization_id = ?").bind(f.n).run();
    expect((await analyticsStatement(config, site, { event: "catalogue_view" }, "2026-10-05").run()).meta.changes).toBe(0);
    expect(await counts(f)).toEqual({});
  });
  it("rechecks the immutable item dimension so hidden and caller-created IDs cannot be recorded", async () => {
    const f = await createFixture(), site = (await new PublicRepository(env.DB).site(f.slug))!;
    expect((await analyticsStatement(config, site, { event: "item_view", itemId: "itm_" + "a".repeat(32) }, "2026-10-05").run()).meta.changes).toBe(0);
    expect(await counts(f)).toEqual({});
  });
});

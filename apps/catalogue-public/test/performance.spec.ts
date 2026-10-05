import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import app from "../src";
import { PublicRepository } from "../src/repository";
import { scheduleAnalytics } from "../src/analytics";
import { createFixture } from "./fixtures";
const config = { ...env, DEPLOYMENT_ENVIRONMENT: "local", PUBLICATION_PREVIEW_SECRET: "b".repeat(64) };
const human = { "User-Agent": "Mozilla/5.0 Chrome/145.0 Safari/537.36" };
type Fixture = Awaited<ReturnType<typeof createFixture>>;
const get = (f: Fixture, path: string, init: RequestInit = {}, bindings = config) => app.fetch(new Request(f.origin + path, init), bindings);
function measuredDb(queries: string[]) {
  return { prepare(sql: string) { queries.push(sql); return env.DB.prepare(sql); }, batch: env.DB.batch.bind(env.DB) } as unknown as D1Database;
}
describe("public performance with fresh access checks", () => {
  it.each(["catalogue","organization","subscription","route"])("drops deferred analytics after %s access is revoked",async boundary=>{
    const f=await createFixture(),site=(await new PublicRepository(env.DB).site(f.slug))!,tasks:Promise<unknown>[]=[];
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
    const db={prepare:env.DB.prepare.bind(env.DB),batch:async(statements:D1PreparedStatement[])=>{await gate;return env.DB.batch(statements);}} as unknown as D1Database;
    await scheduleAnalytics({...config,DB:db},site,new Request(f.origin,{headers:human}),false,[{event:"catalogue_view"}],{waitUntil(task){tasks.push(task);}});
    if(boundary==="catalogue")await env.DB.prepare("UPDATE catalogues SET status='suspended' WHERE id=?").bind(f.n).run();
    if(boundary==="organization")await env.DB.prepare("UPDATE organizations SET status='suspended' WHERE id=?").bind(f.n).run();
    if(boundary==="subscription")await env.DB.prepare("UPDATE subscriptions SET status='expired' WHERE organization_id=?").bind(f.n).run();
    if(boundary==="route")await env.DB.prepare("UPDATE public_catalogue_routes SET status='suspended' WHERE slug=?").bind(f.slug).run();
    release();await Promise.all(tasks);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM catalogue_analytics_daily WHERE catalogue_id=?").bind(f.n).first()).toEqual({n:0});
  });

  it.each(["staging", "production"])("preserves static revalidation and crawler policy on %s", async deployment => {
    const f=await createFixture(), origin=deployment==="staging"?"https://"+f.slug+".catalogue-preview.techabanca.com":f.origin;
    const bindings={...config,DEPLOYMENT_ENVIRONMENT:deployment};
    const first=await app.fetch(new Request(origin+"/theme.css"),bindings);
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    const second=await app.fetch(new Request(origin+"/theme.css",{headers:{"If-None-Match":first.headers.get("ETag")!}}),bindings);
    expect(second.status).toBe(304);
    expect(second.headers.get("X-Robots-Tag")).toBe(deployment==="staging"?"noindex, nofollow":null);
    expect((await app.fetch(new Request("https://billing.techabanca.com/theme.css"),bindings)).status).toBe(404);
  });

  it.each(["/about", "/contact", "/report", "/robots.txt", "/missing"])("does not query category collections on %s", async path => {
    const f = await createFixture(), queries: string[] = [];
    await get(f, path, {}, { ...config, DB: measuredDb(queries) });
    expect(queries.some(sql => sql.includes("FROM published_categories"))).toBe(false);
  });
  it("loads home with one bounded featured query and no total-count scan", async () => {
    const f = await createFixture({}, 100), queries: string[] = [];
    const response = await get(f, "/", {}, { ...config, DB: measuredDb(queries) });
    expect(response.status).toBe(200);
    expect(queries).toHaveLength(3);
    expect(queries.some(sql => /count\(\*\)/i.test(sql))).toBe(false);
    expect(queries.find(sql => sql.includes("FROM published_items"))).toContain("LIMIT 6");
    expect(await response.text()).toContain("Precision Pump");
  });
  it("does not read disabled home collections", async () => {
    const f = await createFixture({ show_categories: 0, show_featured_items: 0 }), queries: string[] = [];
    expect((await get(f, "/", {}, { ...config, DB: measuredDb(queries) })).status).toBe(200);
    expect(queries).toHaveLength(1);
  });
  it.each([
    ["items", "SELECT * FROM published_items WHERE publication_id = ? ORDER BY sort_order, name, item_public_id LIMIT 24", "idx_published_items_page_order"],
    ["types", "SELECT * FROM published_items WHERE publication_id = ? AND item_type = 'product' ORDER BY sort_order, name, item_public_id LIMIT 24", "idx_published_items_type_order"],
    ["featured", "SELECT * FROM published_items WHERE publication_id = ? AND is_featured = 1 ORDER BY sort_order, name, item_public_id LIMIT 6", "idx_published_items_featured_order"],
    ["categories", "SELECT * FROM published_categories WHERE publication_id = ? ORDER BY sort_order, name, category_public_id", "idx_published_categories_page_order"],
  ])("uses an ordered index for %s without a temporary sort", async (_, sql, index) => {
    const f = await createFixture();
    const plan = (await env.DB.prepare("EXPLAIN QUERY PLAN " + sql).bind(f.n).all<{ detail: string }>()).results.map(row => row.detail).join("\n");
    expect(plan).toContain(index); expect(plan).not.toContain("TEMP B-TREE");
  });
  it("keeps 1,003-item reads bounded and pagination, type, literal search and featured results correct", async () => {
    const f = await createFixture({}, 1000), repository = new PublicRepository(env.DB), site = (await repository.site(f.slug))!;
    const first = await repository.items(site, { query: "", type: "all", category: "", page: 1 });
    const last = await repository.items(site, { query: "", type: "all", category: "", page: 42 });
    expect(first.total).toBe(1003); expect(first.items).toHaveLength(24); expect(last.items).toHaveLength(19);
    expect(new Set([...first.items, ...last.items].map(item => item.item_public_id)).size).toBe(43);
    expect((await repository.items(site, { query: "", type: "service", category: "", page: 1 })).items.map(item => item.name)).toEqual(["Maintenance Visit"]);
    expect((await repository.items(site, { query: "100%", type: "all", category: "", page: 1 })).items.map(item => item.name)).toEqual(["Stainless Fastener"]);
    expect((await repository.featuredItems(site)).map(item => item.name)).toEqual(["Precision Pump", "Maintenance Visit"]);
    const page = await get(f, "/catalogue"); expect(page.status).toBe(200);
    const html = await page.text(); expect(new TextEncoder().encode(html).byteLength).toBeLessThan(40000); expect(html).not.toContain("<script");
  });
  it.each(["/theme.css", "/favicon.svg"])("revalidates tenant-independent %s with GET and HEAD validators", async path => {
    const f = await createFixture(), first = await get(f, path), etag = first.headers.get("ETag")!;
    expect(first.status).toBe(200); expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    const cached = await get(f, path, { headers: { "If-None-Match": '"old", W/' + etag } });
    expect(cached.status).toBe(304); expect(await cached.text()).toBe("");
    const head = await get(f, path, { method: "HEAD" }); expect(head.status).toBe(200); expect(head.headers.get("ETag")).toBe(etag); expect(await head.text()).toBe("");
  });
  it("keeps theme validators distinct and bounds unrecognized variants to the professional theme", async () => {
    const f = await createFixture(), professional = await get(f, "/theme.css"), modern = await get(f, "/theme.css?theme=modern");
    expect(modern.headers.get("ETag")).not.toBe(professional.headers.get("ETag"));
    expect((await get(f, "/theme.css?theme=unknown")).headers.get("ETag")).toBe(professional.headers.get("ETag"));
    expect((await get(f, "/theme.css?theme=modern", { headers: { "If-None-Match": professional.headers.get("ETag")! } })).status).toBe(200);
  });
  it.each(["/", "/catalogue", "/contact", "/report", "/missing", "/catalogue/"])("retains no-store for tenant HTML/forms/redirects at %s", async path => {
    const f = await createFixture(); expect((await get(f, path)).headers.get("Cache-Control")).toBe("no-store");
  });
  it.each(["catalogue", "organization", "subscription", "route"])("checks %s revocation before a public-media 304", async boundary => {
    const f = await createFixture(), path = "/media/" + f.publicationId + "/" + f.imageId;
    const first = await get(f, path), etag = first.headers.get("ETag")!;
    expect(first.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate");
    expect((await get(f, path, { headers: { "If-None-Match": etag } })).status).toBe(304);
    if (boundary === "catalogue") await env.DB.prepare("UPDATE catalogues SET status='suspended' WHERE id=?").bind(f.n).run();
    if (boundary === "organization") await env.DB.prepare("UPDATE organizations SET status='suspended' WHERE id=?").bind(f.n).run();
    if (boundary === "subscription") await env.DB.prepare("UPDATE subscriptions SET trial_ends_at=? WHERE organization_id=?").bind(new Date(Date.now()-1000).toISOString(), f.n).run();
    if (boundary === "route") await env.DB.prepare("UPDATE public_catalogue_routes SET status='suspended' WHERE slug=?").bind(f.slug).run();
    const denied = await get(f, path, { headers: { "If-None-Match": etag } });
    expect(denied.status).toBe(404); expect(denied.headers.get("Cache-Control")).toBe("no-store"); expect(denied.headers.get("ETag")).toBeNull();
  });
  it("returns a page before blocked background analytics settle and persists after the Worker lifetime completes", async () => {
    const f = await createFixture(), tasks: Promise<unknown>[] = [];
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    const db = { prepare: env.DB.prepare.bind(env.DB), batch: async (statements: D1PreparedStatement[]) => { await gate; return env.DB.batch(statements); } } as unknown as D1Database;
    const response = await app.fetch(new Request(f.origin + "/about", { headers: human }), { ...config, DB: db },
      { waitUntil(task: Promise<unknown>) { tasks.push(task); }, passThroughOnException() {}, props: {} });
    expect(response.status).toBe(200); expect(tasks).toHaveLength(1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM catalogue_analytics_daily WHERE catalogue_id=?").bind(f.n).first()).toEqual({ n: 0 });
    release(); await Promise.all(tasks);
    expect(await env.DB.prepare("SELECT sum(count) AS n FROM catalogue_analytics_daily WHERE catalogue_id=?").bind(f.n).first()).toEqual({ n: 1 });
  });
  it("schedules no background work for previews and privacy opt-outs; awaits direct callers safely", async () => {
    const f = await createFixture(), site = (await new PublicRepository(env.DB).site(f.slug))!, waitUntil = vi.fn();
    await scheduleAnalytics(config, site, new Request(f.origin, { headers: human }), true, [{ event: "catalogue_view" }], { waitUntil });
    await scheduleAnalytics(config, site, new Request(f.origin, { headers: { ...human, DNT: "1" } }), false, [{ event: "catalogue_view" }], { waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
    await scheduleAnalytics(config, site, new Request(f.origin, { headers: human }), false, [{ event: "catalogue_view" }]);
    expect(await env.DB.prepare("SELECT sum(count) AS n FROM catalogue_analytics_daily WHERE catalogue_id=?").bind(f.n).first()).toEqual({ n: 1 });
  });
});

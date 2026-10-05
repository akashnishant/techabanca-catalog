import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker";
import { AnalyticsService, purgeExpiredAnalytics } from "../src/worker/services/analytics-service";
import { PublicationService } from "../src/worker/services/publication-service";
import { publicationFixture, id, previewConfig } from "./publication-fixtures";

const root = "https://catalogue.test/api/v1/catalogue/analytics";
const date = new Date("2026-10-05T12:00:00Z");
const insert = (n: number, day: string, event = "catalogue_view", item = "", count = 1) => env.DB.prepare("INSERT INTO catalogue_analytics_daily (catalogue_id, day, event, item_public_id, count) VALUES (?, ?, ?, ?, ?)").bind(n, day, event, item, count).run();
describe("tenant analytics", () => {
  it("returns an unpublished zero state with every UTC day and six metrics", async () => {
    const f = await publicationFixture(), data = await new AnalyticsService(env.DB).summary(f.tenant, new URLSearchParams("days=7"), date);
    expect(data.hasPublication).toBe(false); expect(data.daily).toHaveLength(7); expect(data.daily[0].day).toBe("2026-09-29");
    expect(Object.values(data.totals)).toEqual([0, 0, 0, 0, 0, 0]); expect(data.topItems).toEqual([]); expect(data.retentionDays).toBe(400);
  });
  it("sums item dimensions, separates the previous period and ignores out-of-range activity", async () => {
    const f = await publicationFixture(); await insert(f.n, "2026-10-05", "catalogue_view", "", 3);
    await insert(f.n, "2026-10-05", "item_view", id("itm", f.product), 2); await insert(f.n, "2026-10-05", "item_view", id("itm", f.service), 5);
    await insert(f.n, "2026-09-28", "item_view", id("itm", f.product), 9); await insert(f.n, "2026-09-21", "catalogue_view", "", 50);
    await insert(f.n, "2026-10-06", "catalogue_view", "", 50);
    const data = await new AnalyticsService(env.DB).summary(f.tenant, new URLSearchParams("days=7"), date);
    expect(data.totals).toMatchObject({ catalogue_view: 3, item_view: 7 }); expect(data.previous).toMatchObject({ catalogue_view: 0, item_view: 9 });
    expect(data.daily.at(-1)!.counts.item_view).toBe(7); expect(data.topItems.map(i => i.views)).toEqual([5, 2]);
    expect(JSON.stringify(data)).not.toContain("Draft SECRET"); expect(data.topItems[0].name).toBe("Previously published item");
  });
  it("is tenant-isolated and retains basic history after subscription expiry", async () => {
    const f = await publicationFixture(), other = await publicationFixture(); await insert(other.n, "2026-10-05", "catalogue_view", "", 100);
    const data = await new AnalyticsService(env.DB).summary(f.tenant, new URLSearchParams(), date);
    expect(data.totals.catalogue_view).toBe(0); expect(data.topItems).toEqual([]);
  });
  it("labels top items from an activated version and excludes newer authoring/private preview names", async () => {
    const f = await publicationFixture(), actor = { role: "owner", userId: f.owner }, publisher = new PublicationService(env.DB, env.ASSETS, previewConfig);
    const revision = async () => (await env.DB.prepare("SELECT authoring_revision AS n FROM catalogues WHERE id = ?").bind(f.n).first<{ n: number }>())!.n;
    const first = await publisher.prepare(f.tenant, actor, await revision(), "https://catalogue.test");
    await publisher.activate(f.tenant, actor, first.publication.id, first.sourceRevision, "https://catalogue.test");
    await env.DB.prepare("UPDATE catalogue_items SET name = 'Draft SECRET' WHERE id = ?").bind(f.product).run();
    await publisher.prepare(f.tenant, actor, await revision(), "https://catalogue.test");
    await insert(f.n, "2026-10-05", "item_view", id("itm", f.product), 4);
    const data = await new AnalyticsService(env.DB).summary(f.tenant, new URLSearchParams("days=7"), date);
    expect(data.hasPublication).toBe(true); expect(data.topItems).toEqual([{ id: id("itm", f.product), name: "Precision Pump", slug: "item-" + f.product, views: 4, whatsappClicks: 0, enquiries: 0 }]);
    expect(JSON.stringify(data)).not.toContain("Draft SECRET");
  });
  it("returns a safe retryable failure without leaking database details", async () => {
    const f = await publicationFixture(), cookie = await f.session();
    const db = new Proxy(env.DB, { get(target, key) {
      if (key === "prepare") return (sql: string) => { if (sql.includes("catalogue_analytics_daily")) throw new Error("PRIVATE SQL DETAIL"); return target.prepare(sql); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const res = await app.request(root, { headers: { Cookie: cookie, "X-Techabanca-Organization": id("org", f.n) } }, { ...env, ...previewConfig, DB: db });
    expect(res.status).toBe(503); expect(await res.text()).not.toContain("PRIVATE"); expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
  it.each(["days=1", "days=07", "days=90&days=7", "days=", "q=secret", "days=7&org=other"])("rejects unsupported query %s", async query => {
    const f = await publicationFixture(); await expect(new AnalyticsService(env.DB).summary(f.tenant, new URLSearchParams(query), date)).rejects.toMatchObject({ code: "invalid_analytics_range", status: 400 });
  });
  it.each(["owner", "admin", "editor"] as const)("permits a current %s member to read uncached analytics", async role => {
    const f = await publicationFixture(), cookie = await f.session(f[role]);
    const res = await app.request(root, { headers: { Cookie: cookie, "X-Techabanca-Organization": id("org", f.n) } }, { ...env, ...previewConfig });
    expect(res.status).toBe(200); expect(res.headers.get("Cache-Control")).toBe("no-store"); expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("requires a session and active membership in the selected organization", async () => {
    const f = await publicationFixture(), other = await publicationFixture();
    const req = (headers: Record<string, string>) => app.request(root, { headers }, { ...env, ...previewConfig });
    expect((await req({ "X-Techabanca-Organization": id("org", f.n) })).status).toBe(401);
    const cookie = await f.session(); expect((await req({ Cookie: cookie, "X-Techabanca-Organization": id("org", other.n) })).status).toBe(403);
    await env.DB.prepare("UPDATE organization_members SET status = 'suspended' WHERE organization_id = ? AND user_id = ?").bind(f.n, f.owner).run();
    expect((await req({ Cookie: cookie, "X-Techabanca-Organization": id("org", f.n) })).status).toBe(403);
  });
  it("purges only aggregates older than the bounded retention cutoff", async () => {
    const f = await publicationFixture(); await insert(f.n, "2025-08-31"); await insert(f.n, "2025-09-01"); await insert(f.n, "2026-10-05");
    const result = await purgeExpiredAnalytics(env.DB, date); expect(result.hasMore).toBe(false);
    const rows = (await env.DB.prepare("SELECT day FROM catalogue_analytics_daily WHERE catalogue_id = ? ORDER BY day").bind(f.n).all<{ day: string }>()).results;
    expect(rows.map(r => r.day)).toEqual(["2025-09-01", "2026-10-05"]);
  });
  it("rejects invalid metric, item dimension and counter values at the database boundary", async () => {
    const f = await publicationFixture();
    await expect(insert(f.n, "2026-10-05", "arbitrary_person_data")).rejects.toThrow();
    await expect(insert(f.n, "2026-10-05", "item_view")).rejects.toThrow();
    await expect(insert(f.n, "2026-10-05", "search", "someone@example.test")).rejects.toThrow();
    await expect(insert(f.n, "2026-10-05", "search", "", 0)).rejects.toThrow();
  });
});

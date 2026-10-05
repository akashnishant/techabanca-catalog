import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker";
import { SharingService } from "../src/worker/services/sharing-service";
import { PublicationService } from "../src/worker/services/publication-service";
import { SubscriptionService } from "../src/worker/services/subscription-service";
import { publicationFixture, id, previewConfig } from "./publication-fixtures";

const root = "https://catalogue.test/api/v1/catalogue/sharing";
const config = { ...previewConfig, DEPLOYMENT_ENVIRONMENT: "local", LOCAL_PREVIEW: "true" };
async function published(trial = false, extras = 0) {
  const f = await publicationFixture(), actor = { role: "owner", userId: f.owner };
  if (trial) await new SubscriptionService({ ...env, ...config }).startTrial(f.tenant, actor);
  if (extras) { const now = new Date().toISOString(); await env.DB.batch(Array.from({ length: extras }, (_, index) => env.DB.prepare("INSERT INTO catalogue_items (id, public_id, catalogue_id, item_type, name, slug, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'service', ?, ?, 'published', 1, ?, ?)").bind(f.n * 100 + index, id("itm", f.n * 100 + index), f.n, "Extra " + String(index).padStart(2, "0"), "extra-" + index, now, now))); }
  const publisher = new PublicationService(env.DB, env.ASSETS, config);
  const revision = async () => (await env.DB.prepare("SELECT authoring_revision AS n FROM catalogues WHERE id = ?").bind(f.n).first<{ n: number }>())!.n;
  const prepared = await publisher.prepare(f.tenant, actor, await revision(), "https://catalogue.test");
  await publisher.activate(f.tenant, actor, prepared.publication.id, prepared.sourceRevision, "https://catalogue.test");
  return { ...f, publisher, actor, revision, publication: prepared.publication.id };
}
const view = (f: Awaited<ReturnType<typeof publicationFixture>>, query = "") => new SharingService(env.DB, "local", "true").view(f.tenant, new URLSearchParams(query));
describe("published sharing tools", () => {
  it("returns no links for an unpublished or sealed private preview catalogue", async () => {
    const f = await publicationFixture();
    expect(await view(f)).toMatchObject({ publication: null, items: [], total: 0 });
    const publisher = new PublicationService(env.DB, env.ASSETS, config);
    const revision = (await env.DB.prepare("SELECT authoring_revision AS n FROM catalogues WHERE id = ?").bind(f.n).first<{ n: number }>())!.n;
    await publisher.prepare(f.tenant, { role: "owner", userId: f.owner }, revision, "https://catalogue.test");
    expect(JSON.stringify(await view(f))).not.toContain("https://");
  });
  it("uses only the active publication and keeps draft edits and preview names out", async () => {
    const f = await published(), first = await view(f);
    expect(first.publication!.target.url).toBe("https://" + f.slug + ".techabanca.com/");
    expect(first.items.map(i => i.name)).toEqual(["Maintenance Visit", "Precision Pump"]);
    expect(first.items.every(i => i.target.url.startsWith(first.publication!.target.url + "items/"))).toBe(true);
    await env.DB.prepare("UPDATE catalogue_items SET name = 'Private SECRET', slug = 'private-secret' WHERE id = ?").bind(f.product).run();
    await env.DB.prepare("UPDATE business_profiles SET legal_or_display_name = 'Private business SECRET' WHERE organization_id = ?").bind(f.n).run();
    await f.publisher.prepare(f.tenant, f.actor, await f.revision(), "https://catalogue.test");
    const next = await view(f); expect(next).toEqual(first); expect(JSON.stringify(next)).not.toContain("SECRET");
  });
  it("follows a newly activated snapshot and item slug", async () => {
    const f = await published();
    await env.DB.prepare("UPDATE catalogue_items SET slug = 'replacement-pump' WHERE id = ?").bind(f.product).run();
    const prepared = await f.publisher.prepare(f.tenant, f.actor, await f.revision(), "https://catalogue.test");
    await f.publisher.activate(f.tenant, f.actor, prepared.publication.id, prepared.sourceRevision, "https://catalogue.test");
    const data = await view(f); expect(data.publication!.revision).toBe(2);
    expect(data.items.find(i => i.id === id("itm", f.product))!.target.url).toBe("https://" + f.slug + ".techabanca.com/items/replacement-pump");
  });
  it("filters literal published names and item types without disclosing source-only items", async () => {
    const f = await published();
    expect((await view(f, "q=PUMP&type=product")).items.map(i => i.name)).toEqual(["Precision Pump"]);
    expect((await view(f, "type=service")).total).toBe(1);
    for (const q of ["SECRET", "%", "_", "' OR 1=1 --"]) expect((await view(f, "q=" + encodeURIComponent(q))).items).toEqual([]);
  });
  it("paginates the same immutable snapshot in a deterministic order", async () => {
    const f = await published(false, 25);
    const a = await view(f), b = await view(f, "page=2"), c = await view(f, "page=3");
    expect(a.total).toBe(27); expect(a.items).toHaveLength(24); expect(b.items).toHaveLength(3); expect(c.items).toEqual([]);
    expect(new Set([...a.items, ...b.items].map(i => i.id)).size).toBe(27);
  });
  it("requires subscription public access outside the legacy local mode", async () => {
    const f = await published();
    expect((await new SharingService(env.DB, "production", "true").view(f.tenant, new URLSearchParams())).publication).toBeNull();
    expect((await new SharingService(env.DB, "staging", "true").view(f.tenant, new URLSearchParams())).publication).toBeNull();
    expect((await new SharingService(env.DB, "local", "false").view(f.tenant, new URLSearchParams())).publication).toBeNull();
  });
  it("generates production canonical targets in staging with an active trial", async () => {
    const f = await published(true), data = await new SharingService(env.DB, "staging").view(f.tenant, new URLSearchParams());
    expect(data.deployment).toBe("staging"); expect(data.publication!.target.url).toBe("https://" + f.slug + ".techabanca.com/");
    expect(JSON.stringify(data)).not.toContain("catalogue-preview");
  });
  it("removes targets after expiry even when the local legacy option is enabled", async () => {
    const f = await published(true);
    await env.DB.prepare("UPDATE subscriptions SET status = 'expired' WHERE organization_id = ?").bind(f.n).run();
    expect(await view(f)).toMatchObject({ publication: null, items: [], total: 0 });
  });
  it.each(["route", "publication", "catalogue", "organization", "organization-deleted"] as const)("removes links when %s becomes unavailable", async state => {
    const f = await published();
    if (state === "route") await env.DB.prepare("UPDATE public_catalogue_routes SET status = 'suspended' WHERE catalogue_public_id = ?").bind(id("cat", f.n)).run();
    if (state === "publication") await env.DB.prepare("UPDATE catalogue_publications SET state = 'retired', retired_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE public_id = ?").bind(f.publication).run();
    if (state === "catalogue") await env.DB.prepare("UPDATE catalogues SET status = 'suspended' WHERE id = ?").bind(f.n).run();
    if (state === "organization") await env.DB.prepare("UPDATE organizations SET status = 'suspended' WHERE id = ?").bind(f.n).run();
    if (state === "organization-deleted") await env.DB.prepare("UPDATE organizations SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(f.n).run();
    expect(await view(f)).toMatchObject({ publication: null, items: [] });
  });
  it("removes targets after unpublishing", async () => {
    const f = await published(); await f.publisher.unpublish(f.tenant, f.actor, await f.revision(), f.publication);
    expect((await view(f)).publication).toBeNull();
  });
  it("does not share another tenant's current publication", async () => {
    const f = await publicationFixture(), other = await published();
    expect((await view(f)).publication).toBeNull(); expect(JSON.stringify(await view(f))).not.toContain(other.slug);
  });
  it.each(["q=x&q=y", "type=all&type=product", "page=1&page=2", "token=private", "org=another", "type=hidden", "page=0", "page=01", "page=10000", "q=" + "a".repeat(101)])("rejects query %s", async query => {
    const f = await publicationFixture(); await expect(view(f, query)).rejects.toMatchObject({ status: 400, code: "invalid_sharing_filters" });
  });
  it.each(["owner", "admin", "editor"] as const)("allows a current %s to read uncached sharing tools", async role => {
    const f = await published(), cookie = await f.session(f[role]);
    const response = await app.request(root, { headers: { Cookie: cookie, "X-Techabanca-Organization": id("org", f.n) } }, { ...env, ...config });
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect((await response.json<{ data: { items: unknown[] } }>()).data.items).toHaveLength(2);
  });
  it("requires authentication and active membership in the requested organization", async () => {
    const f = await publicationFixture(), other = await publicationFixture(), cookie = await f.session();
    const request = (headers: Record<string, string>) => app.request(root, { headers }, { ...env, ...config });
    expect((await request({ "X-Techabanca-Organization": id("org", f.n) })).status).toBe(401);
    expect((await request({ Cookie: cookie, "X-Techabanca-Organization": id("org", other.n) })).status).toBe(403);
    await env.DB.prepare("UPDATE organization_members SET status = 'suspended' WHERE organization_id = ? AND user_id = ?").bind(f.n, f.owner).run();
    expect((await request({ Cookie: cookie, "X-Techabanca-Organization": id("org", f.n) })).status).toBe(403);
  });
  it("fails safely without returning partial share targets on a database error", async () => {
    const f = await publicationFixture(), cookie = await f.session();
    const db = new Proxy(env.DB, { get(target, key) {
      if (key === "prepare") return (sql: string) => { if (sql.includes("WITH live")) throw new Error("PRIVATE SQL DETAIL"); return target.prepare(sql); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const response = await app.request(root, { headers: { Cookie: cookie, "X-Techabanca-Organization": id("org", f.n) } }, { ...env, ...config, DB: db });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE"); expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

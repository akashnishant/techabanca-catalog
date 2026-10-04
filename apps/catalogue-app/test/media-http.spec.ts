import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantContextFromResolvedMembership, type ItemMedia, type WebsiteMedia, type ReadyAssetSummary } from "@techabanca/domain";
import { SECURE_SESSION_COOKIE_NAME } from "../src/worker/http/session-cookie";
import { TENANT_HEADER } from "../src/worker/middleware/require-tenant-access";
import { SessionRepository } from "../src/worker/repositories";
import { MediaRepository } from "../src/worker/repositories/media-repository";
import { AuthSessionService } from "../src/worker/services/auth-session-service";

const publicId = (prefix: string, value: number) => prefix + "_" + value.toString(16).padStart(32, "0");
const ORG = publicId("org", 82001), OTHER = publicId("org", 82002);
const ITEM = publicId("itm", 83001), OTHER_ITEM = publicId("itm", 83002);
const IMAGE = publicId("ast", 84001), IMAGE2 = publicId("ast", 84002), PDF = publicId("ast", 84003);
const FOREIGN = publicId("ast", 84004), PENDING = publicId("ast", 84005), FAILED = publicId("ast", 84006);
const ROOT = "https://catalogue.test/api/v1/catalogue";
const tenant = tenantContextFromResolvedMembership({ organizationId: 82001, organizationPublicId: ORG });
const images = (ids = [IMAGE]) => ids.map((assetId, index) => ({ assetId, altText: "  Front view  ", isPrimary: index === 0 }));
const input = (version = 1) => ({ version, images: images(), documents: [{ assetId: PDF, label: " Safety sheet ", isVisible: false }] });

async function fixture() {
  for (const table of ["catalogue_website_settings", "item_images", "item_documents", "item_attribute_values", "enquiries",
    "catalogue_items", "assets", "categories", "catalogues", "business_profiles", "organization_members", "sessions", "organizations", "users"]) {
    await env.DB.prepare("DELETE FROM " + table).run();
  }
  const now = new Date().toISOString();
  for (const [id, role] of [[81001, "owner"], [81002, "admin"], [81003, "editor"]] as const) {
    await env.DB.prepare("INSERT INTO users (id, public_id, email, password_hash, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'test-hash', ?, 'active', ?, ?)")
      .bind(id, publicId("usr", id), role + "@media.test", role, now, now).run();
  }
  for (const [id, org] of [[82001, ORG], [82002, OTHER]] as const) {
    await env.DB.prepare("INSERT INTO organizations (id, public_id, name, country_code, timezone, status, business_type_id, created_at, updated_at) VALUES (?, ?, 'Media test', 'IN', 'Asia/Kolkata', 'active', 1, ?, ?)")
      .bind(id, org, now, now).run();
    await env.DB.prepare("INSERT INTO catalogues (id, public_id, organization_id, name, slug, mode, created_at, updated_at) VALUES (?, ?, ?, 'Media catalogue', ?, 'both', ?, ?)")
      .bind(id, publicId("cat", id), id, "media-test-" + id, now, now).run();
    await env.DB.prepare("INSERT INTO catalogue_website_settings (catalogue_id, created_at, updated_at) VALUES (?, ?, ?)").bind(id, now, now).run();
  }
  for (const [user, org, role] of [[81001, 82001, "owner"], [81002, 82001, "admin"], [81003, 82001, "editor"], [81001, 82002, "owner"]] as const) {
    await env.DB.prepare("INSERT INTO organization_members (public_id, organization_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)")
      .bind(publicId("mem", user * 100000 + org), org, user, role, now, now).run();
  }
  for (const [id, catalogue] of [[83001, 82001], [83002, 82002]] as const) {
    await env.DB.prepare("INSERT INTO catalogue_items (id, public_id, catalogue_id, item_type, name, slug, created_at, updated_at) VALUES (?, ?, ?, 'product', 'Pump', ?, ?, ?)")
      .bind(id, publicId("itm", id), catalogue, "pump-" + id, now, now).run();
  }
  for (const [id, org, kind, status] of [[84001, 82001, "image", "ready"], [84002, 82001, "image", "ready"],
    [84003, 82001, "document", "ready"], [84004, 82002, "image", "ready"], [84005, 82001, "image", "pending"], [84006, 82001, "image", "failed"]] as const) {
    await env.DB.prepare("INSERT INTO assets (id, public_id, organization_id, asset_kind, object_key, original_filename, mime_type, byte_size, status, ready_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 68, ?, ?, ?, ?)")
      .bind(id, publicId("ast", id), org, kind, "media-tests/" + id, kind === "image" ? "pump-" + id + ".png" : "safety.pdf",
        kind === "image" ? "image/png" : "application/pdf", status, status === "ready" ? now : null, now, now).run();
  }
}
async function session(user = 81001) {
  const result = await new AuthSessionService(new SessionRepository(env.DB)).create(user, new Date());
  return SECURE_SESSION_COOKIE_NAME + "=" + result.token;
}
function call(cookie: string | null, path: string, body?: unknown, org = ORG, origin = "https://catalogue.test") {
  return exports.default.fetch(new Request(ROOT + path, { method: body === undefined ? "GET" : "PUT",
    headers: { ...(cookie ? { cookie } : {}), [TENANT_HEADER]: org, Origin: origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
}
async function media(cookie: string) {
  const response = await call(cookie, "/items/" + ITEM + "/media");
  expect(response.status).toBe(200);
  return (await response.json<{ data: { media: ItemMedia } }>()).data.media;
}
async function website(cookie: string) {
  const response = await call(cookie, "/website/media");
  expect(response.status).toBe(200);
  return (await response.json<{ data: { media: WebsiteMedia } }>()).data.media;
}
function removeUpload(cookie: string, id: string, version: unknown) {
  return exports.default.fetch(new Request(ROOT + "/assets/" + id, { method: "DELETE",
    headers: { cookie, [TENANT_HEADER]: ORG, Origin: "https://catalogue.test", "Content-Type": "application/json" },
    body: JSON.stringify({ version }) }));
}
describe("item and website media", () => {
  beforeEach(fixture);
  it("requires authentication for media, website media and the ready-file library", async () => {
    for (const path of ["/items/" + ITEM + "/media", "/website/media", "/assets?kind=image"]) expect((await call(null, path)).status).toBe(401);
  });
  it("requires explicit tenant selection", async () => {
    const response = await exports.default.fetch(new Request(ROOT + "/items/" + ITEM + "/media", { headers: { cookie: await session() } }));
    expect(response.status).toBe(400);
  });
  it("returns an empty independently versioned media collection", async () => {
    expect(await media(await session())).toEqual({ itemId: ITEM, version: 1, images: [], documents: [] });
  });
  it("owners and admins save ready files, normalized labels, order and a single primary image", async () => {
    for (const [user, version] of [[81001, 1], [81002, 2]] as const) {
      const response = await call(await session(user), "/items/" + ITEM + "/media", { ...input(version), images: images([IMAGE2, IMAGE]) });
      expect(response.status).toBe(200);
      const saved = (await response.json<{ data: { media: ItemMedia } }>()).data.media;
      expect(saved.version).toBe(version + 1);
      expect(saved.images.map(row => [row.assetId, row.sortOrder, row.isPrimary])).toEqual([[IMAGE2, 0, true], [IMAGE, 1, false]]);
      expect(saved.images[0].altText).toBe("Front view");
      expect(saved.documents[0]).toMatchObject({ label: "Safety sheet", isVisible: false, sortOrder: 0 });
      expect(saved.images[0].asset).not.toHaveProperty("objectKey");
    }
  });
  it("editors can read media and the library but cannot change attachments or website images", async () => {
    const cookie = await session(81003);
    expect((await call(cookie, "/items/" + ITEM + "/media")).status).toBe(200);
    expect((await call(cookie, "/assets?kind=image")).status).toBe(200);
    expect((await call(cookie, "/website/media")).status).toBe(200);
    expect((await call(cookie, "/items/" + ITEM + "/media", input())).status).toBe(403);
    expect((await call(cookie, "/website/media", { version: 1, logoAssetId: IMAGE, heroAssetId: null })).status).toBe(403);
  });
  it("keeps item IDs and ready-file lists scoped to the selected tenant", async () => {
    const cookie = await session();
    expect((await call(cookie, "/items/" + ITEM + "/media", undefined, OTHER)).status).toBe(404);
    expect((await call(cookie, "/items/" + OTHER_ITEM + "/media")).status).toBe(404);
    expect((await call(cookie, "/items/" + OTHER_ITEM + "/media", input())).status).toBe(404);
    const list = await (await call(cookie, "/assets?kind=image")).json<{ data: { assets: ReadyAssetSummary[] } }>();
    expect(list.data.assets.map(row => row.id)).toEqual([IMAGE, IMAGE2]);
    expect(JSON.stringify(list)).not.toContain("objectKey");
  });
  it("rejects foreign-tenant, pending, failed and wrong-kind attachments without changing the revision", async () => {
    const cookie = await session();
    for (const id of [FOREIGN, PENDING, FAILED, PDF]) {
      expect((await call(cookie, "/items/" + ITEM + "/media", { version: 1, images: images([id]), documents: [] })).status).toBe(400);
    }
    expect((await call(cookie, "/items/" + ITEM + "/media", { version: 1, images: [], documents: [{ assetId: IMAGE, label: null, isVisible: true }] })).status).toBe(400);
    expect((await media(cookie)).version).toBe(1);
  });
  it("rejects duplicate files, malformed IDs and ambiguous primary images", async () => {
    const cookie = await session();
    for (const rows of [images([IMAGE, IMAGE]), [{ ...images()[0], isPrimary: false }], images([IMAGE, IMAGE2]).map(row => ({ ...row, isPrimary: true })),
      images(["ast_" + "z".repeat(32)])]) {
      expect((await call(cookie, "/items/" + ITEM + "/media", { version: 1, images: rows, documents: [] })).status).toBe(400);
    }
  });
  it("enforces collection limits and bounded typed captions", async () => {
    const cookie = await session();
    for (const body of [{ ...input(), images: Array.from({ length: 13 }, () => images()[0]) },
      { ...input(), documents: Array.from({ length: 9 }, () => input().documents[0]) },
      { ...input(), images: [{ ...images()[0], altText: "x".repeat(301) }] },
      { ...input(), documents: [{ ...input().documents[0], label: "x".repeat(161) }] },
      { ...input(), images: [{ ...images()[0], altText: 123 }] },
      { ...input(), documents: [{ ...input().documents[0], isVisible: "false" }] }]) {
      expect((await call(cookie, "/items/" + ITEM + "/media", body)).status).toBe(400);
    }
  });
  it("rejects malformed/oversized JSON without writing media", async () => {
    const cookie = await session();
    for (const [body, status] of [["{bad", 400], ["x".repeat(16385), 413]] as const) {
      const response = await exports.default.fetch(new Request(ROOT + "/items/" + ITEM + "/media", {
        method: "PUT", headers: { cookie, [TENANT_HEADER]: ORG, Origin: "https://catalogue.test" }, body,
      }));
      expect(response.status).toBe(status);
    }
    expect((await media(cookie)).version).toBe(1);
  });
  it("rejects invalid media versions and foreign-origin changes", async () => {
    const cookie = await session();
    for (const version of [0, 1.5, "1", null]) expect((await call(cookie, "/items/" + ITEM + "/media", { ...input(), version })).status).toBe(400);
    expect((await call(cookie, "/items/" + ITEM + "/media", input(), ORG, "https://foreign.test")).status).toBe(403);
  });
  it("rejects stale replacement without touching the winning links", async () => {
    const cookie = await session();
    expect((await call(cookie, "/items/" + ITEM + "/media", input())).status).toBe(200);
    expect((await call(cookie, "/items/" + ITEM + "/media", { version: 1, images: [], documents: [] })).status).toBe(409);
    expect((await media(cookie)).images[0].assetId).toBe(IMAGE);
  });
  it("gives concurrent replacement one winner and preserves that winner's entire collection", async () => {
    const cookie = await session();
    const attempts = [input(), { version: 1, images: images([IMAGE2]), documents: [] }];
    const responses = await Promise.all(attempts.map(body => call(cookie, "/items/" + ITEM + "/media", body)));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const winner = responses.findIndex(response => response.status === 200);
    const current = await media(cookie);
    expect(current.version).toBe(2);
    expect(current.images.map(row => row.assetId)).toEqual(attempts[winner].images.map(row => row.assetId));
    expect(current.documents.map(row => row.assetId)).toEqual(attempts[winner].documents.map(row => row.assetId));
  });
  it("rolls back the revision and both collections when an attachment constraint fails", async () => {
    const cookie = await session();
    await call(cookie, "/items/" + ITEM + "/media", input());
    await expect(new MediaRepository(env.DB).replaceItem(tenant, 83001, 2,
      [{ assetId: 84004, altText: null, isPrimary: true }], [])).rejects.toThrow();
    const current = await media(cookie);
    expect(current.version).toBe(2);
    expect(current.images[0].assetId).toBe(IMAGE);
    expect(current.documents[0].assetId).toBe(PDF);
  });
  it("detaches all files while retaining asset metadata and the item content revision", async () => {
    const cookie = await session();
    await call(cookie, "/items/" + ITEM + "/media", input());
    expect((await call(cookie, "/items/" + ITEM + "/media", { version: 2, images: [], documents: [] })).status).toBe(200);
    expect(await media(cookie)).toMatchObject({ version: 3, images: [], documents: [] });
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM assets").first<{ count: number }>())?.count).toBe(6);
    expect((await env.DB.prepare("SELECT version FROM catalogue_items WHERE id = 83001").first<{ version: number }>())?.version).toBe(1);
  });
  it("does not expose or mutate archived items/catalogues", async () => {
    const cookie = await session();
    await env.DB.prepare("UPDATE catalogue_items SET deleted_at = ? WHERE id = 83001").bind(new Date().toISOString()).run();
    expect((await call(cookie, "/items/" + ITEM + "/media")).status).toBe(404);
    expect((await call(cookie, "/items/" + ITEM + "/media", input())).status).toBe(404);
    await env.DB.prepare("UPDATE catalogues SET deleted_at = ? WHERE id = 82001").bind(new Date().toISOString()).run();
    expect((await call(cookie, "/website/media")).status).toBe(400);
  });
  it("prevents an attached asset from becoming deleted", async () => {
    const cookie = await session();
    await call(cookie, "/items/" + ITEM + "/media", input());
    await expect(env.DB.prepare("UPDATE assets SET status = 'deleted', deleted_at = ? WHERE id = 84001").bind(new Date().toISOString()).run()).rejects.toThrow(/asset_in_use/);
    expect((await media(cookie)).images[0].assetId).toBe(IMAGE);
  });
  it("reuses an asset for website logo/hero and removes selections without deleting files", async () => {
    const cookie = await session();
    expect((await call(cookie, "/website/media", { version: 1, logoAssetId: IMAGE, heroAssetId: IMAGE })).status).toBe(200);
    expect(await website(cookie)).toMatchObject({ version: 2, logo: { id: IMAGE }, hero: { id: IMAGE } });
    expect((await call(cookie, "/website/media", { version: 2, logoAssetId: null, heroAssetId: null })).status).toBe(200);
    expect(await website(cookie)).toMatchObject({ version: 3, logo: null, hero: null });
    expect((await env.DB.prepare("SELECT status FROM assets WHERE id = 84001").first<{ status: string }>())?.status).toBe("ready");
  });
  it("rejects stale website selection, invalid IDs, wrong kind and foreign assets", async () => {
    const cookie = await session();
    await call(cookie, "/website/media", { version: 1, logoAssetId: IMAGE, heroAssetId: null });
    expect((await call(cookie, "/website/media", { version: 1, logoAssetId: IMAGE2, heroAssetId: null })).status).toBe(409);
    for (const id of [FOREIGN, PDF, PENDING, "bad"]) expect((await call(cookie, "/website/media", { version: 2, logoAssetId: id, heroAssetId: null })).status).toBe(400);
    expect((await website(cookie)).logo?.id).toBe(IMAGE);
  });
  it("paginated library includes each ready file once and rejects invalid filters/cursors", async () => {
    const cookie = await session(), now = new Date().toISOString();
    for (let id = 85000; id < 85025; id++) {
      await env.DB.prepare("INSERT INTO assets (public_id, organization_id, asset_kind, object_key, original_filename, mime_type, byte_size, status, ready_at, created_at, updated_at) VALUES (?, 82001, 'image', ?, 'extra.png', 'image/png', 68, 'ready', ?, ?, ?)")
        .bind(publicId("ast", id), "media-extra/" + id, now, now, now).run();
    }
    const first = await (await call(cookie, "/assets?kind=image")).json<{ data: { assets: ReadyAssetSummary[]; nextCursor: string } }>();
    expect(first.data.assets).toHaveLength(24);
    const second = await (await call(cookie, "/assets?kind=image&after=" + first.data.nextCursor)).json<{ data: { assets: ReadyAssetSummary[]; nextCursor: null } }>();
    expect(second.data.assets).toHaveLength(3);
    expect(new Set([...first.data.assets, ...second.data.assets].map(row => row.id)).size).toBe(27);
    expect(second.data.nextCursor).toBeNull();
    for (const path of ["/assets", "/assets?kind=svg", "/assets?kind=image&after=bad"]) expect((await call(cookie, path)).status).toBe(400);
  });

  it("owners/admins remove unused metadata while retaining stored R2 bytes", async () => {
    await env.ASSETS.put("media-tests/84001", "retained publication bytes");
    for (const [user, asset] of [[81001, IMAGE], [81002, IMAGE2]] as const) {
      const cookie = await session(user);
      expect((await removeUpload(cookie, asset, 1)).status).toBe(204);
      expect((await call(cookie, "/assets/" + asset)).status).toBe(404);
      expect((await call(cookie, "/assets/" + asset + "/content")).status).toBe(404);
    }
    expect(await (await env.ASSETS.get("media-tests/84001"))?.text()).toBe("retained publication bytes");
  });
  it("editors and foreign origins cannot delete upload metadata", async () => {
    expect((await removeUpload(await session(81003), IMAGE, 1)).status).toBe(403);
    const response = await exports.default.fetch(new Request(ROOT + "/assets/" + IMAGE, { method: "DELETE",
      headers: { cookie: await session(), [TENANT_HEADER]: ORG, Origin: "https://foreign.test" }, body: JSON.stringify({ version: 1 }) }));
    expect(response.status).toBe(403);
    expect((await call(await session(), "/assets/" + IMAGE)).status).toBe(200);
  });
  it("in-use item images and documents are protected until detached", async () => {
    const cookie = await session();
    await call(cookie, "/items/" + ITEM + "/media", input());
    for (const asset of [IMAGE, PDF]) {
      const response = await removeUpload(cookie, asset, 1);
      expect(response.status).toBe(409);
      expect((await response.json<{ error: { code: string } }>()).error.code).toBe("asset_in_use");
    }
    await call(cookie, "/items/" + ITEM + "/media", { version: 2, images: [], documents: [] });
    expect((await removeUpload(cookie, IMAGE, 1)).status).toBe(204);
  });
  it("website selections protect uploads until removed", async () => {
    const cookie = await session();
    await call(cookie, "/website/media", { version: 1, logoAssetId: IMAGE, heroAssetId: IMAGE2 });
    expect((await removeUpload(cookie, IMAGE, 1)).status).toBe(409);
    expect((await removeUpload(cookie, IMAGE2, 1)).status).toBe(409);
    await call(cookie, "/website/media", { version: 2, logoAssetId: null, heroAssetId: null });
    expect((await removeUpload(cookie, IMAGE2, 1)).status).toBe(204);
  });
  it("deletion is tenant-scoped, versioned, and idempotently absent after success", async () => {
    const cookie = await session();
    expect((await removeUpload(cookie, FOREIGN, 1)).status).toBe(404);
    expect((await removeUpload(cookie, IMAGE, 2)).status).toBe(409);
    expect((await removeUpload(cookie, IMAGE, "1")).status).toBe(400);
    expect((await removeUpload(cookie, IMAGE, 1)).status).toBe(204);
    expect((await removeUpload(cookie, IMAGE, 1)).status).toBe(404);
  });
  it("pending and failed uploads can be removed without reviving their lifecycle", async () => {
    const cookie = await session();
    expect((await removeUpload(cookie, PENDING, 1)).status).toBe(204);
    expect((await removeUpload(cookie, FAILED, 1)).status).toBe(204);
    for (const id of [84005, 84006]) expect((await env.DB.prepare("SELECT status, version FROM assets WHERE id = ?").bind(id)
      .first<{ status: string; version: number }>())).toMatchObject({ status: "deleted", version: 2 });
  });
});

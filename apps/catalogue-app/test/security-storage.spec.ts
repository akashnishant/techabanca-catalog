import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/worker";
import { AssetLifecycleRepository } from "../src/worker/repositories";
import { AssetActorUnavailable } from "../src/worker/repositories/asset-lifecycle-repository";
import { publicationFixture, id } from "./publication-fixtures";
const config = { ...env, DEPLOYMENT_ENVIRONMENT: "local", ASSET_UPLOAD_SIGNING_SECRET: "a".repeat(64) };
const root = "https://catalogue.test/api/v1/catalogue/assets";
async function fixture() {
  const f = await publicationFixture(), cookie = await f.session();
  const sessionId = (await env.DB.prepare("SELECT id FROM sessions WHERE user_id=? ORDER BY id DESC LIMIT 1").bind(f.owner).first<{ id: number }>())!.id;
  const headers = { Cookie: cookie, "X-Techabanca-Organization": id("org",f.n), Origin: "https://catalogue.test", "Content-Type": "application/json" };
  const png = new Uint8Array(await (await env.ASSETS.get(f.imageKey))!.arrayBuffer());
  await env.ASSETS.put(f.imageKey,png,{httpMetadata:{contentType:"image/png"},sha256:await crypto.subtle.digest("SHA-256",Uint8Array.from(png))});
  const createIntent = async () => {
    const r = await app.request(root + "/upload-intents", { method: "POST", headers, body: JSON.stringify({ originalFilename: "race.png", mimeType: "image/png", expectedByteSize: png.length }) }, config);
    expect(r.status).toBe(201); return (await r.json<{ data: { asset: { id: string }; upload: { url: string } } }>()).data;
  };
  return { ...f, headers, png, createIntent, sessionId, actor: { userId: f.owner, sessionId } };
}
function interceptGet(revoke: () => Promise<unknown>) {
  return new Proxy(env.ASSETS, { get(target,key) {
    if (key === "get") return async (...args: Parameters<R2Bucket["get"]>) => { const object = await target.get(...args); await revoke(); return object; };
    const value = Reflect.get(target,key); return typeof value === "function" ? value.bind(target) : value;
  } });
}
describe("file access after asynchronous storage work", () => {
  it.each(["membership", "session", "user", "organization"] as const)("rejects %s revocation while downloading", async kind => {
    const f = await fixture();
    const revoke = () => kind === "membership" ? env.DB.prepare("UPDATE organization_members SET status='suspended' WHERE organization_id=? AND user_id=?").bind(f.n,f.owner).run()
      : kind === "session" ? env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?").bind(new Date().toISOString(),f.sessionId).run()
      : kind === "user" ? env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(f.owner).run()
      : env.DB.prepare("UPDATE organizations SET status='suspended' WHERE id=?").bind(f.n).run();
    const r = await app.request(root + "/" + f.imageId + "/content", { headers: f.headers }, { ...config, ASSETS: interceptGet(revoke) });
    expect(r.status).toBe(403); expect(await r.text()).not.toContain("object_key");
  });
  it("keeps editor downloads available and serves them as sandboxed attachments", async () => {
    const f = await fixture(), Cookie = await f.session(f.editor);
    const r = await app.request(root + "/" + f.imageId + "/content", { headers: { ...f.headers, Cookie } }, config);
    expect(r.status).toBe(200); expect(r.headers.get("Content-Disposition")).toContain("attachment;");
    expect(r.headers.get("Content-Security-Policy")).toContain("sandbox"); expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(f.png);
  });
  it("does not mark an upload ready after its membership was revoked during verification", async () => {
    const f = await fixture(), intent = await f.createIntent();
    expect((await app.request("https://catalogue.test" + intent.upload.url, { method: "PUT", headers: { ...f.headers, "Content-Type": "image/png" }, body: f.png }, config)).status).toBe(201);
    const assets = interceptGet(() => env.DB.prepare("UPDATE organization_members SET role='editor' WHERE organization_id=? AND user_id=?").bind(f.n,f.owner).run());
    const r = await app.request(root + "/" + intent.asset.id + "/complete", { method: "POST", headers: f.headers, body: '{"version":1}' }, { ...config, ASSETS: assets });
    expect(r.status).toBe(403);
    expect(await env.DB.prepare("SELECT status,version FROM assets WHERE public_id=?").bind(intent.asset.id).first()).toEqual({ status: "pending", version: 1 });
  });
  it("does not store a slow upload whose session is revoked before its body finishes", async () => {
    const f = await fixture(), intent = await f.createIntent();
    const stream = new ReadableStream<Uint8Array>({ async pull(controller) {
      await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?").bind(new Date().toISOString(),f.sessionId).run();
      controller.enqueue(f.png); controller.close();
    } }, { highWaterMark: 0 });
    const r = await app.fetch(new Request("https://catalogue.test" + intent.upload.url, { method: "PUT", headers: { ...f.headers, "Content-Type": "image/png" }, body: stream }), config);
    expect(r.status).toBe(403);
    const asset = await env.DB.prepare("SELECT object_key AS key,status,version FROM assets WHERE public_id=?").bind(intent.asset.id).first<{ key: string; status: string; version: number }>();
    expect(asset).toMatchObject({ status: "pending", version: 1 }); expect(await env.ASSETS.head(asset!.key)).toBeNull();
  });
  it("gates metadata writes in the same SQL statement as current session/membership checks", async () => {
    const f = await fixture(), intent = await f.createIntent(), repository = new AssetLifecycleRepository(env.DB,f.actor);
    await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?").bind(new Date().toISOString(),f.sessionId).run();
    await expect(repository.markDeleted(f.tenant, { assetPublicId: intent.asset.id, expectedVersion: 1, now: new Date().toISOString() })).rejects.toBeInstanceOf(AssetActorUnavailable);
    expect(await env.DB.prepare("SELECT status,version FROM assets WHERE public_id=?").bind(intent.asset.id).first()).toEqual({ status: "pending", version: 1 });
  });
  it("rejects an asset ID and organization from another tenant", async () => {
    const f = await fixture(), other = await publicationFixture();
    expect((await app.request(root + "/" + other.imageId + "/content", { headers: f.headers }, config)).status).toBe(404);
    expect((await app.request(root + "/" + other.imageId + "/content", { headers: { ...f.headers, "X-Techabanca-Organization": id("org",other.n) } }, config)).status).toBe(403);
  });
});

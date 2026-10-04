import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/worker";
import { SECURE_SESSION_COOKIE_NAME } from "../src/worker/http/session-cookie";
import { TENANT_HEADER } from "../src/worker/middleware/require-tenant-access";
import { SessionRepository } from "../src/worker/repositories";
import { AuthSessionService } from "../src/worker/services/auth-session-service";

const ORG_A = "org_11111111111111111111111111111111";
const ORG_B = "org_22222222222222222222222222222222";
const ROOT = "https://catalogue.test/api/v1/catalogue/assets";
const TEST_SECRET = "a".repeat(64);
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VVEAAAAASUVORK5CYII="),
  (character) => character.charCodeAt(0),
);

type AssetView = {
  id: string; version: number; status: string; expectedByteSize: number;
  byteSize: number | null; checksumSha256: string | null; failureCode: string | null;
};
type Intent = {
  data: {
    asset: AssetView;
    upload: { method: string; url: string; headers: Record<string, string>; expiresAt: string };
  };
};

async function fixtures() {
  for (const table of [
    "catalogue_website_settings", "item_images", "item_documents", "item_attribute_values",
    "enquiries", "catalogue_items", "assets", "categories", "catalogues", "business_profiles",
    "organization_members", "sessions", "organizations", "users",
  ]) await env.DB.prepare("DELETE FROM " + table).run();
  const objects = await env.ASSETS.list();
  if (objects.objects.length) await env.ASSETS.delete(objects.objects.map((object) => object.key));
  const now = new Date().toISOString();
  for (const [id, role] of [[71101, "owner"], [71102, "admin"], [71103, "editor"]] as const) {
    await env.DB.prepare(
      "INSERT INTO users (id, public_id, email, password_hash, display_name, status, created_at, updated_at)"
      + " VALUES (?, ?, ?, 'test-hash', ?, 'active', ?, ?)",
    ).bind(id, "usr_" + String(id).padStart(32, "0"), role + "@asset.test", role, now, now).run();
  }
  for (const [id, publicId] of [[71201, ORG_A], [71202, ORG_B]] as const) {
    await env.DB.prepare(
      "INSERT INTO organizations (id, public_id, name, country_code, timezone, status, business_type_id, created_at, updated_at)"
      + " VALUES (?, ?, 'Asset Test', 'IN', 'Asia/Kolkata', 'active', 1, ?, ?)",
    ).bind(id, publicId, now, now).run();
  }
  for (const [id, userId, organizationId, role] of [
    [71301, 71101, 71201, "owner"], [71302, 71102, 71201, "admin"],
    [71303, 71103, 71201, "editor"], [71304, 71101, 71202, "owner"],
  ] as const) {
    await env.DB.prepare(
      "INSERT INTO organization_members (id, public_id, organization_id, user_id, role, status, created_at, updated_at)"
      + " VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    ).bind(id, "mem_" + String(id).padStart(32, "0"), organizationId, userId, role, now, now).run();
  }
}

async function cookie(userId = 71101) {
  const session = await new AuthSessionService(new SessionRepository(env.DB)).create(userId, new Date());
  return SECURE_SESSION_COOKIE_NAME + "=" + session.token;
}

function headers(session: string, org = ORG_A, mime = "application/json", origin = "https://catalogue.test") {
  return { cookie: session, [TENANT_HEADER]: org, "Content-Type": mime, Origin: origin };
}

function postIntent(session: string, body: unknown, org = ORG_A, origin = "https://catalogue.test") {
  return exports.default.fetch(new Request(ROOT + "/upload-intents", {
    method: "POST", headers: headers(session, org, "application/json", origin), body: JSON.stringify(body),
  }));
}

async function intent(session: string, byteSize = PNG.length, mimeType = "image/png") {
  const response = await postIntent(session, {
    originalFilename: mimeType === "application/pdf" ? "Safety sheet.pdf" : "Pump front.png",
    mimeType, expectedByteSize: byteSize,
  });
  expect(response.status).toBe(201);
  return response.json<Intent>();
}

function put(session: string, upload: Intent, bytes: Uint8Array = PNG, url?: string, org = ORG_A, origin = "https://catalogue.test") {
  return exports.default.fetch(new Request(new URL(url ?? upload.data.upload.url, "https://catalogue.test"), {
    method: "PUT", headers: headers(session, org, upload.data.upload.headers["Content-Type"], origin),
    body: bytes.slice().buffer,
  }));
}

function complete(session: string, assetId: string, version: unknown = 1, org = ORG_A) {
  return exports.default.fetch(new Request(ROOT + "/" + assetId + "/complete", {
    method: "POST", headers: headers(session, org), body: JSON.stringify({ version }),
  }));
}

function read(session: string, id: string, content = false, org = ORG_A) {
  return exports.default.fetch(new Request(ROOT + "/" + id + (content ? "/content" : ""), {
    headers: headers(session, org),
  }));
}

async function ready(session: string) {
  const upload = await intent(session);
  expect((await put(session, upload)).status).toBe(201);
  const response = await complete(session, upload.data.asset.id);
  expect(response.status).toBe(200);
  return { upload, asset: (await response.json<{ data: { asset: AssetView } }>()).data.asset };
}

describe("asset upload HTTP flow", () => {
  beforeEach(fixtures);

  it("requires authentication and explicit tenant selection", async () => {
    const unauthenticated = await exports.default.fetch(new Request(ROOT + "/upload-intents", {
      method: "POST", headers: { Origin: "https://catalogue.test" }, body: "{}",
    }));
    expect(unauthenticated.status).toBe(401);
    const session = await cookie();
    const noTenant = await exports.default.fetch(new Request(ROOT + "/upload-intents", {
      method: "POST", headers: { cookie: session, Origin: "https://catalogue.test" }, body: "{}",
    }));
    expect(noTenant.status).toBe(400);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM assets").first<{ count: number }>())?.count).toBe(0);
  });

  it("lets owners and admins create canonical signed intents without exposing object keys", async () => {
    for (const user of [71101, 71102]) {
      const upload = await intent(await cookie(user));
      expect(upload.data.asset).toMatchObject({ status: "pending", version: 1, expectedByteSize: PNG.length });
      expect(upload.data.asset.id).toMatch(/^ast_[0-9a-f]{32}$/);
      expect(upload.data.asset).not.toHaveProperty("objectKey");
      const url = new URL(upload.data.upload.url, "https://catalogue.test");
      expect(url.searchParams.get("signature")).toMatch(/^[0-9a-f]{64}$/);
      expect(upload.data.upload.method).toBe("PUT");
      expect(Date.parse(upload.data.upload.expiresAt)).toBeGreaterThan(Date.now());
    }
  });

  it("keeps editors read-only at every upload mutation", async () => {
    const owner = await cookie();
    const editor = await cookie(71103);
    const upload = await intent(owner);
    expect((await postIntent(editor, { originalFilename: "x.png", mimeType: "image/png", expectedByteSize: PNG.length })).status).toBe(403);
    expect((await put(editor, upload)).status).toBe(403);
    expect((await complete(editor, upload.data.asset.id)).status).toBe(403);
    expect((await read(editor, upload.data.asset.id)).status).toBe(200);
  });

  it("rejects unsupported MIME types, invalid sizes, and malformed filenames before inserting assets", async () => {
    const session = await cookie();
    const base = { originalFilename: "x.png", mimeType: "image/png", expectedByteSize: PNG.length };
    for (const [change, status] of [
      [{ mimeType: "image/svg+xml" }, 415], [{ expectedByteSize: 0 }, 400],
      [{ expectedByteSize: 8 * 1024 * 1024 + 1 }, 400], [{ expectedByteSize: 1.5 }, 400],
      [{ originalFilename: "bad\nname.png" }, 400], [{ originalFilename: "" }, 400],
    ] as const) expect((await postIntent(session, { ...base, ...change })).status).toBe(status);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM assets").first<{ count: number }>())?.count).toBe(0);
  });

  it("bounds JSON request bodies and rejects malformed JSON", async () => {
    const session = await cookie();
    const malformed = await exports.default.fetch(new Request(ROOT + "/upload-intents", {
      method: "POST", headers: headers(session), body: "{broken",
    }));
    expect(malformed.status).toBe(400);
    const oversized = await exports.default.fetch(new Request(ROOT + "/upload-intents", {
      method: "POST", headers: headers(session), body: "x".repeat(8193),
    }));
    expect(oversized.status).toBe(413);
  });

  it("rejects foreign-origin intents and binary PUTs before storage writes", async () => {
    const session = await cookie();
    expect((await postIntent(session, {}, ORG_A, "https://foreign.test")).status).toBe(403);
    const upload = await intent(session);
    expect((await put(session, upload, PNG, undefined, ORG_A, "https://foreign.test")).status).toBe(403);
    expect((await env.ASSETS.list()).objects).toHaveLength(0);
  });

  it("does not allow a signed URL to be reused by a different authenticated session", async () => {
    const firstSession = await cookie();
    const secondSession = await cookie();
    const upload = await intent(firstSession);
    expect((await put(secondSession, upload)).status).toBe(403);
    expect((await env.ASSETS.list()).objects).toHaveLength(0);
  });

  it("keeps metadata, PUT, completion, and download inside the selected tenant", async () => {
    const session = await cookie();
    const upload = await intent(session);
    const id = upload.data.asset.id;
    expect((await read(session, id, false, ORG_B)).status).toBe(404);
    expect((await put(session, upload, PNG, undefined, ORG_B)).status).toBe(404);
    expect((await complete(session, id, 1, ORG_B)).status).toBe(404);
    expect((await read(session, id, true, ORG_B)).status).toBe(404);
  });

  it("rejects altered or missing upload signatures", async () => {
    const session = await cookie();
    const upload = await intent(session);
    const url = new URL(upload.data.upload.url, "https://catalogue.test");
    url.searchParams.set("signature", "0".repeat(64));
    expect((await put(session, upload, PNG, url.toString())).status).toBe(403);
    url.searchParams.delete("signature");
    expect((await put(session, upload, PNG, url.toString())).status).toBe(403);
    expect((await env.ASSETS.list()).objects).toHaveLength(0);
  });

  it("binds the signature to the asset and prevents swapping intent URLs", async () => {
    const session = await cookie();
    const first = await intent(session);
    const second = await intent(session);
    const swapped = first.data.upload.url.replace(first.data.asset.id, second.data.asset.id);
    expect((await put(session, second, PNG, swapped)).status).toBe(403);
  });

  it("rejects stale optimistic versions before reading the upload body", async () => {
    const session = await cookie();
    const upload = await intent(session);
    const url = new URL(upload.data.upload.url, "https://catalogue.test");
    url.searchParams.set("version", "2");
    expect((await put(session, upload, PNG, url.toString())).status).toBe(409);
    expect((await complete(session, upload.data.asset.id, 2)).status).toBe(409);
    expect((await complete(session, upload.data.asset.id, "1")).status).toBe(400);
  });

  it("enforces MIME type and exact byte count before storing content", async () => {
    const session = await cookie();
    const upload = await intent(session);
    const wrongMime = await exports.default.fetch(new Request(new URL(upload.data.upload.url, "https://catalogue.test"), {
      method: "PUT", headers: headers(session, ORG_A, "application/pdf"), body: PNG.slice().buffer,
    }));
    expect(wrongMime.status).toBe(415);
    expect((await put(session, upload, PNG.slice(0, -1))).status).toBe(400);
    expect((await put(session, upload, new Uint8Array(PNG.length + 1))).status).toBe(413);
    expect((await env.ASSETS.list()).objects).toHaveLength(0);
  });

  it("atomically allows only one concurrent PUT and preserves the winning bytes", async () => {
    const session = await cookie();
    const upload = await intent(session);
    const outcomes = await Promise.all([put(session, upload), put(session, upload)]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([201, 409]);
    const object = (await env.ASSETS.list()).objects[0];
    expect(new Uint8Array(await (await env.ASSETS.get(object.key))!.arrayBuffer())).toEqual(PNG);
    expect((await put(session, upload)).status).toBe(409);
  });

  it("bounds streamed uploads without trusting a Content-Length header", async () => {
    const session = await cookie();
    const upload = await intent(session);
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PNG);
        controller.enqueue(new Uint8Array([0]));
      },
      cancel() { cancelled = true; },
    });
    const request = new Request(new URL(upload.data.upload.url, "https://catalogue.test"), {
      method: "PUT", headers: headers(session, ORG_A, "image/png"), body,
    });
    expect(request.headers.has("Content-Length")).toBe(false);
    const response = await app.fetch(request, {
      DB: env.DB, ASSETS: env.ASSETS, ASSET_UPLOAD_SIGNING_SECRET: TEST_SECRET,
    });
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect((await env.ASSETS.list()).objects).toHaveLength(0);
  });

  it("allows only one concurrent completion and increments the version once", async () => {
    const session = await cookie();
    const upload = await intent(session);
    expect((await put(session, upload)).status).toBe(201);
    const outcomes = await Promise.all([
      complete(session, upload.data.asset.id), complete(session, upload.data.asset.id),
    ]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([200, 409]);
    const asset = (await (await read(session, upload.data.asset.id))
      .json<{ data: { asset: AssetView } }>()).data.asset;
    expect(asset).toMatchObject({ status: "ready", version: 2, byteSize: PNG.length });
  });

  it("requires stored content before completion without terminally failing the pending asset", async () => {
    const session = await cookie();
    const upload = await intent(session);
    expect((await complete(session, upload.data.asset.id)).status).toBe(409);
    expect((await read(session, upload.data.asset.id)).status).toBe(200);
    const asset = (await (await read(session, upload.data.asset.id)).json<{ data: { asset: AssetView } }>()).data.asset;
    expect(asset.status).toBe("pending");
    expect(asset.version).toBe(1);
  });

  it("completes from R2 metadata and checksum and permits private downloads for editors", async () => {
    const owner = await cookie();
    const editor = await cookie(71103);
    const result = await ready(owner);
    expect(result.asset).toMatchObject({ status: "ready", version: 2, byteSize: PNG.length, failureCode: null });
    expect(result.asset.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    const download = await read(editor, result.asset.id, true);
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Type")).toBe("image/png");
    expect(download.headers.get("Cache-Control")).toBe("no-store");
    expect(download.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(download.headers.get("Content-Disposition")).toContain("Pump%20front.png");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(PNG);
    expect((await put(owner, result.upload)).status).toBe(409);
    expect((await complete(owner, result.asset.id)).status).toBe(409);
  });

  it("supports PDF uploads and ignores client-supplied verification metadata", async () => {
    const session = await cookie();
    const bytes = new TextEncoder().encode("%PDF-1.7\n%%EOF\n");
    const upload = await intent(session, bytes.length, "application/pdf");
    expect((await put(session, upload, bytes)).status).toBe(201);
    const response = await exports.default.fetch(new Request(ROOT + "/" + upload.data.asset.id + "/complete", {
      method: "POST", headers: headers(session),
      body: JSON.stringify({ version: 1, actualByteSize: 99999, checksumSha256: "forged", etag: "forged" }),
    }));
    expect(response.status).toBe(200);
    const asset = (await response.json<{ data: { asset: AssetView } }>()).data.asset;
    expect(asset.byteSize).toBe(bytes.length);
    expect(asset.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails invalid binary signatures without exposing content as ready", async () => {
    const session = await cookie();
    const upload = await intent(session);
    expect((await put(session, upload, new Uint8Array(PNG.length))).status).toBe(201);
    expect((await complete(session, upload.data.asset.id)).status).toBe(400);
    const asset = (await (await read(session, upload.data.asset.id)).json<{ data: { asset: AssetView } }>()).data.asset;
    expect(asset).toMatchObject({ status: "failed", failureCode: "signature_mismatch", version: 2 });
    expect((await read(session, asset.id, true)).status).toBe(409);
  });

  it("fails stored objects with mismatched server metadata", async () => {
    const session = await cookie();
    const upload = await intent(session);
    const row = await env.DB.prepare("SELECT object_key FROM assets WHERE public_id = ?")
      .bind(upload.data.asset.id).first<{ object_key: string }>();
    await env.ASSETS.put(row!.object_key, PNG, { httpMetadata: { contentType: "image/png" } });
    expect((await complete(session, upload.data.asset.id)).status).toBe(400);
    const asset = (await (await read(session, upload.data.asset.id)).json<{ data: { asset: AssetView } }>()).data.asset;
    expect(asset.failureCode).toBe("object_metadata_mismatch");
    expect(asset.status).toBe("failed");
  });

  it("expires stale intents and rejects their uploads", async () => {
    const session = await cookie();
    const upload = await intent(session);
    await env.DB.prepare("UPDATE assets SET upload_expires_at = ? WHERE public_id = ?")
      .bind("2000-01-01T00:00:00.000Z", upload.data.asset.id).run();
    expect((await put(session, upload)).status).toBe(410);
    const asset = (await (await read(session, upload.data.asset.id)).json<{ data: { asset: AssetView } }>()).data.asset;
    expect(asset).toMatchObject({ status: "failed", failureCode: "upload_expired", version: 2 });
    expect((await env.ASSETS.list()).objects).toHaveLength(0);
  });

  it("rejects revoked sessions even when a valid upload signature was issued", async () => {
    const session = await cookie();
    const upload = await intent(session);
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ?")
      .bind(new Date().toISOString(), 71101).run();
    expect((await put(session, upload)).status).toBe(401);
  });

  it("hides deleted assets and rejects malformed public IDs", async () => {
    const session = await cookie();
    const upload = await intent(session);
    await env.DB.prepare("UPDATE assets SET status = 'deleted', deleted_at = ? WHERE public_id = ?")
      .bind(new Date().toISOString(), upload.data.asset.id).run();
    expect((await read(session, upload.data.asset.id)).status).toBe(404);
    expect((await put(session, upload)).status).toBe(404);
    expect((await read(session, "ast_" + "z".repeat(32))).status).toBe(400);
  });

  it("rejects replaced content after the asset has been verified", async () => {
    const session = await cookie();
    const result = await ready(session);
    const row = await env.DB.prepare("SELECT object_key FROM assets WHERE public_id = ?")
      .bind(result.asset.id).first<{ object_key: string }>();
    await env.ASSETS.put(row!.object_key, new Uint8Array(PNG.length), { httpMetadata: { contentType: "image/png" } });
    expect((await read(session, result.asset.id, true)).status).toBe(409);
  });

  it("rejects unconfigured uploads without creating a pending row", async () => {
    const session = await cookie();
    const response = await app.fetch(new Request(ROOT + "/upload-intents", {
      method: "POST", headers: headers(session),
      body: JSON.stringify({ originalFilename: "x.png", mimeType: "image/png", expectedByteSize: PNG.length }),
    }), { DB: env.DB, ASSETS: env.ASSETS });
    expect(response.status).toBe(503);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM assets").first<{ count: number }>())?.count).toBe(0);
  });

  it("sanitizes storage failures and leaves the intent available for retry", async () => {
    const session = await cookie();
    const upload = await intent(session);
    const bucket = new Proxy(env.ASSETS, {
      get(target, property) {
        if (property === "put") return async () => { throw new Error("private storage details"); };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const response = await app.fetch(new Request(new URL(upload.data.upload.url, "https://catalogue.test"), {
      method: "PUT", headers: headers(session, ORG_A, "image/png"), body: PNG.slice().buffer,
    }), { DB: env.DB, ASSETS: bucket, ASSET_UPLOAD_SIGNING_SECRET: TEST_SECRET });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private storage details");
    const asset = (await (await read(session, upload.data.asset.id)).json<{ data: { asset: AssetView } }>()).data.asset;
    expect(asset.status).toBe("pending");
    expect((await put(session, upload)).status).toBe(201);
  });
});

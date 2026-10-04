import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createFixture, pdf, publicId } from "./fixtures";
async function media(f: Awaited<ReturnType<typeof createFixture>>, id: string, init?: RequestInit) { return exports.default.fetch(new Request(f.origin + "/media/" + f.publicationId + "/" + id, init)); }
describe("published-only public media", () => {
  it("streams verified snapshot images and PDF attachments without authentication", async () => {
    const f = await createFixture();
    const image = await media(f, f.imageId);
    expect(image.status).toBe(200); expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const document = await media(f, f.documentId);
    expect(document.status).toBe(200); expect(document.headers.get("content-type")).toBe("application/pdf");
    expect(document.headers.get("content-disposition")).toContain('attachment; filename="Safety data sheet.pdf"');
    expect(new TextDecoder().decode(await document.arrayBuffer())).toBe(pdf);
  });
  it("serves only referenced snapshot objects, rejects key guessing and tenant crossing", async () => {
    const a = await createFixture(), b = await createFixture();
    expect((await media(a, a.unreferencedId)).status).toBe(404);
    expect((await media(a, b.imageId)).status).toBe(404);
    expect((await exports.default.fetch(a.origin + "/media/" + b.publicationId + "/" + b.imageId)).status).toBe(404);
    expect((await exports.default.fetch(a.origin + "/media/" + a.publicationId + "/m6-fixtures%2Fimage.png")).status).toBe(404);
  });
  it("returns metadata for HEAD and honors ETag validators", async () => {
    const f = await createFixture();
    const head = await media(f, f.documentId, { method: "HEAD" });
    expect(head.status).toBe(200); expect(await head.text()).toBe("");
    expect(head.headers.get("content-length")).toBe(String(pdf.length));
    const cached = await media(f, f.documentId, { headers: { "If-None-Match": head.headers.get("etag")! } });
    expect(cached.status).toBe(304); expect(await cached.text()).toBe("");
  });
  it("supports byte ranges, suffix ranges and unsatisfiable ranges", async () => {
    const f = await createFixture();
    const range = await media(f, f.documentId, { headers: { Range: "bytes=0-7" } });
    expect(range.status).toBe(206); expect(range.headers.get("content-range")).toBe("bytes 0-7/" + pdf.length); expect(new TextDecoder().decode(await range.arrayBuffer())).toBe(pdf.slice(0, 8));
    const suffix = await media(f, f.documentId, { headers: { Range: "bytes=-5" } });
    expect(suffix.status).toBe(206); expect(new TextDecoder().decode(await suffix.arrayBuffer())).toBe(pdf.slice(-5));
    const invalid = await media(f, f.documentId, { headers: { Range: "bytes=99999-" } });
    expect(invalid.status).toBe(416); expect(invalid.headers.get("content-range")).toBe("bytes */" + pdf.length);
    expect((await media(f, f.documentId, { headers: { Range: "bytes=0-1,3-4" } })).status).toBe(416);
  });
  it("ignores an old If-Range validator and HEAD ranges", async () => {
    const f = await createFixture();
    const stale = await media(f, f.documentId, { headers: { Range: "bytes=0-1", "If-Range": '"old-version"' } });
    expect(stale.status).toBe(200); expect(new TextDecoder().decode(await stale.arrayBuffer())).toBe(pdf);
    const head = await media(f, f.documentId, { method: "HEAD", headers: { Range: "bytes=0-1" } });
    expect(head.status).toBe(200); expect(head.headers.get("content-length")).toBe(String(pdf.length));
  });
  it("returns a safe 404 when a referenced object is missing", async () => {
    const f = await createFixture();
    await env.ASSETS.delete(f.imageKey);
    const response = await media(f, f.imageId);
    expect(response.status).toBe(404); expect(await response.text()).not.toContain(f.imageKey);
  });
  it("blocks unsupported logo MIME types even when a snapshot references the object", async () => {
    const key = "m6-fixtures/unsupported-logo.svg", id = publicId("ast", 999991);
    await env.ASSETS.put(key, '<svg onload="alert(1)"></svg>', { httpMetadata: { contentType: "image/svg+xml" } });
    const f = await createFixture({ logo_object_key: key, logo_asset_public_id: id });
    expect((await media(f, id)).status).toBe(404);
  });
});

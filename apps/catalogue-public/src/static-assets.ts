// Only the three tenant-independent bundled assets use shared-cache validators.
const versions = new Map<string, Promise<string>>();
export async function staticAsset(request: Request, key: string, body: string, type: string, preview = false): Promise<Response> {
  let version = versions.get(key);
  if (!version) {
    version = crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)).then(bytes =>
      '"' + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("") + '"');
    versions.set(key, version);
  }
  const etag = await version;
  const headers = new Headers({ "Content-Type": type, "Cache-Control": preview ? "no-store" : "public, max-age=0, must-revalidate" });
  if (!preview) {
    headers.set("ETag", etag);
    if (request.headers.get("If-None-Match")?.split(",").some(value => value.trim() === "*" || value.trim().replace(/^W\//, "") === etag))
      return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

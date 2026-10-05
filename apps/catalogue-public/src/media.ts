import type { Media } from "./model";

function rangeRequest(value: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  if (!match[1]) {
    const length = Number(match[2]);
    if (!Number.isSafeInteger(length) || length <= 0) return null;
    return { offset: Math.max(0, size - length), length: Math.min(length, size) };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return null;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}
function safeFilename(label: string | null): string {
  const name = (label?.trim() || "Document").replace(/[\u0000-\u001f\u007f/\\]/g, "-").slice(0, 140);
  return /\.pdf$/i.test(name) ? name : name + ".pdf";
}
export async function serveMedia(request: Request, bucket: R2Bucket, media: Media, preview = false): Promise<Response> {
  const head = await bucket.head(media.object_key);
  if (!head || !head.size) return new Response("File unavailable.", { status: 404 });
  const mime = media.mime_type || head.httpMetadata?.contentType || "";
  if (media.kind === "image" ? !["image/png", "image/jpeg", "image/webp"].includes(mime) : mime !== "application/pdf") {
    return new Response("File unavailable.", { status: 404 });
  }
  const headers = new Headers({
    "Content-Type": mime, "Content-Length": String(head.size), "ETag": head.httpEtag,
    "Last-Modified": head.uploaded.toUTCString(), "Accept-Ranges": "bytes", "Cache-Control": preview ? "no-store" : "private, no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  });
  if (media.kind === "document") {
    const filename = safeFilename(media.label);
    const ascii = filename.replace(/[^\x20-\x7e]/g, "-").replace(/[";]/g, "-");
    headers.set("Content-Disposition", 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase()));
  } else headers.set("Content-Disposition", "inline");
  const noneMatch = request.headers.get("If-None-Match");
  if (!preview && noneMatch?.split(",").some(value => value.trim() === "*" || value.trim().replace(/^W\//, "") === head.httpEtag)) {
    headers.delete("Content-Length"); return new Response(null, { status: 304, headers });
  }
  if (request.method === "HEAD") return new Response(null, { headers });
  const requested = request.headers.get("Range");
  const ifRange = request.headers.get("If-Range");
  const useRange = requested && (!ifRange || ifRange === head.httpEtag || ifRange === head.uploaded.toUTCString());
  const range = useRange ? rangeRequest(requested, head.size) : undefined;
  if (range === null) {
    headers.set("Content-Range", "bytes */" + head.size); headers.delete("Content-Length");
    return new Response(null, { status: 416, headers });
  }
  const object = await bucket.get(media.object_key, range ? { range } : undefined);
  if (!object || !("body" in object)) return new Response("File unavailable.", { status: 404 });
  if (range) {
    headers.set("Content-Length", String(range.length));
    headers.set("Content-Range", "bytes " + range.offset + "-" + (range.offset + range.length - 1) + "/" + head.size);
  }
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

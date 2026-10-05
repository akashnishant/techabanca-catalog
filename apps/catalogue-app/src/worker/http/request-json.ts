import { parseStrictJson } from "@techabanca/domain";
export class RequestBodyError extends Error {
  constructor(readonly status: 400 | 413, message: string) { super(message); }
}
export async function boundedRequestBytes(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared))))
    throw new RequestBodyError(400, "invalid_request_size");
  if (declared !== null && Number(declared) > maxBytes) throw new RequestBodyError(413, "request_too_large");
  if (!request.body) throw new Error("request_body_required");
  const reader = request.body.getReader(), bytes = new Uint8Array(maxBytes);
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      if (part.value.byteLength > maxBytes - size) { await reader.cancel(); throw new RequestBodyError(413, "request_too_large"); }
      bytes.set(part.value, size); size += part.value.byteLength;
    }
  } finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw new Error("request_size_mismatch");
  return bytes.slice(0, size);
}
export async function readRequestJson(request: Request, maxBytes = 65536): Promise<unknown> {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?\s*)?$/i.test(request.headers.get("Content-Type") ?? ""))
    throw new Error("json_content_type_required");
  return parseStrictJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(await boundedRequestBytes(request, maxBytes)));
}

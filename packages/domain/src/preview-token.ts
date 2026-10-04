import { hasPublicIdPrefix } from "./ids";
import { isValidCatalogueSlug } from "./slug";

export const PREVIEW_TTL_SECONDS = 15 * 60;
export type PreviewClaims = { v: 1; publicationId: string; slug: string; expiresAt: number };
const encoder = new TextEncoder();
function bytes(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)); }
function encoded(value: Uint8Array): string { return btoa(String.fromCharCode(...value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
async function key(secret: string): Promise<CryptoKey> {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("preview_signing_unconfigured");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function valid(value: unknown, now: number): value is PreviewClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const claims = value as PreviewClaims;
  return Object.keys(value).sort().join(",") === "expiresAt,publicationId,slug,v"
    && claims.v === 1 && typeof claims.publicationId === "string" && hasPublicIdPrefix(claims.publicationId, "pub")
    && typeof claims.slug === "string" && isValidCatalogueSlug(claims.slug)
    && Number.isSafeInteger(claims.expiresAt) && claims.expiresAt > now && claims.expiresAt <= now + PREVIEW_TTL_SECONDS;
}
export async function signPreview(claims: PreviewClaims, secret: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  if (!valid(claims, now)) throw new Error("invalid_preview_claims");
  const payload = encoded(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload));
  return payload + "." + encoded(new Uint8Array(signature));
}
export async function verifyPreview(token: string, secret: string | undefined, now = Math.floor(Date.now() / 1000)): Promise<PreviewClaims | null> {
  if (!secret || token.length > 700 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const [payload, signature] = token.split(".");
    if (encoded(bytes(payload)) !== payload || encoded(bytes(signature)) !== signature) return null;
    const verified = await crypto.subtle.verify("HMAC", await key(secret), bytes(signature), encoder.encode(payload));
    if (!verified) return null;
    const claims: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes(payload)));
    return valid(claims, now) ? claims : null;
  } catch { return null; }
}

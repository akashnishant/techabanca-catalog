import { hasPublicIdPrefix } from "./ids";
import { isValidCatalogueSlug } from "./slug";
export type EnquiryClaims = { v: 1; purpose: "form" | "receipt"; slug: string; catalogueId: string;
  publicationId: string; itemId: string | null; nonce: string; issuedAt: number; expiresAt: number };
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const decode = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function key(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error("enquiry_signing_unconfigured");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function valid(value: unknown, now: number): value is EnquiryClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as EnquiryClaims;
  return Object.keys(c).sort().join(",") === "catalogueId,expiresAt,issuedAt,itemId,nonce,publicationId,purpose,slug,v"
    && c.v === 1 && (c.purpose === "form" || c.purpose === "receipt")
    && typeof c.slug === "string" && isValidCatalogueSlug(c.slug)
    && typeof c.catalogueId === "string" && hasPublicIdPrefix(c.catalogueId, "cat")
    && typeof c.publicationId === "string" && hasPublicIdPrefix(c.publicationId, "pub")
    && (c.itemId === null || (typeof c.itemId === "string" && hasPublicIdPrefix(c.itemId, "itm")))
    && typeof c.nonce === "string" && /^[a-f0-9]{32}$/.test(c.nonce)
    && Number.isSafeInteger(c.issuedAt) && Number.isSafeInteger(c.expiresAt) && c.issuedAt <= now + 30
    && c.expiresAt > now && c.expiresAt > c.issuedAt && c.expiresAt - c.issuedAt <= (c.purpose === "form" ? 1800 : 300);
}
export async function signEnquiryToken(claims: EnquiryClaims, secret: string, now = Math.floor(Date.now() / 1000)) {
  if (!valid(claims, now)) throw new Error("invalid_enquiry_claims");
  const payload = encode(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode("techabanca-enquiry-v1." + payload));
  return payload + "." + encode(new Uint8Array(signature));
}
export async function verifyEnquiryToken(token: string, secret: string | undefined, now = Math.floor(Date.now() / 1000)): Promise<EnquiryClaims | null> {
  if (!secret || token.length > 1200 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try {
    const [payload, signature] = token.split(".");
    if (encode(decode(payload)) !== payload || encode(decode(signature)) !== signature) return null;
    if (!await crypto.subtle.verify("HMAC", await key(secret), decode(signature), encoder.encode("techabanca-enquiry-v1." + payload))) return null;
    const claims: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(decode(payload)));
    return valid(claims, now) ? claims : null;
  } catch { return null; }
}
export async function enquiryClientHash(address: string, secret: string) {
  const hash = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode("techabanca-enquiry-client-v1." + address));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

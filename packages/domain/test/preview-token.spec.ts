import { describe, expect, it } from "vitest";
import { PREVIEW_TTL_SECONDS, signPreview, verifyPreview, type PreviewClaims } from "../src/preview-token";
const secret = "b".repeat(64), now = 1800000000;
const claims: PreviewClaims = { v: 1, publicationId: "pub_" + "1".repeat(32), slug: "acme-supply", expiresAt: now + PREVIEW_TTL_SECONDS };
describe("signed publication previews", () => {
 it("round-trips a bounded tenant and revision token", async () => {
  const token = await signPreview(claims, secret, now);
  expect(await verifyPreview(token, secret, now)).toEqual(claims);
 });
 it("rejects expired tokens at the exact expiry boundary", async () => {
  const token = await signPreview(claims, secret, now);
  expect(await verifyPreview(token, secret, claims.expiresAt)).toBeNull();
 });
 it("rejects modified payloads and signatures and another signing key", async () => {
  const token = await signPreview(claims, secret, now);
  const [payload, signature] = token.split(".");
  expect(await verifyPreview(payload + "." + (signature[0] === "A" ? "B" : "A") + signature.slice(1), secret, now)).toBeNull();
  expect(await verifyPreview((payload[0] === "A" ? "B" : "A") + payload.slice(1) + "." + signature, secret, now)).toBeNull();
  expect(await verifyPreview(token, "c".repeat(64), now)).toBeNull();
 });
 it("fails closed for missing configuration and malformed tokens", async () => {
  for (const token of ["", "one.two.three", "a".repeat(701), "a.b", "../unsafe"]) expect(await verifyPreview(token, secret, now)).toBeNull();
  expect(await verifyPreview(await signPreview(claims, secret, now), undefined, now)).toBeNull();
  await expect(signPreview(claims, "short", now)).rejects.toThrow("preview_signing_unconfigured");
 });
 it("rejects arbitrary claims and unsupported identifiers or lifetime", async () => {
  for (const value of [{ ...claims, extra: true }, { ...claims, v: 2 }, { ...claims, publicationId: "org_" + "1".repeat(32) },
   { ...claims, slug: "nested.labels" }, { ...claims, expiresAt: now + PREVIEW_TTL_SECONDS + 1 }]) {
   await expect(signPreview(value as PreviewClaims, secret, now)).rejects.toThrow("invalid_preview_claims");
  }
 });

 it("rejects noncanonical base64 encodings with identical decoded signatures",async()=>{
  const token=await signPreview(claims,secret,now),[payload,signature]=token.split(".");
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const index=alphabet.indexOf(signature.at(-1)!);
  const alternate=signature.slice(0,-1)+alphabet[index+1];
  expect(atob(alternate.replace(/-/g,"+").replace(/_/g,"/"))).toBe(atob(signature.replace(/-/g,"+").replace(/_/g,"/")));
  expect(await verifyPreview(payload+"."+alternate,secret,now)).toBeNull();
 });
});

import { describe, expect, it } from "vitest";
import { validateEnquiry, signEnquiryToken, verifyEnquiryToken, enquiryClientHash, type EnquiryClaims } from "../src";
const secret = "b".repeat(64), now = 1791200000;
const claims: EnquiryClaims = { v: 1, purpose: "form", slug: "northstar", catalogueId: "cat_" + "1".repeat(32), publicationId: "pub_" + "2".repeat(32), itemId: null, nonce: "3".repeat(32), issuedAt: now - 10, expiresAt: now + 1700 };
const validInput = { contactName: "  Customer  ", companyName: " Demo ", email: "customer@example.test", phone: "", message: "  Please quote.  ", consent: true };
describe("enquiry validation and signed forms", () => {
 it("trims valid fields and accepts phone-only replies", () => {
  expect(validateEnquiry(validInput)).toEqual({ data: { ...validInput, contactName: "Customer", companyName: "Demo", message: "Please quote." }, errors: {} });
  expect(validateEnquiry({ ...validInput, email: "", phone: "+91 (98765) 43210" }).errors).toEqual({});
 });
 it.each([
  ["contactName", ""], ["contactName", "x".repeat(121)], ["contactName", "a\nb"], ["companyName", "x".repeat(161)],
  ["email", "missing@domain"], ["email", "a\nb@example.test"], ["email", "x".repeat(255)], ["phone", "+12"],
  ["phone", "1234567890123456"], ["phone", "+91letters"], ["message", ""], ["message", "x".repeat(5001)],
  ["message", "invisible\u0000"], ["consent", false],
 ] as const)("rejects invalid %s", (field, value) => {
  expect(validateEnquiry({ ...validInput, [field]: value }).errors[field]).toBeTruthy();
 });
 it("requires a reply channel and keeps harmless message markup as text", () => {
  expect(validateEnquiry({ ...validInput, email: "", phone: "" }).errors.email).toBeTruthy();
  expect(validateEnquiry({ ...validInput, message: "<script>alert(1)</script>\nUnicode: नमस्ते" }).errors).toEqual({});
 });
 it("verifies scoped tokens and rejects tampering, expiry, another key and oversized input", async () => {
  const token = await signEnquiryToken(claims, secret, now);
  expect(await verifyEnquiryToken(token, secret, now)).toEqual(claims);
  for (const bad of [token + "=", token.replace(/.$/, token.endsWith("a") ? "b" : "a"), "x".repeat(1201), "not-a-token"]) expect(await verifyEnquiryToken(bad, secret, now)).toBeNull();
  expect(await verifyEnquiryToken(token, "c".repeat(64), now)).toBeNull();
  expect(await verifyEnquiryToken(token, secret, claims.expiresAt)).toBeNull();
  expect(await verifyEnquiryToken(token, undefined, now)).toBeNull();
 });
 it.each([{ ...claims, expiresAt: now + 2000 }, { ...claims, nonce: "wrong" }, { ...claims, slug: "Invalid Host" },
  { ...claims, itemId: "foreign" }, { ...claims, issuedAt: now + 31 }, { ...claims, purpose: "receipt" as const, expiresAt: now + 400 }])
  ("rejects invalid claims", async c => { await expect(signEnquiryToken(c, secret, now)).rejects.toThrow("invalid_enquiry_claims"); });
 it("signs receipts with a separate purpose and hashes addresses without storing them", async () => {
  const receipt = { ...claims, purpose: "receipt" as const, expiresAt: now + 200 };
  expect((await verifyEnquiryToken(await signEnquiryToken(receipt, secret, now), secret, now))?.purpose).toBe("receipt");
  const hash = await enquiryClientHash("203.0.113.4", secret);
  expect(hash).toMatch(/^[a-f0-9]{64}$/); expect(hash).not.toContain("203.0.113");
  expect(await enquiryClientHash("203.0.113.4", secret)).toBe(hash);
  expect(await enquiryClientHash("203.0.113.5", secret)).not.toBe(hash);
 });
});

import { describe, expect, it } from "vitest";
import { hasSubscriptionAccess, webhookSignatureValid } from "../src/subscription-lifecycle";
const start = "2026-10-01T00:00:00.000Z", end = "2026-10-15T00:00:00.000Z";
describe("bounded subscription access", () => {
  it("requires valid trial dates and closes at the exact end", () => {
    const row = { status: "trialing" as const, trialStartsAt: start, trialEndsAt: end };
    expect(hasSubscriptionAccess(row, new Date(start))).toBe(true); expect(hasSubscriptionAccess(row, new Date(end))).toBe(false);
    expect(hasSubscriptionAccess(row, new Date("2026-09-30"))).toBe(false);
    expect(hasSubscriptionAccess({ status: "trialing" })).toBe(false); expect(hasSubscriptionAccess({ ...row, trialEndsAt: "invalid" })).toBe(false);
  });
  it("requires a bounded paid term and verified paid proof for canceled/past due access", () => {
    const row = { periodStartsAt: start, periodEndsAt: end }, now = new Date(start);
    expect(hasSubscriptionAccess({ ...row, status: "active" }, now)).toBe(true); expect(hasSubscriptionAccess({ status: "active" }, now)).toBe(false);
    for (const status of ["canceled", "past_due"] as const) { expect(hasSubscriptionAccess({ ...row, status }, now)).toBe(false);
      expect(hasSubscriptionAccess({ ...row, status, paidVerified: true }, now)).toBe(true);
      expect(hasSubscriptionAccess({ ...row, status, paidVerified: true }, new Date(end))).toBe(false); }
    expect(hasSubscriptionAccess({ ...row, status: "expired", paidVerified: true }, now)).toBe(false);
  });
  it("verifies exact raw bytes and rejects parsing/reserializing changed whitespace", async () => {
    const bytes = new TextEncoder().encode('{ "event": "subscription.charged" }'), secret = "s".repeat(64);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes)), n => n.toString(16).padStart(2, "0")).join("");
    expect(await webhookSignatureValid(bytes, signature, [secret])).toBe(true);
    expect(await webhookSignatureValid(new TextEncoder().encode('{"event":"subscription.charged"}'), signature, [secret])).toBe(false);
    expect(await webhookSignatureValid(bytes, signature, ["short"])).toBe(false); expect(await webhookSignatureValid(bytes, "invalid", [secret])).toBe(false);
    expect(await webhookSignatureValid(bytes, signature, ["n".repeat(64), secret])).toBe(true);
  });
});

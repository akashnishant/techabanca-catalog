import { describe, expect, it } from "vitest";
import {
  createPublicId,
  hasPublicIdPrefix,
  isPublicId,
  isUtcIsoTimestamp,
  tenantContextFromResolvedMembership,
  toUtcIsoTimestamp,
  utcNow,
} from "../src";

describe("domain primitives", () => {
  it("creates opaque prefixed public IDs", () => {
    const userId = createPublicId("usr");
    const organizationId = createPublicId("org");

    expect(userId).toMatch(/^usr_[0-9a-f]{32}$/);
    expect(organizationId).toMatch(/^org_[0-9a-f]{32}$/);
    expect(userId).not.toBe(createPublicId("usr"));
    expect(isPublicId(userId)).toBe(true);
    expect(hasPublicIdPrefix(userId, "usr")).toBe(true);
    expect(hasPublicIdPrefix(userId, "org")).toBe(false);
  });

  it("rejects malformed public IDs", () => {
    expect(isPublicId("usr_123")).toBe(false);
    expect(isPublicId("unknown_0123456789abcdef0123456789abcdef")).toBe(
      false,
    );
  });

  it("produces canonical UTC timestamps", () => {
    const instant = new Date("2026-09-30T12:34:56.789Z");

    expect(toUtcIsoTimestamp(instant)).toBe("2026-09-30T12:34:56.789Z");
    expect(utcNow(() => instant)).toBe("2026-09-30T12:34:56.789Z");
    expect(isUtcIsoTimestamp("2026-09-30T12:34:56.789Z")).toBe(true);
    expect(isUtcIsoTimestamp("2026-09-30 12:34:56")).toBe(false);
  });

  it("rejects invalid Date values", () => {
    expect(() => toUtcIsoTimestamp(new Date("invalid"))).toThrow(RangeError);
  });

  it("creates immutable resolved tenant contexts", () => {
    const tenant = tenantContextFromResolvedMembership({
      organizationId: 42,
      organizationPublicId: "org_test",
    });

    expect(tenant.organizationId).toBe(42);
    expect(tenant.organizationPublicId).toBe("org_test");
    expect(Object.isFrozen(tenant)).toBe(true);
  });

  it("rejects invalid tenant database IDs", () => {
    expect(() =>
      tenantContextFromResolvedMembership({
        organizationId: 0,
        organizationPublicId: "org_test",
      }),
    ).toThrow(RangeError);
  });
});

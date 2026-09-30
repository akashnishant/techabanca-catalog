import {
  isOrganizationMemberRole,
  isOrganizationMemberStatus,
  isUserStatus,
  normalizeLoginEmail,
} from "../src";
import { describe, expect, it } from "vitest";
import {
  canTransitionEnquiryStatus,
  canTransitionModerationStatus,
  classifyAssetMimeType,
  createPublicId,
  hasPublicIdPrefix,
  isEntitlementValueType,
  isEnquiryStatus,
  isModerationStatus,
  isPublicationState,
  isPublicId,
  isSubscriptionStatus,
  isSystemThemeCode,
  isUtcIsoTimestamp,
  isValidCatalogueSlug,
  isValidItemSlug,
  normalizeCatalogueSlug,
  normalizeItemSlug,
  subscriptionGrantsEntitlements,
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

  it("normalizes catalogue subdomain slugs", () => {
    expect(normalizeCatalogueSlug("  Caf\u00E9 & Office Supplies  ")).toBe(
      "cafe-office-supplies",
    );
    expect(normalizeCatalogueSlug("ACME---INDIA")).toBe("acme-india");
  });

  it("validates canonical catalogue slugs", () => {
    expect(isValidCatalogueSlug("acme-industries")).toBe(true);
    expect(isValidCatalogueSlug("ab")).toBe(false);
    expect(isValidCatalogueSlug("-acme")).toBe(false);
    expect(isValidCatalogueSlug("Acme")).toBe(false);
  });

  it("creates catalogue, category, item, attribute, asset, publication, enquiry, subscription, and moderation public IDs", () => {
    expect(createPublicId("cat")).toMatch(/^cat_[0-9a-f]{32}$/);
    expect(createPublicId("ctg")).toMatch(/^ctg_[0-9a-f]{32}$/);
    expect(createPublicId("itm")).toMatch(/^itm_[0-9a-f]{32}$/);
    expect(createPublicId("atr")).toMatch(/^atr_[0-9a-f]{32}$/);
    expect(createPublicId("ast")).toMatch(/^ast_[0-9a-f]{32}$/);
    expect(createPublicId("pub")).toMatch(/^pub_[0-9a-f]{32}$/);
    expect(createPublicId("enq")).toMatch(/^enq_[0-9a-f]{32}$/);
    expect(createPublicId("sub")).toMatch(/^sub_[0-9a-f]{32}$/);
    expect(createPublicId("mod")).toMatch(/^mod_[0-9a-f]{32}$/);
  });

  it("normalizes and validates item slugs independently", () => {
    expect(normalizeItemSlug("  Heavy Duty Pump / 5HP  ")).toBe(
      "heavy-duty-pump-5hp",
    );
    expect(isValidItemSlug("heavy-duty-pump-5hp")).toBe(true);
    expect(isValidItemSlug("-invalid")).toBe(false);
  });

  it("classifies supported catalogue asset MIME types", () => {
    expect(classifyAssetMimeType("image/jpeg")).toBe("image");
    expect(classifyAssetMimeType(" IMAGE/WEBP ")).toBe("image");
    expect(classifyAssetMimeType("application/pdf")).toBe("document");
    expect(classifyAssetMimeType("image/svg+xml")).toBeNull();
    expect(classifyAssetMimeType("application/x-msdownload")).toBeNull();
  });

  it("recognizes the controlled Professional theme", () => {
    expect(isSystemThemeCode("professional")).toBe(true);
    expect(isSystemThemeCode("custom-html")).toBe(false);
  });

  it("recognizes publication lifecycle states", () => {
    expect(isPublicationState("building")).toBe(true);
    expect(isPublicationState("active")).toBe(true);
    expect(isPublicationState("retired")).toBe(true);
    expect(isPublicationState("draft")).toBe(false);
  });

  it("recognizes enquiry statuses and forward-only transitions", () => {
    expect(isEnquiryStatus("new")).toBe(true);
    expect(isEnquiryStatus("contacted")).toBe(true);
    expect(isEnquiryStatus("closed")).toBe(true);
    expect(isEnquiryStatus("open")).toBe(false);

    expect(canTransitionEnquiryStatus("new", "contacted")).toBe(true);
    expect(canTransitionEnquiryStatus("new", "closed")).toBe(true);
    expect(canTransitionEnquiryStatus("contacted", "closed")).toBe(true);
    expect(canTransitionEnquiryStatus("closed", "contacted")).toBe(false);
  });

  it("recognizes subscription and entitlement primitives", () => {
    expect(isSubscriptionStatus("trialing")).toBe(true);
    expect(isSubscriptionStatus("active")).toBe(true);
    expect(isSubscriptionStatus("past_due")).toBe(true);
    expect(isSubscriptionStatus("paused")).toBe(false);

    expect(isEntitlementValueType("boolean")).toBe(true);
    expect(isEntitlementValueType("integer")).toBe(true);
    expect(isEntitlementValueType("string")).toBe(true);
    expect(isEntitlementValueType("number")).toBe(false);

    expect(subscriptionGrantsEntitlements("trialing")).toBe(true);
    expect(subscriptionGrantsEntitlements("active")).toBe(true);
    expect(subscriptionGrantsEntitlements("past_due")).toBe(false);
    expect(subscriptionGrantsEntitlements("canceled")).toBe(false);
  });

  it("recognizes moderation statuses and forward-only transitions", () => {
    expect(isModerationStatus("open")).toBe(true);
    expect(isModerationStatus("reviewing")).toBe(true);
    expect(isModerationStatus("resolved")).toBe(true);
    expect(isModerationStatus("dismissed")).toBe(true);
    expect(isModerationStatus("pending")).toBe(false);

    expect(canTransitionModerationStatus("open", "reviewing")).toBe(true);
    expect(canTransitionModerationStatus("open", "resolved")).toBe(true);
    expect(canTransitionModerationStatus("reviewing", "dismissed")).toBe(true);
    expect(canTransitionModerationStatus("resolved", "open")).toBe(false);
  });

  it("recognizes authentication and membership primitives", () => {
    expect(isUserStatus("active")).toBe(true);
    expect(isUserStatus("suspended")).toBe(true);
    expect(isUserStatus("deleted")).toBe(false);

    expect(isOrganizationMemberRole("owner")).toBe(true);
    expect(isOrganizationMemberRole("admin")).toBe(true);
    expect(isOrganizationMemberRole("editor")).toBe(true);
    expect(isOrganizationMemberRole("viewer")).toBe(false);

    expect(isOrganizationMemberStatus("active")).toBe(true);
    expect(isOrganizationMemberStatus("invited")).toBe(true);
    expect(isOrganizationMemberStatus("suspended")).toBe(true);
    expect(isOrganizationMemberStatus("removed")).toBe(false);

    expect(normalizeLoginEmail("  Owner@Example.COM ")).toBe(
      "owner@example.com",
    );
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

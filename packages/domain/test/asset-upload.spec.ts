import { describe, expect, it } from "vitest";
import {
  ASSET_UPLOAD_MAX_BYTES,
  buildAssetObjectKey,
  getAssetUploadPolicy,
  isValidAssetUploadSize,
  normalizeAssetFilename,
} from "../src";

describe("asset upload policy", () => {
  it("supports only the controlled image and PDF MIME types", () => {
    expect(getAssetUploadPolicy(" IMAGE/WEBP ")).toEqual({
      mimeType: "image/webp",
      assetKind: "image",
      canonicalExtension: "webp",
      maxBytes: ASSET_UPLOAD_MAX_BYTES.image,
    });

    expect(getAssetUploadPolicy("application/pdf")).toEqual({
      mimeType: "application/pdf",
      assetKind: "document",
      canonicalExtension: "pdf",
      maxBytes: ASSET_UPLOAD_MAX_BYTES.document,
    });

    expect(getAssetUploadPolicy("image/svg+xml")).toBeNull();
    expect(getAssetUploadPolicy("application/msword")).toBeNull();
  });

  it("enforces the M5 product byte limits", () => {
    expect(isValidAssetUploadSize("image", 1)).toBe(true);
    expect(
      isValidAssetUploadSize("image", ASSET_UPLOAD_MAX_BYTES.image),
    ).toBe(true);
    expect(
      isValidAssetUploadSize("image", ASSET_UPLOAD_MAX_BYTES.image + 1),
    ).toBe(false);

    expect(
      isValidAssetUploadSize("document", ASSET_UPLOAD_MAX_BYTES.document),
    ).toBe(true);
    expect(isValidAssetUploadSize("document", 0)).toBe(false);
  });

  it("creates tenant-aware immutable object keys without user filenames", () => {
    expect(
      buildAssetObjectKey({
        organizationPublicId: "org_11111111111111111111111111111111",
        assetPublicId: "ast_22222222222222222222222222222222",
        mimeType: "image/jpeg",
      }),
    ).toBe(
      "org/org_11111111111111111111111111111111/assets/" +
        "ast_22222222222222222222222222222222/original.jpg",
    );
  });

  it("rejects non-canonical public IDs in object keys", () => {
    expect(() =>
      buildAssetObjectKey({
        organizationPublicId: "org_gggggggggggggggggggggggggggggggg",
        assetPublicId: "ast_22222222222222222222222222222222",
        mimeType: "image/webp",
      }),
    ).toThrow("invalid_organization_public_id");

    expect(() =>
      buildAssetObjectKey({
        organizationPublicId: "org_11111111111111111111111111111111",
        assetPublicId: "ast_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
        mimeType: "image/webp",
      }),
    ).toThrow("invalid_asset_public_id");
  });

  it("normalizes safe display filenames but rejects control characters", () => {
    expect(normalizeAssetFilename("  brochure.pdf  ")).toBe("brochure.pdf");
    expect(normalizeAssetFilename("bad\rname.pdf")).toBeNull();
    expect(normalizeAssetFilename("")).toBeNull();
  });
});

import { classifyAssetMimeType, type AssetKind } from "./asset";
import { hasPublicIdPrefix } from "./ids";

export const ASSET_UPLOAD_TTL_SECONDS = 15 * 60;

export const ASSET_UPLOAD_MAX_BYTES: Readonly<Record<AssetKind, number>> = {
  image: 8 * 1024 * 1024,
  document: 20 * 1024 * 1024,
};

export type SupportedAssetMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

export type AssetUploadPolicy = {
  mimeType: SupportedAssetMimeType;
  assetKind: AssetKind;
  canonicalExtension: "jpg" | "png" | "webp" | "pdf";
  maxBytes: number;
};

const POLICIES: Readonly<Record<SupportedAssetMimeType, AssetUploadPolicy>> = {
  "image/jpeg": {
    mimeType: "image/jpeg",
    assetKind: "image",
    canonicalExtension: "jpg",
    maxBytes: ASSET_UPLOAD_MAX_BYTES.image,
  },
  "image/png": {
    mimeType: "image/png",
    assetKind: "image",
    canonicalExtension: "png",
    maxBytes: ASSET_UPLOAD_MAX_BYTES.image,
  },
  "image/webp": {
    mimeType: "image/webp",
    assetKind: "image",
    canonicalExtension: "webp",
    maxBytes: ASSET_UPLOAD_MAX_BYTES.image,
  },
  "application/pdf": {
    mimeType: "application/pdf",
    assetKind: "document",
    canonicalExtension: "pdf",
    maxBytes: ASSET_UPLOAD_MAX_BYTES.document,
  },
};

export function normalizeAssetMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

export function getAssetUploadPolicy(
  mimeType: string,
): AssetUploadPolicy | null {
  const normalized = normalizeAssetMimeType(mimeType);
  const kind = classifyAssetMimeType(normalized);

  if (!kind) {
    return null;
  }

  const policy = POLICIES[normalized as SupportedAssetMimeType];
  if (!policy || policy.assetKind !== kind) {
    return null;
  }

  return policy;
}

export function isValidAssetUploadSize(
  assetKind: AssetKind,
  byteSize: number,
): boolean {
  return (
    Number.isSafeInteger(byteSize) &&
    byteSize > 0 &&
    byteSize <= ASSET_UPLOAD_MAX_BYTES[assetKind]
  );
}

export function normalizeAssetFilename(filename: string): string | null {
  const normalized = filename.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 255 ||
    /[\u0000\r\n]/u.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

export function buildAssetObjectKey(input: {
  organizationPublicId: string;
  assetPublicId: string;
  mimeType: string;
}): string {
  const policy = getAssetUploadPolicy(input.mimeType);

  if (!policy) {
    throw new Error("unsupported_asset_mime_type");
  }

  if (!hasPublicIdPrefix(input.organizationPublicId, "org")) {
    throw new Error("invalid_organization_public_id");
  }

  if (!hasPublicIdPrefix(input.assetPublicId, "ast")) {
    throw new Error("invalid_asset_public_id");
  }

  return [
    "org",
    input.organizationPublicId,
    "assets",
    input.assetPublicId,
    `original.${policy.canonicalExtension}`,
  ].join("/");
}

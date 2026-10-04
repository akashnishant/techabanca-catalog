import {
  getAssetUploadPolicy,
  isValidAssetUploadSize,
} from "@techabanca/domain";

export type AssetVerificationFailureCode =
  | "unsupported_mime_type"
  | "invalid_byte_size"
  | "byte_size_mismatch"
  | "signature_mismatch";

export class AssetVerificationError extends Error {
  constructor(
    readonly code: AssetVerificationFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "AssetVerificationError";
  }
}

function startsWithBytes(
  bytes: Uint8Array,
  expected: readonly number[],
): boolean {
  if (bytes.byteLength < expected.length) {
    return false;
  }

  return expected.every((value, index) => bytes[index] === value);
}

export function hasValidAssetSignature(
  mimeType: string,
  prefixBytes: Uint8Array,
): boolean {
  const policy = getAssetUploadPolicy(mimeType);
  if (!policy) {
    return false;
  }

  switch (policy.mimeType) {
    case "image/jpeg":
      return startsWithBytes(prefixBytes, [0xff, 0xd8, 0xff]);

    case "image/png":
      return startsWithBytes(prefixBytes, [
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]);

    case "image/webp":
      return (
        prefixBytes.byteLength >= 12 &&
        startsWithBytes(prefixBytes, [0x52, 0x49, 0x46, 0x46]) &&
        prefixBytes[8] === 0x57 &&
        prefixBytes[9] === 0x45 &&
        prefixBytes[10] === 0x42 &&
        prefixBytes[11] === 0x50
      );

    case "application/pdf":
      return startsWithBytes(prefixBytes, [
        0x25,
        0x50,
        0x44,
        0x46,
        0x2d,
      ]);
  }
}

export function verifyCompletedAsset(input: {
  mimeType: string;
  expectedByteSize: number;
  actualByteSize: number;
  prefixBytes: Uint8Array;
}): void {
  const policy = getAssetUploadPolicy(input.mimeType);

  if (!policy) {
    throw new AssetVerificationError(
      "unsupported_mime_type",
      "The stored object uses an unsupported MIME type.",
    );
  }

  if (!isValidAssetUploadSize(policy.assetKind, input.actualByteSize)) {
    throw new AssetVerificationError(
      "invalid_byte_size",
      "The stored object size is outside the permitted asset limit.",
    );
  }

  if (input.actualByteSize !== input.expectedByteSize) {
    throw new AssetVerificationError(
      "byte_size_mismatch",
      "The stored object size does not match the declared upload size.",
    );
  }

  if (!hasValidAssetSignature(policy.mimeType, input.prefixBytes)) {
    throw new AssetVerificationError(
      "signature_mismatch",
      "The stored object signature does not match its MIME type.",
    );
  }
}

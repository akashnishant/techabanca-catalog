import type { AssetLifecycleRecord } from "../repositories";

export type AssetUploadAuthorization = {
  organizationPublicId: string;
  sessionPublicId: string;
  asset: AssetLifecycleRecord;
};

export function isAssetSigningSecretConfigured(
  secret: unknown,
): secret is string {
  return typeof secret === "string" && /^[0-9a-f]{64}$/i.test(secret);
}

export function assetBytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function signingKey(secret: string): Promise<CryptoKey> {
  if (!isAssetSigningSecretConfigured(secret)) {
    throw new Error("asset_upload_signing_not_configured");
  }
  return crypto.subtle.importKey(
    "raw", hexToBytes(secret), { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"],
  );
}

function authorizationBytes(input: AssetUploadAuthorization) {
  return new TextEncoder().encode(JSON.stringify([
    "techabanca-asset-upload-v1",
    input.organizationPublicId,
    input.sessionPublicId,
    input.asset.publicId,
    input.asset.version,
    input.asset.uploadExpiresAt,
    input.asset.mimeType,
    input.asset.expectedByteSize,
  ]));
}

export async function signAssetUpload(
  secret: string,
  input: AssetUploadAuthorization,
): Promise<string> {
  return assetBytesToHex(await crypto.subtle.sign(
    "HMAC", await signingKey(secret), authorizationBytes(input),
  ));
}

export async function verifyAssetUploadSignature(
  secret: string,
  signature: string | undefined,
  input: AssetUploadAuthorization,
): Promise<boolean> {
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  return crypto.subtle.verify(
    "HMAC", await signingKey(secret), hexToBytes(signature), authorizationBytes(input),
  );
}

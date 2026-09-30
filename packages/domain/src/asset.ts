export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export type AssetKind = "image" | "document";

export function classifyAssetMimeType(
  mimeType: string,
): AssetKind | null {
  const normalized = mimeType.trim().toLowerCase();

  if ((IMAGE_MIME_TYPES as readonly string[]).includes(normalized)) {
    return "image";
  }

  if ((DOCUMENT_MIME_TYPES as readonly string[]).includes(normalized)) {
    return "document";
  }

  return null;
}

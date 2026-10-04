import {
  hasPublicIdPrefix, MAX_ITEM_DOCUMENTS, MAX_ITEM_IMAGES,
  type ItemMediaInput, type WebsiteMediaInput, type TenantContext,
} from "@techabanca/domain";
import type { ApiErrorStatus } from "../http/api-response";
import { AssetRepository } from "../repositories/asset-repository";
import { MediaRepository } from "../repositories/media-repository";

export class MediaError extends Error {
  constructor(readonly status: ApiErrorStatus, readonly code: string, message: string) { super(message); }
}
function invalid(message = "Provide valid media details.") {
  throw new MediaError(400, "invalid_media", message);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function version(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}
function caption(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid("Media captions are too long or contain invalid characters.");
  return (value as string).trim() || null;
}
export function parseItemMedia(value: unknown): ItemMediaInput {
  if (!object(value) || !version(value.version) || !Array.isArray(value.images) || !Array.isArray(value.documents)
    || value.images.length > MAX_ITEM_IMAGES || value.documents.length > MAX_ITEM_DOCUMENTS) invalid();
  const input = value as Record<string, unknown> & { version: number; images: unknown[]; documents: unknown[] };
  const ids = new Set<string>();
  const assetId = (value: unknown) => {
    if (typeof value !== "string" || !hasPublicIdPrefix(value, "ast") || ids.has(value)) invalid("Choose each verified file only once.");
    ids.add(value as string);
    return value as string;
  };
  const images = input.images.map(image => {
    if (!object(image) || typeof image.isPrimary !== "boolean") invalid();
    const row = image as Record<string, unknown>;
    return { assetId: assetId(row.assetId), altText: caption(row.altText, 300), isPrimary: row.isPrimary as boolean };
  });
  const documents = input.documents.map(document => {
    if (!object(document) || typeof document.isVisible !== "boolean") invalid();
    const row = document as Record<string, unknown>;
    return { assetId: assetId(row.assetId), label: caption(row.label, 160), isVisible: row.isVisible as boolean };
  });
  if (images.length && images.filter(image => image.isPrimary).length !== 1) invalid("Choose exactly one primary image.");
  return { version: input.version, images, documents };
}
export function parseWebsiteMedia(value: unknown): WebsiteMediaInput {
  if (!object(value) || !version(value.version)) invalid();
  const row = value as Record<string, unknown>;
  for (const field of ["logoAssetId", "heroAssetId"]) {
    if (row[field] !== null && (typeof row[field] !== "string" || !hasPublicIdPrefix(row[field] as string, "ast"))) invalid();
  }
  return { version: row.version as number, logoAssetId: row.logoAssetId as string | null, heroAssetId: row.heroAssetId as string | null };
}
export class MediaService {
  private readonly repository: MediaRepository;
  constructor(private readonly db: D1Database) { this.repository = new MediaRepository(db); }
  async getItem(tenant: TenantContext, id: string) {
    if (!hasPublicIdPrefix(id, "itm")) throw new MediaError(400, "invalid_item_id", "A valid item ID is required.");
    const media = await this.repository.getItem(tenant, id);
    if (!media) throw new MediaError(404, "item_not_found", "Item was not found.");
    return media;
  }
  private async asset(tenant: TenantContext, id: string, kind: "image" | "document") {
    const asset = await new AssetRepository(this.db).findReadyByPublicId(tenant, id);
    if (!asset || asset.assetKind !== kind) throw new MediaError(400, "invalid_media_asset", "Choose a verified file of the correct type from this business.");
    return asset;
  }
  async replaceItem(tenant: TenantContext, id: string, input: ItemMediaInput) {
    await this.getItem(tenant, id);
    const item = await this.repository.item(tenant, id);
    if (!item) throw new MediaError(404, "item_not_found", "Item was not found.");
    if (item.media_version !== input.version) throw new MediaError(409, "media_version_conflict", "Media changed in another session. Reload media before saving.");
    const [images, documents] = await Promise.all([
      Promise.all(input.images.map(async image => ({ ...image, assetId: (await this.asset(tenant, image.assetId, "image")).id }))),
      Promise.all(input.documents.map(async document => ({ ...document, assetId: (await this.asset(tenant, document.assetId, "document")).id }))),
    ]);
    if (!await this.repository.replaceItem(tenant, item.id, input.version, images, documents)) {
      throw new MediaError(409, "media_version_conflict", "Media changed in another session. Reload media before saving.");
    }
    return this.getItem(tenant, id);
  }
  async getWebsite(tenant: TenantContext) {
    const media = await this.repository.getWebsite(tenant);
    if (!media) throw new MediaError(400, "website_settings_required", "Complete catalogue setup before choosing website images.");
    return media;
  }
  async replaceWebsite(tenant: TenantContext, input: WebsiteMediaInput) {
    await this.getWebsite(tenant);
    const [logo, hero] = await Promise.all([
      input.logoAssetId ? this.asset(tenant, input.logoAssetId, "image") : null,
      input.heroAssetId ? this.asset(tenant, input.heroAssetId, "image") : null,
    ]);
    if (!await this.repository.replaceWebsite(tenant, input.version, logo?.id ?? null, hero?.id ?? null)) {
      throw new MediaError(409, "website_version_conflict", "Website settings changed in another session. Reload before saving.");
    }
    return this.getWebsite(tenant);
  }
}

import type { AssetKind } from "./asset";

export const MAX_ITEM_IMAGES = 12;
export const MAX_ITEM_DOCUMENTS = 8;

export type ReadyAssetSummary = {
  id: string;
  assetKind: AssetKind;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  version: number;
};
export type ItemImageInput = { assetId: string; altText: string | null; isPrimary: boolean };
export type ItemDocumentInput = { assetId: string; label: string | null; isVisible: boolean };
export type ItemImage = ItemImageInput & { asset: ReadyAssetSummary; sortOrder: number };
export type ItemDocument = ItemDocumentInput & { asset: ReadyAssetSummary; sortOrder: number };
export type ItemMediaInput = { version: number; images: ItemImageInput[]; documents: ItemDocumentInput[] };
export type ItemMedia = { itemId: string; version: number; images: ItemImage[]; documents: ItemDocument[] };
export type WebsiteMedia = {
  catalogueId: string;
  version: number;
  logo: ReadyAssetSummary | null;
  hero: ReadyAssetSummary | null;
};
export type WebsiteMediaInput = { version: number; logoAssetId: string | null; heroAssetId: string | null };

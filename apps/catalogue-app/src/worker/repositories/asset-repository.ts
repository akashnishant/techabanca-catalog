import type { AssetKind, TenantContext } from "@techabanca/domain";

export type AssetRecord = {
  id: number;
  publicId: string;
  organizationId: number;
  assetKind: AssetKind;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string | null;
  etag: string | null;
  widthPx: number | null;
  heightPx: number | null;
  readyAt: string;
};

type AssetRow = {
  id: number;
  public_id: string;
  organization_id: number;
  asset_kind: AssetKind;
  object_key: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  checksum_sha256: string | null;
  etag: string | null;
  width_px: number | null;
  height_px: number | null;
  ready_at: string;
};

export class AssetRepository {
  constructor(private readonly db: D1Database) {}

  async findReadyByPublicId(
    tenant: TenantContext,
    assetPublicId: string,
  ): Promise<AssetRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           id,
           public_id,
           organization_id,
           asset_kind,
           object_key,
           original_filename,
           mime_type,
           byte_size,
           checksum_sha256,
           etag,
           width_px,
           height_px,
           ready_at
         FROM assets
         WHERE organization_id = ?
           AND public_id = ?
           AND status = 'ready'
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tenant.organizationId, assetPublicId)
      .first<AssetRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      publicId: row.public_id,
      organizationId: row.organization_id,
      assetKind: row.asset_kind,
      objectKey: row.object_key,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      checksumSha256: row.checksum_sha256,
      etag: row.etag,
      widthPx: row.width_px,
      heightPx: row.height_px,
      readyAt: row.ready_at,
    };
  }
}

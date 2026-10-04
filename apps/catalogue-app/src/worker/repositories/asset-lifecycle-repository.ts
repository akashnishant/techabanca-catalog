import type { AssetKind, TenantContext } from "@techabanca/domain";

export type AssetLifecycleStatus = "pending" | "ready" | "failed" | "deleted";

export type AssetLifecycleRecord = {
  id: number;
  publicId: string;
  organizationId: number;
  assetKind: AssetKind;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  expectedByteSize: number | null;
  byteSize: number | null;
  checksumSha256: string | null;
  etag: string | null;
  widthPx: number | null;
  heightPx: number | null;
  status: AssetLifecycleStatus;
  uploadExpiresAt: string | null;
  failureCode: string | null;
  verifiedAt: string | null;
  readyAt: string | null;
  deletedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type AssetLifecycleRow = {
  id: number;
  public_id: string;
  organization_id: number;
  asset_kind: AssetKind;
  object_key: string;
  original_filename: string;
  mime_type: string;
  expected_byte_size: number | null;
  byte_size: number | null;
  checksum_sha256: string | null;
  etag: string | null;
  width_px: number | null;
  height_px: number | null;
  status: AssetLifecycleStatus;
  upload_expires_at: string | null;
  failure_code: string | null;
  verified_at: string | null;
  ready_at: string | null;
  deleted_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

function mapAssetLifecycleRow(row: AssetLifecycleRow): AssetLifecycleRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    organizationId: row.organization_id,
    assetKind: row.asset_kind,
    objectKey: row.object_key,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    expectedByteSize: row.expected_byte_size,
    byteSize: row.byte_size,
    checksumSha256: row.checksum_sha256,
    etag: row.etag,
    widthPx: row.width_px,
    heightPx: row.height_px,
    status: row.status,
    uploadExpiresAt: row.upload_expires_at,
    failureCode: row.failure_code,
    verifiedAt: row.verified_at,
    readyAt: row.ready_at,
    deletedAt: row.deleted_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const assetColumns = `
  id,
  public_id,
  organization_id,
  asset_kind,
  object_key,
  original_filename,
  mime_type,
  expected_byte_size,
  byte_size,
  checksum_sha256,
  etag,
  width_px,
  height_px,
  status,
  upload_expires_at,
  failure_code,
  verified_at,
  ready_at,
  deleted_at,
  version,
  created_at,
  updated_at
`;

export class AssetLifecycleRepository {
  constructor(private readonly db: D1Database) {}

  async findByPublicId(
    tenant: TenantContext,
    assetPublicId: string,
  ): Promise<AssetLifecycleRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${assetColumns}
         FROM assets
         WHERE organization_id = ?
           AND public_id = ?
         LIMIT 1`,
      )
      .bind(tenant.organizationId, assetPublicId)
      .first<AssetLifecycleRow>();

    return row ? mapAssetLifecycleRow(row) : null;
  }

  async createPending(
    tenant: TenantContext,
    input: {
      publicId: string;
      assetKind: AssetKind;
      objectKey: string;
      originalFilename: string;
      mimeType: string;
      expectedByteSize: number;
      uploadExpiresAt: string;
      createdByUserId: number | null;
      now: string;
    },
  ): Promise<AssetLifecycleRecord> {
    await this.db
      .prepare(
        `INSERT INTO assets (
           public_id,
           organization_id,
           asset_kind,
           object_key,
           original_filename,
           mime_type,
           expected_byte_size,
           status,
           created_by_user_id,
           created_at,
           updated_at,
           upload_expires_at,
           version
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, 1)`,
      )
      .bind(
        input.publicId,
        tenant.organizationId,
        input.assetKind,
        input.objectKey,
        input.originalFilename,
        input.mimeType,
        input.expectedByteSize,
        input.createdByUserId,
        input.now,
        input.now,
        input.uploadExpiresAt,
      )
      .run();

    const created = await this.findByPublicId(tenant, input.publicId);
    if (!created) {
      throw new Error("asset_pending_insert_not_found");
    }

    return created;
  }

  async markReady(
    tenant: TenantContext,
    input: {
      assetPublicId: string;
      expectedVersion: number;
      byteSize: number;
      checksumSha256: string | null;
      etag: string | null;
      widthPx: number | null;
      heightPx: number | null;
      verifiedAt: string;
      now: string;
    },
  ): Promise<AssetLifecycleRecord | null> {
    const result = await this.db
      .prepare(
        `UPDATE assets
         SET
           byte_size = ?,
           checksum_sha256 = ?,
           etag = ?,
           width_px = ?,
           height_px = ?,
           status = 'ready',
           failure_code = NULL,
           verified_at = ?,
           ready_at = ?,
           updated_at = ?,
           version = version + 1
         WHERE organization_id = ?
           AND public_id = ?
           AND status = 'pending'
           AND deleted_at IS NULL
           AND version = ?`,
      )
      .bind(
        input.byteSize,
        input.checksumSha256,
        input.etag,
        input.widthPx,
        input.heightPx,
        input.verifiedAt,
        input.verifiedAt,
        input.now,
        tenant.organizationId,
        input.assetPublicId,
        input.expectedVersion,
      )
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return null;
    }

    return this.findByPublicId(tenant, input.assetPublicId);
  }

  async markFailed(
    tenant: TenantContext,
    input: {
      assetPublicId: string;
      expectedVersion: number;
      failureCode: string;
      now: string;
    },
  ): Promise<AssetLifecycleRecord | null> {
    const result = await this.db
      .prepare(
        `UPDATE assets
         SET
           status = 'failed',
           failure_code = ?,
           updated_at = ?,
           version = version + 1
         WHERE organization_id = ?
           AND public_id = ?
           AND status = 'pending'
           AND deleted_at IS NULL
           AND version = ?`,
      )
      .bind(
        input.failureCode,
        input.now,
        tenant.organizationId,
        input.assetPublicId,
        input.expectedVersion,
      )
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return null;
    }

    return this.findByPublicId(tenant, input.assetPublicId);
  }

  async markDeleted(
    tenant: TenantContext,
    input: {
      assetPublicId: string;
      expectedVersion: number;
      now: string;
    },
  ): Promise<AssetLifecycleRecord | null> {
    const result = await this.db
      .prepare(
        `UPDATE assets
         SET
           status = 'deleted',
           deleted_at = ?,
           updated_at = ?,
           version = version + 1
         WHERE organization_id = ?
           AND public_id = ?
           AND status IN ('pending', 'ready', 'failed')
           AND deleted_at IS NULL
           AND version = ?`,
      )
      .bind(
        input.now,
        input.now,
        tenant.organizationId,
        input.assetPublicId,
        input.expectedVersion,
      )
      .run();

    if ((result.meta.changes ?? 0) === 0) {
      return null;
    }

    return this.findByPublicId(tenant, input.assetPublicId);
  }
}

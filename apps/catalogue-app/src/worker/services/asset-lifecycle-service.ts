import {
  ASSET_UPLOAD_TTL_SECONDS,
  buildAssetObjectKey,
  createPublicId,
  getAssetUploadPolicy,
  isValidAssetUploadSize,
  normalizeAssetFilename,
  type TenantContext,
} from "@techabanca/domain";
import {
  AssetLifecycleRepository,
  type AssetLifecycleRecord,
} from "../repositories";
import {
  AssetVerificationError,
  verifyCompletedAsset,
} from "./asset-validation";

export type AssetLifecycleErrorCode =
  | "invalid_filename"
  | "unsupported_mime_type"
  | "invalid_byte_size"
  | "asset_not_found"
  | "asset_not_pending"
  | "upload_expired"
  | "asset_version_conflict"
  | "byte_size_mismatch"
  | "signature_mismatch";

export class AssetLifecycleError extends Error {
  constructor(
    readonly code: AssetLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AssetLifecycleError";
  }
}

function addSeconds(isoTimestamp: string, seconds: number): string {
  const milliseconds = Date.parse(isoTimestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new Error("invalid_asset_timestamp");
  }

  return new Date(milliseconds + seconds * 1000).toISOString();
}

export class AssetLifecycleService {
  private readonly repository: AssetLifecycleRepository;

  constructor(db: D1Database) {
    this.repository = new AssetLifecycleRepository(db);
  }

  async createPendingUpload(
    tenant: TenantContext,
    input: {
      originalFilename: string;
      mimeType: string;
      expectedByteSize: number;
      createdByUserId?: number | null;
      now: string;
      publicId?: string;
    },
  ): Promise<AssetLifecycleRecord> {
    const originalFilename = normalizeAssetFilename(input.originalFilename);
    if (!originalFilename) {
      throw new AssetLifecycleError(
        "invalid_filename",
        "Asset filename is invalid.",
      );
    }

    const policy = getAssetUploadPolicy(input.mimeType);
    if (!policy) {
      throw new AssetLifecycleError(
        "unsupported_mime_type",
        "Asset MIME type is not supported.",
      );
    }

    if (!isValidAssetUploadSize(policy.assetKind, input.expectedByteSize)) {
      throw new AssetLifecycleError(
        "invalid_byte_size",
        "Asset size is outside the permitted limit.",
      );
    }

    const publicId = input.publicId ?? createPublicId("ast");
    const objectKey = buildAssetObjectKey({
      organizationPublicId: tenant.organizationPublicId,
      assetPublicId: publicId,
      mimeType: policy.mimeType,
    });

    return this.repository.createPending(tenant, {
      publicId,
      assetKind: policy.assetKind,
      objectKey,
      originalFilename,
      mimeType: policy.mimeType,
      expectedByteSize: input.expectedByteSize,
      uploadExpiresAt: addSeconds(input.now, ASSET_UPLOAD_TTL_SECONDS),
      createdByUserId: input.createdByUserId ?? null,
      now: input.now,
    });
  }

  async completeVerifiedUpload(
    tenant: TenantContext,
    input: {
      assetPublicId: string;
      expectedVersion: number;
      actualByteSize: number;
      prefixBytes: Uint8Array;
      checksumSha256?: string | null;
      etag?: string | null;
      widthPx?: number | null;
      heightPx?: number | null;
      verifiedAt: string;
    },
  ): Promise<AssetLifecycleRecord> {
    const asset = await this.repository.findByPublicId(
      tenant,
      input.assetPublicId,
    );

    if (!asset) {
      throw new AssetLifecycleError(
        "asset_not_found",
        "Asset does not exist in the selected tenant.",
      );
    }

    if (asset.status !== "pending" || asset.deletedAt) {
      throw new AssetLifecycleError(
        "asset_not_pending",
        "Asset is no longer awaiting upload completion.",
      );
    }

    if (asset.version !== input.expectedVersion) {
      throw new AssetLifecycleError(
        "asset_version_conflict",
        "Asset was changed by another request.",
      );
    }

    if (
      !asset.uploadExpiresAt ||
      Date.parse(input.verifiedAt) >= Date.parse(asset.uploadExpiresAt)
    ) {
      const failed = await this.repository.markFailed(tenant, {
        assetPublicId: asset.publicId,
        expectedVersion: asset.version,
        failureCode: "upload_expired",
        now: input.verifiedAt,
      });

      if (!failed) {
        throw new AssetLifecycleError(
          "asset_version_conflict",
          "Asset changed while expiring the upload.",
        );
      }

      throw new AssetLifecycleError(
        "upload_expired",
        "The upload intent has expired.",
      );
    }

    if (asset.expectedByteSize === null) {
      throw new AssetLifecycleError(
        "invalid_byte_size",
        "Pending asset has no declared upload size.",
      );
    }

    try {
      verifyCompletedAsset({
        mimeType: asset.mimeType,
        expectedByteSize: asset.expectedByteSize,
        actualByteSize: input.actualByteSize,
        prefixBytes: input.prefixBytes,
      });
    } catch (error) {
      if (!(error instanceof AssetVerificationError)) {
        throw error;
      }

      const failed = await this.repository.markFailed(tenant, {
        assetPublicId: asset.publicId,
        expectedVersion: asset.version,
        failureCode: error.code,
        now: input.verifiedAt,
      });

      if (!failed) {
        throw new AssetLifecycleError(
          "asset_version_conflict",
          "Asset changed while recording verification failure.",
        );
      }

      throw new AssetLifecycleError(error.code, error.message);
    }

    const ready = await this.repository.markReady(tenant, {
      assetPublicId: asset.publicId,
      expectedVersion: asset.version,
      byteSize: input.actualByteSize,
      checksumSha256: input.checksumSha256 ?? null,
      etag: input.etag ?? null,
      widthPx: input.widthPx ?? null,
      heightPx: input.heightPx ?? null,
      verifiedAt: input.verifiedAt,
      now: input.verifiedAt,
    });

    if (!ready) {
      throw new AssetLifecycleError(
        "asset_version_conflict",
        "Asset changed while completing the upload.",
      );
    }

    return ready;
  }
}

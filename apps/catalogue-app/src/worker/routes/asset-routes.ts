import { hasPublicIdPrefix, getAssetUploadPolicy, isValidAssetUploadSize } from "@techabanca/domain";
import { Hono, type Context } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { apiError, ensureApiRequestId, type ApiErrorStatus } from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { AssetLifecycleRepository, type AssetLifecycleRecord } from "../repositories";
import { AssetLifecycleError, AssetLifecycleService } from "../services/asset-lifecycle-service";
import {
  assetBytesToHex, isAssetSigningSecretConfigured, signAssetUpload, verifyAssetUploadSignature,
} from "../services/asset-upload-authorization";

type AssetContext = Context<CatalogueAppEnv>;

class AssetHttpError extends Error {
  constructor(readonly status: ApiErrorStatus, readonly code: string, message: string) {
    super(message);
  }
}

function assetPayload(asset: AssetLifecycleRecord) {
  return {
    id: asset.publicId,
    assetKind: asset.assetKind,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    expectedByteSize: asset.expectedByteSize,
    byteSize: asset.byteSize,
    checksumSha256: asset.checksumSha256,
    status: asset.status,
    failureCode: asset.failureCode,
    uploadExpiresAt: asset.uploadExpiresAt,
    readyAt: asset.readyAt,
    version: asset.version,
  };
}

function requireMutationAccess(c: AssetContext) {
  const role = c.get("tenantAccess").role;
  if (role !== "owner" && role !== "admin") {
    throw new AssetHttpError(403, "insufficient_permissions", "Owner or admin access is required.");
  }
}

function requireSigningSecret(c: AssetContext): string {
  const secret = c.env.ASSET_UPLOAD_SIGNING_SECRET;
  if (!isAssetSigningSecretConfigured(secret)) {
    throw new AssetHttpError(503, "asset_upload_unavailable", "Asset uploads are not configured.");
  }
  return secret;
}

function parseVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new AssetHttpError(400, "invalid_asset_version", "A valid asset version is required.");
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readRequestBytes(
  request: Request, maxBytes: number, exactBytes?: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const lengthHeader = request.headers.get("Content-Length");
  if (lengthHeader !== null) {
    if (!/^[0-9]+$/.test(lengthHeader) || !Number.isSafeInteger(Number(lengthHeader))) {
      throw new AssetHttpError(400, "invalid_request", "A valid content length is required.");
    }
    const length = Number(lengthHeader);
    if (length > maxBytes) {
      throw new AssetHttpError(413, "upload_body_too_large", "The upload exceeds the permitted byte limit.");
    }
    if (exactBytes !== undefined && length !== exactBytes) {
      throw new AssetHttpError(400, "byte_size_mismatch", "The upload size differs from the declared size.");
    }
  }
  if (!request.body) throw new AssetHttpError(400, "invalid_request", "A request body is required.");
  const bytes = new Uint8Array(maxBytes);
  const reader = request.body.getReader();
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (chunk.value.byteLength > maxBytes - length) {
        await reader.cancel();
        throw new AssetHttpError(413, "upload_body_too_large", "The upload exceeds the permitted byte limit.");
      }
      bytes.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (exactBytes !== undefined && length !== exactBytes) {
    throw new AssetHttpError(400, "byte_size_mismatch", "The upload size differs from the declared size.");
  }
  return bytes.subarray(0, length);
}

async function readJson(c: AssetContext): Promise<Record<string, unknown>> {
  const bytes = await readRequestBytes(c.req.raw, 8192);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new AssetHttpError(400, "invalid_request", "A valid JSON request body is required.");
  }
  if (!isObject(value)) throw new AssetHttpError(400, "invalid_request", "A JSON object is required.");
  return value;
}

async function findAsset(c: AssetContext): Promise<AssetLifecycleRecord> {
  const id = c.req.param("assetId") ?? "";
  if (!hasPublicIdPrefix(id, "ast")) {
    throw new AssetHttpError(400, "invalid_asset_id", "A valid asset ID is required.");
  }
  const asset = await new AssetLifecycleRepository(c.env.DB).findByPublicId(c.get("tenantAccess").tenant, id);
  if (!asset || asset.deletedAt || asset.status === "deleted") {
    throw new AssetHttpError(404, "asset_not_found", "Asset was not found.");
  }
  return asset;
}

async function pendingAsset(c: AssetContext, version: number) {
  const asset = await findAsset(c);
  if (asset.status !== "pending") {
    throw new AssetHttpError(409, "asset_not_pending", "Asset is no longer awaiting upload completion.");
  }
  if (asset.version !== version) {
    throw new AssetHttpError(409, "asset_version_conflict", "Asset changed since it was loaded.");
  }
  const now = new Date();
  const expiry = Date.parse(asset.uploadExpiresAt ?? "");
  if (!Number.isFinite(expiry) || now.getTime() >= expiry) {
    const failed = await new AssetLifecycleRepository(c.env.DB).markFailed(
      c.get("tenantAccess").tenant,
      { assetPublicId: asset.publicId, expectedVersion: version, failureCode: "upload_expired", now: now.toISOString() },
    );
    if (!failed) throw new AssetHttpError(409, "asset_version_conflict", "Asset changed while expiring the upload.");
    throw new AssetHttpError(410, "upload_expired", "The upload intent has expired.");
  }
  const policy = getAssetUploadPolicy(asset.mimeType);
  if (!policy || asset.expectedByteSize === null
    || !isValidAssetUploadSize(policy.assetKind, asset.expectedByteSize)) {
    throw new AssetHttpError(400, "invalid_asset", "The upload intent is invalid.");
  }
  return asset;
}

function assetError(c: AssetContext, error: unknown) {
  if (error instanceof AssetHttpError) return apiError(c, error.status, error.code, error.message);
  if (error instanceof AssetLifecycleError) {
    let status: ApiErrorStatus = 400;
    if (error.code === "asset_not_found") status = 404;
    if (error.code === "asset_not_pending" || error.code === "asset_version_conflict") status = 409;
    if (error.code === "upload_expired") status = 410;
    if (error.code === "unsupported_mime_type") status = 415;
    return apiError(c, status, error.code, error.message);
  }
  if (error instanceof Error && error.message.includes("asset_in_use")) {
    return apiError(c, 409, "asset_in_use", "This file is attached to an item or website. Remove those attachments before deleting the upload.");
  }
  return apiError(c, 500, "internal_error", "The asset operation could not be completed.");
}

function objectMetadataMatches(object: R2Object, asset: AssetLifecycleRecord, organizationId: string) {
  return object.httpMetadata?.contentType === asset.mimeType
    && object.customMetadata?.organizationId === organizationId
    && object.customMetadata?.assetId === asset.publicId
    && object.customMetadata?.uploadVersion === String(asset.version);
}

export function createAssetRoutes() {
  const routes = new Hono<CatalogueAppEnv>();
  routes.use("/assets/*", requireAuthentication, requireTenantAccess);
  routes.use("/assets/*", async (c, next) => {
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");
    await next();
  });

  routes.post("/assets/upload-intents", async (c) => {
    try {
      requireMutationAccess(c);
      const secret = requireSigningSecret(c);
      const input = await readJson(c);
      if (typeof input.originalFilename !== "string"
        || typeof input.mimeType !== "string" || typeof input.expectedByteSize !== "number") {
        throw new AssetHttpError(400, "invalid_request", "Valid filename, MIME type, and byte size are required.");
      }
      const access = c.get("tenantAccess");
      const session = c.get("authSession");
      const asset = await new AssetLifecycleService(c.env.DB).createPendingUpload(
        access.tenant,
        { originalFilename: input.originalFilename, mimeType: input.mimeType,
          expectedByteSize: input.expectedByteSize, createdByUserId: session.userId, now: new Date().toISOString() },
      );
      const signature = await signAssetUpload(secret, {
        asset, organizationPublicId: access.tenant.organizationPublicId, sessionPublicId: session.sessionPublicId,
      });
      const query = new URLSearchParams({ version: String(asset.version), signature });
      ensureApiRequestId(c);
      return c.json({ data: {
        asset: assetPayload(asset),
        upload: { method: "PUT", transport: "worker",
          url: "/api/v1/catalogue/assets/" + asset.publicId + "/content?" + query.toString(),
          headers: { "Content-Type": asset.mimeType }, expiresAt: asset.uploadExpiresAt },
      } }, 201);
    } catch (error) {
      return assetError(c, error);
    }
  });

  routes.get("/assets/:assetId", async (c) => {
    try {
      const asset = await findAsset(c);
      ensureApiRequestId(c);
      return c.json({ data: { asset: assetPayload(asset) } });
    } catch (error) {
      return assetError(c, error);
    }
  });

  routes.delete("/assets/:assetId", async (c) => {
    try {
      requireMutationAccess(c);
      const version = parseVersion((await readJson(c)).version);
      const asset = await findAsset(c);
      const removed = await new AssetLifecycleRepository(c.env.DB).markDeleted(
        c.get("tenantAccess").tenant,
        { assetPublicId: asset.publicId, expectedVersion: version, now: new Date().toISOString() },
      );
      if (!removed) throw new AssetHttpError(409, "asset_version_conflict", "The file changed since it was loaded. Reload uploads and try again.");
      // Metadata removal never deletes R2 bytes; immutable publication references
      // must be accounted for by a later retention/garbage-collection milestone.
      ensureApiRequestId(c);
      return c.body(null, 204);
    } catch (error) { return assetError(c, error); }
  });

  routes.put("/assets/:assetId/content", async (c) => {
    try {
      requireMutationAccess(c);
      const secret = requireSigningSecret(c);
      const query = new URL(c.req.url).searchParams;
      const versionText = query.get("version") ?? "";
      if (query.getAll("version").length !== 1 || !/^[1-9][0-9]*$/.test(versionText)) {
        throw new AssetHttpError(400, "invalid_asset_version", "A valid asset version is required.");
      }
      const version = parseVersion(Number(versionText));
      const asset = await pendingAsset(c, version);
      const access = c.get("tenantAccess");
      if (query.getAll("signature").length !== 1 || !await verifyAssetUploadSignature(
        secret, query.get("signature") ?? undefined,
        { asset, organizationPublicId: access.tenant.organizationPublicId,
          sessionPublicId: c.get("authSession").sessionPublicId },
      )) {
        throw new AssetHttpError(403, "invalid_upload_authorization", "The upload authorization is invalid.");
      }
      if (getAssetUploadPolicy(c.req.header("Content-Type") ?? "")?.mimeType !== asset.mimeType) {
        throw new AssetHttpError(415, "upload_mime_type_mismatch", "The upload MIME type differs from the declared type.");
      }
      const expectedBytes = asset.expectedByteSize!;
      const bytes = await readRequestBytes(c.req.raw, expectedBytes, expectedBytes);
      await pendingAsset(c, version);
      const checksum = await crypto.subtle.digest("SHA-256", bytes);
      const object = await c.env.ASSETS.put(asset.objectKey, bytes, {
        onlyIf: new Headers({ "If-None-Match": "*" }),
        httpMetadata: { contentType: asset.mimeType },
        customMetadata: { organizationId: access.tenant.organizationPublicId,
          assetId: asset.publicId, uploadVersion: String(version) },
        sha256: checksum,
      });
      if (!object) throw new AssetHttpError(409, "upload_already_received", "This upload was already received.");
      ensureApiRequestId(c);
      return c.json({ data: { assetId: asset.publicId, version, uploaded: true } }, 201);
    } catch (error) {
      return assetError(c, error);
    }
  });

  routes.post("/assets/:assetId/complete", async (c) => {
    try {
      requireMutationAccess(c);
      const input = await readJson(c);
      const version = parseVersion(input.version);
      const asset = await pendingAsset(c, version);
      const access = c.get("tenantAccess");
      const object = await c.env.ASSETS.get(asset.objectKey, { range: { offset: 0, length: 16 } });
      if (!object) throw new AssetHttpError(409, "upload_incomplete", "Upload the file before completing the asset.");
      if (!objectMetadataMatches(object, asset, access.tenant.organizationPublicId)) {
        await object.body.cancel();
        const failed = await new AssetLifecycleRepository(c.env.DB).markFailed(
          access.tenant,
          { assetPublicId: asset.publicId, expectedVersion: version,
            failureCode: "object_metadata_mismatch", now: new Date().toISOString() },
        );
        if (!failed) throw new AssetHttpError(409, "asset_version_conflict", "Asset changed while recording verification failure.");
        throw new AssetHttpError(400, "object_metadata_mismatch", "The stored object does not match this upload intent.");
      }
      const ready = await new AssetLifecycleService(c.env.DB).completeVerifiedUpload(
        access.tenant,
        { assetPublicId: asset.publicId, expectedVersion: version,
          actualByteSize: object.size, prefixBytes: new Uint8Array(await object.arrayBuffer()),
          checksumSha256: object.checksums.sha256 ? assetBytesToHex(object.checksums.sha256) : null,
          etag: object.etag, verifiedAt: new Date().toISOString() },
      );
      ensureApiRequestId(c);
      return c.json({ data: { asset: assetPayload(ready) } });
    } catch (error) {
      return assetError(c, error);
    }
  });

  routes.get("/assets/:assetId/content", async (c) => {
    try {
      const asset = await findAsset(c);
      if (asset.status !== "ready") throw new AssetHttpError(409, "asset_not_ready", "The asset is not ready for download.");
      const object = await c.env.ASSETS.get(asset.objectKey);
      if (!object) throw new AssetHttpError(404, "asset_content_not_found", "The asset content was not found.");
      if (object.size !== asset.byteSize || object.etag !== asset.etag
        || object.httpMetadata?.contentType !== asset.mimeType
        || (asset.checksumSha256 !== null && (!object.checksums.sha256
          || assetBytesToHex(object.checksums.sha256) !== asset.checksumSha256))) {
        await object.body.cancel();
        throw new AssetHttpError(409, "asset_content_changed", "The stored asset content no longer matches the verified asset.");
      }
      const safeFilename = new TextDecoder().decode(new TextEncoder().encode(asset.originalFilename));
      const encodedFilename = encodeURIComponent(safeFilename).replace(/['()*]/g, (character) =>
        "%" + character.charCodeAt(0).toString(16).toUpperCase(),
      );
      ensureApiRequestId(c);
      c.header("Content-Type", asset.mimeType);
      c.header("Content-Length", String(object.size));
      c.header("Content-Disposition", "attachment; filename*=UTF-8''" + encodedFilename);
      c.header("X-Content-Type-Options", "nosniff");
      c.header("ETag", object.httpEtag);
      return c.body(object.body);
    } catch (error) {
      return assetError(c, error);
    }
  });
  return routes;
}

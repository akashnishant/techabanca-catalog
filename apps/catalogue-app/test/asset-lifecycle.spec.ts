import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantContextFromResolvedMembership } from "@techabanca/domain";
import { AssetLifecycleRepository } from "../src/worker/repositories";
import { AssetLifecycleService } from "../src/worker/services/asset-lifecycle-service";
import { hasValidAssetSignature } from "../src/worker/services/asset-validation";

const now = "2026-10-04T07:00:00.000Z";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM catalogue_website_settings"),
    env.DB.prepare("DELETE FROM item_images"),
    env.DB.prepare("DELETE FROM item_documents"),
    env.DB.prepare("DELETE FROM item_attribute_values"),
    env.DB.prepare("DELETE FROM catalogue_items"),
    env.DB.prepare("DELETE FROM assets"),
    env.DB.prepare(
      "DELETE FROM attribute_definitions WHERE organization_id IS NOT NULL",
    ),
    env.DB.prepare("DELETE FROM categories"),
    env.DB.prepare("DELETE FROM catalogues"),
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function createOrganization(
  id: number,
  publicId: string,
  name: string,
) {
  await env.DB.prepare(
    `INSERT INTO organizations (
       id,
       public_id,
       name,
       country_code,
       timezone,
       status,
       business_type_id,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      name,
      "IN",
      "Asia/Kolkata",
      "active",
      1,
      now,
      now,
    )
    .run();
}

function webpPrefix(): Uint8Array {
  return Uint8Array.from([
    0x52,
    0x49,
    0x46,
    0x46,
    0x00,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
  ]);
}

describe("M5 asset lifecycle foundation", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("recognizes controlled binary signatures", () => {
    expect(
      hasValidAssetSignature(
        "image/jpeg",
        Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
      ),
    ).toBe(true);

    expect(
      hasValidAssetSignature(
        "image/png",
        Uint8Array.from([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a,
        ]),
      ),
    ).toBe(true);

    expect(hasValidAssetSignature("image/webp", webpPrefix())).toBe(true);

    expect(
      hasValidAssetSignature(
        "application/pdf",
        Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]),
      ),
    ).toBe(true);

    expect(
      hasValidAssetSignature(
        "application/pdf",
        Uint8Array.from([0x4e, 0x4f, 0x50, 0x45]),
      ),
    ).toBe(false);
  });

  it("creates a tenant-scoped pending asset with an immutable object key", async () => {
    await createOrganization(
      50101,
      "org_11111111111111111111111111111111",
      "Lifecycle Tenant A",
    );
    await createOrganization(
      50102,
      "org_22222222222222222222222222222222",
      "Lifecycle Tenant B",
    );

    const tenantA = tenantContextFromResolvedMembership({
      organizationId: 50101,
      organizationPublicId: "org_11111111111111111111111111111111",
    });
    const tenantB = tenantContextFromResolvedMembership({
      organizationId: 50102,
      organizationPublicId: "org_22222222222222222222222222222222",
    });

    const service = new AssetLifecycleService(env.DB);
    const repository = new AssetLifecycleRepository(env.DB);

    const pending = await service.createPendingUpload(tenantA, {
      publicId: "ast_33333333333333333333333333333333",
      originalFilename: " Pump Front.webp ",
      mimeType: " IMAGE/WEBP ",
      expectedByteSize: 1024,
      now,
    });

    expect(pending).toMatchObject({
      publicId: "ast_33333333333333333333333333333333",
      organizationId: 50101,
      assetKind: "image",
      originalFilename: "Pump Front.webp",
      mimeType: "image/webp",
      expectedByteSize: 1024,
      status: "pending",
      version: 1,
      objectKey:
        "org/org_11111111111111111111111111111111/assets/" +
        "ast_33333333333333333333333333333333/original.webp",
    });
    expect(pending.uploadExpiresAt).toBe("2026-10-04T07:15:00.000Z");

    await expect(
      repository.findByPublicId(
        tenantB,
        "ast_33333333333333333333333333333333",
      ),
    ).resolves.toBeNull();
  });

  it("promotes a verified pending object to ready with optimistic versioning", async () => {
    await createOrganization(
      50201,
      "org_44444444444444444444444444444444",
      "Ready Tenant",
    );

    const tenant = tenantContextFromResolvedMembership({
      organizationId: 50201,
      organizationPublicId: "org_44444444444444444444444444444444",
    });

    const service = new AssetLifecycleService(env.DB);
    const pending = await service.createPendingUpload(tenant, {
      publicId: "ast_55555555555555555555555555555555",
      originalFilename: "photo.webp",
      mimeType: "image/webp",
      expectedByteSize: 2048,
      now,
    });

    const ready = await service.completeVerifiedUpload(tenant, {
      assetPublicId: pending.publicId,
      expectedVersion: pending.version,
      actualByteSize: 2048,
      prefixBytes: webpPrefix(),
      checksumSha256:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      etag: "etag-ready-1",
      verifiedAt: "2026-10-04T07:05:00.000Z",
    });

    expect(ready).toMatchObject({
      status: "ready",
      version: 2,
      byteSize: 2048,
      expectedByteSize: 2048,
      failureCode: null,
      verifiedAt: "2026-10-04T07:05:00.000Z",
      readyAt: "2026-10-04T07:05:00.000Z",
      etag: "etag-ready-1",
    });
  });

  it("fails a mismatched binary signature instead of making the asset ready", async () => {
    await createOrganization(
      50301,
      "org_66666666666666666666666666666666",
      "Signature Tenant",
    );

    const tenant = tenantContextFromResolvedMembership({
      organizationId: 50301,
      organizationPublicId: "org_66666666666666666666666666666666",
    });

    const service = new AssetLifecycleService(env.DB);
    const repository = new AssetLifecycleRepository(env.DB);

    const pending = await service.createPendingUpload(tenant, {
      publicId: "ast_77777777777777777777777777777777",
      originalFilename: "brochure.pdf",
      mimeType: "application/pdf",
      expectedByteSize: 4096,
      now,
    });

    await expect(
      service.completeVerifiedUpload(tenant, {
        assetPublicId: pending.publicId,
        expectedVersion: pending.version,
        actualByteSize: 4096,
        prefixBytes: Uint8Array.from([0x4e, 0x4f, 0x50, 0x45]),
        verifiedAt: "2026-10-04T07:02:00.000Z",
      }),
    ).rejects.toMatchObject({
      code: "signature_mismatch",
    });

    await expect(
      repository.findByPublicId(tenant, pending.publicId),
    ).resolves.toMatchObject({
      status: "failed",
      failureCode: "signature_mismatch",
      version: 2,
    });
  });

  it("expires stale pending uploads and makes the terminal failure visible", async () => {
    await createOrganization(
      50401,
      "org_88888888888888888888888888888888",
      "Expiry Tenant",
    );

    const tenant = tenantContextFromResolvedMembership({
      organizationId: 50401,
      organizationPublicId: "org_88888888888888888888888888888888",
    });

    const service = new AssetLifecycleService(env.DB);
    const repository = new AssetLifecycleRepository(env.DB);

    const pending = await service.createPendingUpload(tenant, {
      publicId: "ast_99999999999999999999999999999999",
      originalFilename: "expired.webp",
      mimeType: "image/webp",
      expectedByteSize: 1024,
      now,
    });

    await expect(
      service.completeVerifiedUpload(tenant, {
        assetPublicId: pending.publicId,
        expectedVersion: pending.version,
        actualByteSize: 1024,
        prefixBytes: webpPrefix(),
        verifiedAt: "2026-10-04T07:15:00.000Z",
      }),
    ).rejects.toMatchObject({
      code: "upload_expired",
    });

    await expect(
      repository.findByPublicId(tenant, pending.publicId),
    ).resolves.toMatchObject({
      status: "failed",
      failureCode: "upload_expired",
      version: 2,
    });
  });

  it("enforces database lifecycle transitions for production-style updates", async () => {
    await createOrganization(
      50501,
      "org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Transition Tenant",
    );

    const tenant = tenantContextFromResolvedMembership({
      organizationId: 50501,
      organizationPublicId: "org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const service = new AssetLifecycleService(env.DB);

    const pending = await service.createPendingUpload(tenant, {
      publicId: "ast_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      originalFilename: "transition.webp",
      mimeType: "image/webp",
      expectedByteSize: 1024,
      now,
    });

    await expect(
      env.DB.prepare(
        `UPDATE assets
         SET status = 'ready', ready_at = ?, byte_size = ?
         WHERE public_id = ?`,
      )
        .bind(now, 1024, pending.publicId)
        .run(),
    ).rejects.toThrow();

    await env.DB.prepare(
      `UPDATE assets
       SET status = 'deleted', deleted_at = ?, updated_at = ?
       WHERE public_id = ?`,
    )
      .bind(now, now, pending.publicId)
      .run();

    await expect(
      env.DB.prepare(
        `UPDATE assets
         SET status = 'pending'
         WHERE public_id = ?`,
      )
        .bind(pending.publicId)
        .run(),
    ).rejects.toThrow();
  });
});

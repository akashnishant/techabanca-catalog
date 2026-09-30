import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantContextFromResolvedMembership } from "@techabanca/domain";
import { AssetRepository } from "../src/worker/repositories";

const now = "2026-09-30T13:30:00.000Z";

async function resetFixture() {
  await env.DB.batch([
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

async function createCatalogue(
  id: number,
  publicId: string,
  organizationId: number,
  slug: string,
) {
  await env.DB.prepare(
    `INSERT INTO catalogues (
       id,
       public_id,
       organization_id,
       name,
       slug,
       mode,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      organizationId,
      `Catalogue ${id}`,
      slug,
      "products",
      "draft",
      now,
      now,
    )
    .run();
}

async function createItem(
  id: number,
  publicId: string,
  catalogueId: number,
  slug: string,
) {
  await env.DB.prepare(
    `INSERT INTO catalogue_items (
       id,
       public_id,
       catalogue_id,
       item_type,
       name,
       slug,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      catalogueId,
      "product",
      `Item ${id}`,
      slug,
      "draft",
      now,
      now,
    )
    .run();
}

async function createAsset(input: {
  id: number;
  publicId: string;
  organizationId: number;
  assetKind: "image" | "document";
  objectKey: string;
  filename: string;
  mimeType: string;
  status?: "pending" | "ready";
}) {
  const status = input.status ?? "ready";
  const isReady = status === "ready";

  await env.DB.prepare(
    `INSERT INTO assets (
       id,
       public_id,
       organization_id,
       asset_kind,
       object_key,
       original_filename,
       mime_type,
       byte_size,
       status,
       created_at,
       updated_at,
       ready_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.organizationId,
      input.assetKind,
      input.objectKey,
      input.filename,
      input.mimeType,
      isReady ? 1024 : null,
      status,
      now,
      now,
      isReady ? now : null,
    )
    .run();
}

describe("asset metadata foundation", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("allows ready same-tenant images and enforces one primary image", async () => {
    await createOrganization(
      30101,
      "org_11111111111111111111111111111111",
      "Image Test",
    );
    await createCatalogue(
      30201,
      "cat_22222222222222222222222222222222",
      30101,
      "image-test",
    );
    await createItem(
      30301,
      "itm_33333333333333333333333333333333",
      30201,
      "pump",
    );
    await createAsset({
      id: 30401,
      publicId: "ast_44444444444444444444444444444444",
      organizationId: 30101,
      assetKind: "image",
      objectKey: "org/30101/items/pump/front.webp",
      filename: "front.webp",
      mimeType: "image/webp",
    });
    await createAsset({
      id: 30402,
      publicId: "ast_55555555555555555555555555555555",
      organizationId: 30101,
      assetKind: "image",
      objectKey: "org/30101/items/pump/side.webp",
      filename: "side.webp",
      mimeType: "image/webp",
    });

    await env.DB.prepare(
      `INSERT INTO item_images (
         id,
         item_id,
         asset_id,
         alt_text,
         sort_order,
         is_primary,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(30501, 30301, 30401, "Pump front view", 0, 1, now)
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO item_images (
           id,
           item_id,
           asset_id,
           alt_text,
           sort_order,
           is_primary,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(30502, 30301, 30402, "Pump side view", 1, 1, now)
        .run(),
    ).rejects.toThrow();
  });

  it("rejects pending, wrong-kind, and cross-tenant image assets", async () => {
    await createOrganization(
      30601,
      "org_66666666666666666666666666666666",
      "Asset Tenant A",
    );
    await createOrganization(
      30602,
      "org_77777777777777777777777777777777",
      "Asset Tenant B",
    );
    await createCatalogue(
      30701,
      "cat_88888888888888888888888888888888",
      30601,
      "asset-a",
    );
    await createItem(
      30801,
      "itm_99999999999999999999999999999999",
      30701,
      "asset-item",
    );

    await createAsset({
      id: 30901,
      publicId: "ast_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      organizationId: 30601,
      assetKind: "image",
      objectKey: "org/30601/pending.webp",
      filename: "pending.webp",
      mimeType: "image/webp",
      status: "pending",
    });
    await createAsset({
      id: 30902,
      publicId: "ast_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      organizationId: 30601,
      assetKind: "document",
      objectKey: "org/30601/spec.pdf",
      filename: "spec.pdf",
      mimeType: "application/pdf",
    });
    await createAsset({
      id: 30903,
      publicId: "ast_cccccccccccccccccccccccccccccccc",
      organizationId: 30602,
      assetKind: "image",
      objectKey: "org/30602/foreign.webp",
      filename: "foreign.webp",
      mimeType: "image/webp",
    });

    for (const [id, assetId] of [
      [31001, 30901],
      [31002, 30902],
      [31003, 30903],
    ] as const) {
      await expect(
        env.DB.prepare(
          `INSERT INTO item_images (
             id,
             item_id,
             asset_id,
             sort_order,
             is_primary,
             created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, 30801, assetId, 0, 0, now)
          .run(),
      ).rejects.toThrow();
    }
  });

  it("accepts same-tenant ready documents and rejects images as documents", async () => {
    await createOrganization(
      31101,
      "org_dddddddddddddddddddddddddddddddd",
      "Document Test",
    );
    await createCatalogue(
      31201,
      "cat_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      31101,
      "document-test",
    );
    await createItem(
      31301,
      "itm_ffffffffffffffffffffffffffffffff",
      31201,
      "document-item",
    );
    await createAsset({
      id: 31401,
      publicId: "ast_12121212121212121212121212121212",
      organizationId: 31101,
      assetKind: "document",
      objectKey: "org/31101/spec-sheet.pdf",
      filename: "spec-sheet.pdf",
      mimeType: "application/pdf",
    });
    await createAsset({
      id: 31402,
      publicId: "ast_13131313131313131313131313131313",
      organizationId: 31101,
      assetKind: "image",
      objectKey: "org/31101/photo.webp",
      filename: "photo.webp",
      mimeType: "image/webp",
    });

    await expect(
      env.DB.prepare(
        `INSERT INTO item_documents (
           id,
           item_id,
           asset_id,
           label,
           sort_order,
           is_visible,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(31501, 31301, 31401, "Specification sheet", 0, 1, now)
        .run(),
    ).resolves.toBeDefined();

    await expect(
      env.DB.prepare(
        `INSERT INTO item_documents (
           id,
           item_id,
           asset_id,
           label,
           sort_order,
           is_visible,
           created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(31502, 31301, 31402, "Wrong media type", 1, 1, now)
        .run(),
    ).rejects.toThrow();
  });

  it("keeps ready asset repository reads inside the resolved tenant", async () => {
    await createOrganization(
      31601,
      "org_14141414141414141414141414141414",
      "Repository Tenant A",
    );
    await createOrganization(
      31602,
      "org_15151515151515151515151515151515",
      "Repository Tenant B",
    );

    await createAsset({
      id: 31701,
      publicId: "ast_16161616161616161616161616161616",
      organizationId: 31601,
      assetKind: "image",
      objectKey: "org/31601/ready.webp",
      filename: "ready.webp",
      mimeType: "image/webp",
    });
    await createAsset({
      id: 31702,
      publicId: "ast_17171717171717171717171717171717",
      organizationId: 31601,
      assetKind: "image",
      objectKey: "org/31601/pending.webp",
      filename: "pending.webp",
      mimeType: "image/webp",
      status: "pending",
    });
    await createAsset({
      id: 31703,
      publicId: "ast_18181818181818181818181818181818",
      organizationId: 31602,
      assetKind: "image",
      objectKey: "org/31602/foreign.webp",
      filename: "foreign.webp",
      mimeType: "image/webp",
    });

    const tenantA = tenantContextFromResolvedMembership({
      organizationId: 31601,
      organizationPublicId: "org_14141414141414141414141414141414",
    });

    const repository = new AssetRepository(env.DB);

    await expect(
      repository.findReadyByPublicId(
        tenantA,
        "ast_16161616161616161616161616161616",
      ),
    ).resolves.toMatchObject({
      id: 31701,
      organizationId: 31601,
      assetKind: "image",
      originalFilename: "ready.webp",
      mimeType: "image/webp",
      byteSize: 1024,
    });

    await expect(
      repository.findReadyByPublicId(
        tenantA,
        "ast_17171717171717171717171717171717",
      ),
    ).resolves.toBeNull();

    await expect(
      repository.findReadyByPublicId(
        tenantA,
        "ast_18181818181818181818181818181818",
      ),
    ).resolves.toBeNull();
  });
});

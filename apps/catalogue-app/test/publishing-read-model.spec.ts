import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PublishedCatalogueRepository } from "../src/worker/repositories";

const now = "2026-09-30T14:30:00.000Z";

async function resetInitialFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM public_catalogue_routes"),
    env.DB.prepare("DELETE FROM published_item_documents"),
    env.DB.prepare("DELETE FROM published_item_images"),
    env.DB.prepare("DELETE FROM published_item_attributes"),
    env.DB.prepare("DELETE FROM published_items"),
    env.DB.prepare("DELETE FROM published_categories"),
    env.DB.prepare("DELETE FROM published_catalogues"),
    env.DB.prepare("DELETE FROM catalogue_publications"),
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

async function prepareNextPublicationTest() {
  await env.DB.prepare(
    "DELETE FROM public_catalogue_routes",
  ).run();

  await env.DB.prepare(
    `UPDATE catalogue_publications
     SET state = 'retired',
         retired_at = COALESCE(retired_at, ?)
     WHERE state = 'active'`,
  )
    .bind(now)
    .run();
}

async function createOrganizationAndCatalogue() {
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
      50101,
      "org_11111111111111111111111111111111",
      "Publication Test Org",
      "IN",
      "Asia/Kolkata",
      "active",
      1,
      now,
      now,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO catalogues (
       id,
       public_id,
       organization_id,
       name,
       slug,
       mode,
       status,
       version,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      50201,
      "cat_22222222222222222222222222222222",
      50101,
      "Publication Test Catalogue",
      "publication-test",
      "products",
      "draft",
      1,
      now,
      now,
    )
    .run();
}

async function createDraftItem(
  id: number,
  publicId: string,
  name: string,
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
      50201,
      "product",
      name,
      slug,
      "published",
      now,
      now,
    )
    .run();
}

async function createBuildingPublication(
  id: number,
  publicId: string,
  revisionNumber: number,
) {
  await env.DB.prepare(
    `INSERT INTO catalogue_publications (
       id,
       public_id,
       catalogue_id,
       catalogue_public_id,
       revision_number,
       state,
       source_catalogue_version,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      50201,
      "cat_22222222222222222222222222222222",
      revisionNumber,
      "building",
      1,
      now,
    )
    .run();
}

async function insertPublishedHeader(
  publicationId: number,
  name: string,
  heroTitle: string,
) {
  await env.DB.prepare(
    `INSERT INTO published_catalogues (
       publication_id,
       catalogue_public_id,
       slug,
       name,
       mode,
       theme_code,
       business_name,
       hero_title,
       hero_cta_target,
       published_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      publicationId,
      "cat_22222222222222222222222222222222",
      "publication-test",
      name,
      "products",
      "professional",
      "Publication Test Org",
      heroTitle,
      "catalogue",
      now,
    )
    .run();
}

async function activatePublication(
  publicationId: number,
  slug = "publication-test",
) {
  await env.DB.prepare(
    `UPDATE catalogue_publications
     SET state = 'active',
         activated_at = ?
     WHERE id = ?`,
  )
    .bind(now, publicationId)
    .run();

  await env.DB.prepare(
    `INSERT INTO public_catalogue_routes (
       slug,
       catalogue_public_id,
       publication_id,
       status,
       updated_at
     ) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      slug,
      "cat_22222222222222222222222222222222",
      publicationId,
      "active",
      now,
    )
    .run();
}

describe("published revision read model", () => {
  beforeAll(async () => {
    await resetInitialFixture();
    await createOrganizationAndCatalogue();
  });

  beforeEach(async () => {
    await prepareNextPublicationTest();
  });

  it("creates the revisioned public read-model tables", async () => {
    const result = await env.DB.prepare(
      `SELECT name
       FROM sqlite_schema
       WHERE type = 'table'
         AND name IN (
           'catalogue_publications',
           'published_catalogues',
           'published_categories',
           'published_items',
           'published_item_attributes',
           'published_item_images',
           'published_item_documents',
           'public_catalogue_routes'
         )
       ORDER BY name`,
    ).all<{ name: string }>();

    expect(result.results.map((row) => row.name)).toEqual([
      "catalogue_publications",
      "public_catalogue_routes",
      "published_catalogues",
      "published_categories",
      "published_item_attributes",
      "published_item_documents",
      "published_item_images",
      "published_items",
    ]);
  });

  it("serves the immutable snapshot instead of later draft edits", async () => {
    await createDraftItem(
      50301,
      "itm_33333333333333333333333333333333",
      "Original Pump",
      "original-pump",
    );

    await createBuildingPublication(
      50401,
      "pub_44444444444444444444444444444444",
      1,
    );
    await insertPublishedHeader(
      50401,
      "Publication Test Catalogue",
      "Reliable industrial products",
    );

    await env.DB.prepare(
      `INSERT INTO published_items (
         publication_id,
         item_public_id,
         item_type,
         name,
         slug,
         show_price,
         is_featured,
         sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        50401,
        "itm_33333333333333333333333333333333",
        "product",
        "Original Pump",
        "original-pump",
        0,
        1,
        0,
      )
      .run();

    await activatePublication(50401);

    await env.DB.prepare(
      `UPDATE catalogue_items
       SET name = ?,
           updated_at = ?
       WHERE id = ?`,
    )
      .bind("Unpublished Draft Edit", now, 50301)
      .run();

    await createDraftItem(
      50302,
      "itm_55555555555555555555555555555555",
      "Draft Only Pump",
      "draft-only-pump",
    );

    const repository = new PublishedCatalogueRepository(env.DB);
    const result = await repository.findActiveBySlug("publication-test");

    expect(result).not.toBeNull();
    expect(result?.revisionNumber).toBe(1);
    expect(result?.heroTitle).toBe("Reliable industrial products");
    expect(result?.items.map((item) => item.name)).toEqual([
      "Original Pump",
    ]);
  });

  it("freezes an activated snapshot", async () => {
    await createBuildingPublication(
      50601,
      "pub_66666666666666666666666666666666",
      2,
    );
    await insertPublishedHeader(
      50601,
      "Publication Test Catalogue",
      "Frozen hero",
    );
    await activatePublication(50601);

    await expect(
      env.DB.prepare(
        `UPDATE published_catalogues
         SET hero_title = ?
         WHERE publication_id = ?`,
      )
        .bind("Mutated after activation", 50601)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `DELETE FROM published_catalogues
         WHERE publication_id = ?`,
      )
        .bind(50601)
        .run(),
    ).rejects.toThrow();
  });

  it("switches the public route to a newer revision without exposing draft tables", async () => {
    await createBuildingPublication(
      50701,
      "pub_77777777777777777777777777777777",
      3,
    );
    await insertPublishedHeader(
      50701,
      "Publication Test Catalogue",
      "Revision three",
    );
    await env.DB.prepare(
      `INSERT INTO published_items (
         publication_id,
         item_public_id,
         item_type,
         name,
         slug,
         show_price,
         is_featured,
         sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        50701,
        "itm_88888888888888888888888888888888",
        "product",
        "Revision Three Item",
        "revision-three-item",
        0,
        0,
        0,
      )
      .run();
    await activatePublication(50701);

    await createBuildingPublication(
      50702,
      "pub_99999999999999999999999999999999",
      4,
    );
    await insertPublishedHeader(
      50702,
      "Publication Test Catalogue",
      "Revision four",
    );
    await env.DB.prepare(
      `INSERT INTO published_items (
         publication_id,
         item_public_id,
         item_type,
         name,
         slug,
         show_price,
         is_featured,
         sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        50702,
        "itm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "product",
        "Revision Four Item",
        "revision-four-item",
        0,
        0,
        0,
      )
      .run();

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE catalogue_publications
         SET state = 'retired',
             retired_at = ?
         WHERE id = ?`,
      ).bind(now, 50701),
      env.DB.prepare(
        `UPDATE catalogue_publications
         SET state = 'active',
             activated_at = ?
         WHERE id = ?`,
      ).bind(now, 50702),
      env.DB.prepare(
        `UPDATE public_catalogue_routes
         SET publication_id = ?,
             updated_at = ?
         WHERE slug = ?`,
      ).bind(50702, now, "publication-test"),
    ]);

    const repository = new PublishedCatalogueRepository(env.DB);
    const result = await repository.findActiveBySlug("publication-test");

    expect(result?.revisionNumber).toBe(4);
    expect(result?.heroTitle).toBe("Revision four");
    expect(result?.items.map((item) => item.name)).toEqual([
      "Revision Four Item",
    ]);
  });

  it("rejects inserts into an activated snapshot", async () => {
    await createBuildingPublication(
      50901,
      "pub_cccccccccccccccccccccccccccccccc",
      5,
    );
    await insertPublishedHeader(
      50901,
      "Publication Test Catalogue",
      "Immutable insert hero",
    );

    await env.DB.prepare(
      `INSERT INTO published_items (
         publication_id,
         item_public_id,
         item_type,
         name,
         slug,
         show_price,
         is_featured,
         sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        50901,
        "itm_dddddddddddddddddddddddddddddddd",
        "product",
        "Existing Published Item",
        "existing-published-item",
        0,
        0,
        0,
      )
      .run();

    await activatePublication(50901);

    await expect(
      env.DB.prepare(
        `INSERT INTO published_categories (
           publication_id,
           category_public_id,
           name,
           slug,
           sort_order
         ) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(
          50901,
          "ctg_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          "Late Category",
          "late-category",
          0,
        )
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO published_items (
           publication_id,
           item_public_id,
           item_type,
           name,
           slug,
           show_price,
           is_featured,
           sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          50901,
          "itm_ffffffffffffffffffffffffffffffff",
          "product",
          "Late Item",
          "late-item",
          0,
          0,
          1,
        )
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO published_item_attributes (
           publication_id,
           item_public_id,
           attribute_code,
           label,
           value_text,
           sort_order
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          50901,
          "itm_dddddddddddddddddddddddddddddddd",
          "brand",
          "Brand",
          "Late Brand",
          0,
        )
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO published_item_images (
           publication_id,
           item_public_id,
           asset_public_id,
           object_key,
           mime_type,
           sort_order,
           is_primary
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          50901,
          "itm_dddddddddddddddddddddddddddddddd",
          "ast_10101010101010101010101010101010",
          "published/late-image.webp",
          "image/webp",
          0,
          1,
        )
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO published_item_documents (
           publication_id,
           item_public_id,
           asset_public_id,
           object_key,
           mime_type,
           label,
           sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          50901,
          "itm_dddddddddddddddddddddddddddddddd",
          "ast_11111111111111111111111111111110",
          "published/late-document.pdf",
          "application/pdf",
          "Late document",
          0,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("does not resolve suspended public routes", async () => {
    await createBuildingPublication(
      50801,
      "pub_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      6,
    );
    await insertPublishedHeader(
      50801,
      "Publication Test Catalogue",
      "Suspended hero",
    );
    await activatePublication(50801);

    await env.DB.prepare(
      `UPDATE public_catalogue_routes
       SET status = 'suspended',
           updated_at = ?
       WHERE slug = ?`,
    )
      .bind(now, "publication-test")
      .run();

    const repository = new PublishedCatalogueRepository(env.DB);
    await expect(
      repository.findActiveBySlug("publication-test"),
    ).resolves.toBeNull();
  });
});

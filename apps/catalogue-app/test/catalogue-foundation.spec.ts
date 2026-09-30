import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { CatalogueSlugRepository } from "../src/worker/repositories";

const now = "2026-09-30T12:30:00.000Z";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM categories"),
    env.DB.prepare("DELETE FROM catalogues"),
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function createOrganization(id: number, publicId: string, name: string) {
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
  name: string,
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
      name,
      slug,
      "products",
      "draft",
      now,
      now,
    )
    .run();
}

describe("catalogue foundation schema", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("creates system business types and reserved slugs", async () => {
    const businessTypes = await env.DB.prepare(
      "SELECT code FROM business_types WHERE is_active = 1 ORDER BY sort_order",
    ).all<{ code: string }>();

    expect(businessTypes.results.map((row) => row.code)).toEqual([
      "manufacturer",
      "wholesale-distribution",
      "retailer",
      "industrial",
      "food-restaurant",
      "fashion-apparel",
      "electronics",
      "furniture-home",
      "automotive",
      "beauty-wellness",
      "professional-services",
      "other",
    ]);

    const reserved = await env.DB.prepare(
      "SELECT slug FROM reserved_slugs WHERE slug IN ('billing', 'billing-api', 'catalogue', 'api', 'admin') ORDER BY slug",
    ).all<{ slug: string }>();

    expect(reserved.results.map((row) => row.slug)).toEqual([
      "admin",
      "api",
      "billing",
      "billing-api",
      "catalogue",
    ]);
  });

  it("links organisations to system business types", async () => {
    await createOrganization(
      10101,
      "org_11111111111111111111111111111111",
      "Manufacturer Test",
    );

    const row = await env.DB.prepare(
      `SELECT bt.code
       FROM organizations o
       INNER JOIN business_types bt
         ON bt.id = o.business_type_id
       WHERE o.id = ?`,
    )
      .bind(10101)
      .first<{ code: string }>();

    expect(row?.code).toBe("manufacturer");
  });

  it("blocks reserved catalogue slugs at the database boundary", async () => {
    await createOrganization(
      10201,
      "org_22222222222222222222222222222222",
      "Reserved Slug Test",
    );

    await expect(
      createCatalogue(
        10301,
        "cat_33333333333333333333333333333333",
        10201,
        "Reserved Catalogue",
        "billing",
      ),
    ).rejects.toThrow();
  });

  it("reports normalized slug availability", async () => {
    await createOrganization(
      10401,
      "org_44444444444444444444444444444444",
      "Slug Availability Test",
    );

    await createCatalogue(
      10501,
      "cat_55555555555555555555555555555555",
      10401,
      "Acme Industries",
      "acme-industries",
    );

    const repository = new CatalogueSlugRepository(env.DB);

    await expect(repository.checkAvailability(" Billing ")).resolves.toEqual({
      slug: "billing",
      available: false,
      reason: "reserved",
    });

    await expect(
      repository.checkAvailability("ACME Industries"),
    ).resolves.toEqual({
      slug: "acme-industries",
      available: false,
      reason: "claimed",
    });

    await expect(
      repository.checkAvailability("Fresh Catalogue"),
    ).resolves.toEqual({
      slug: "fresh-catalogue",
      available: true,
      reason: "available",
    });
  });

  it("allows one category nesting level and blocks grandchildren", async () => {
    await createOrganization(
      10601,
      "org_66666666666666666666666666666666",
      "Category Depth Test",
    );

    await createCatalogue(
      10701,
      "cat_77777777777777777777777777777777",
      10601,
      "Category Catalogue",
      "category-catalogue",
    );

    await env.DB.prepare(
      `INSERT INTO categories (
         id,
         public_id,
         catalogue_id,
         parent_id,
         name,
         slug,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        10801,
        "ctg_88888888888888888888888888888888",
        10701,
        null,
        "Machines",
        "machines",
        now,
        now,
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO categories (
         id,
         public_id,
         catalogue_id,
         parent_id,
         name,
         slug,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        10802,
        "ctg_99999999999999999999999999999999",
        10701,
        10801,
        "CNC Machines",
        "cnc-machines",
        now,
        now,
      )
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO categories (
           id,
           public_id,
           catalogue_id,
           parent_id,
           name,
           slug,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          10803,
          "ctg_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          10701,
          10802,
          "Five Axis",
          "five-axis",
          now,
          now,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("prevents a category parent from another catalogue", async () => {
    await createOrganization(
      10901,
      "org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "Cross Catalogue Test",
    );

    await createCatalogue(
      11001,
      "cat_cccccccccccccccccccccccccccccccc",
      10901,
      "Catalogue One",
      "catalogue-one",
    );

    await createCatalogue(
      11002,
      "cat_dddddddddddddddddddddddddddddddd",
      10901,
      "Catalogue Two",
      "catalogue-two",
    );

    await env.DB.prepare(
      `INSERT INTO categories (
         id,
         public_id,
         catalogue_id,
         name,
         slug,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        11101,
        "ctg_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        11001,
        "Catalogue One Root",
        "catalogue-one-root",
        now,
        now,
      )
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO categories (
           id,
           public_id,
           catalogue_id,
           parent_id,
           name,
           slug,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          11102,
          "ctg_ffffffffffffffffffffffffffffffff",
          11002,
          11101,
          "Invalid Child",
          "invalid-child",
          now,
          now,
        )
        .run(),
    ).rejects.toThrow();
  });
});

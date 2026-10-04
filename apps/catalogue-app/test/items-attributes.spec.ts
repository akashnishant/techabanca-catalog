import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantContextFromResolvedMembership } from "@techabanca/domain";
import { CatalogueItemRepository } from "../src/worker/repositories";

const now = "2026-09-30T13:00:00.000Z";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM item_attribute_values"),
    env.DB.prepare("DELETE FROM catalogue_items"),
    env.DB.prepare("DELETE FROM attribute_definitions WHERE organization_id IS NOT NULL"),
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
  businessTypeId = 1,
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
      businessTypeId,
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
  mode: "products" | "services" | "both" = "products",
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
      mode,
      "draft",
      now,
      now,
    )
    .run();
}

async function createItem(input: {
  id: number;
  publicId: string;
  catalogueId: number;
  categoryId?: number | null;
  itemType?: "product" | "service";
  name: string;
  slug: string;
  sku?: string | null;
  priceMinorUnits?: number | null;
  currencyCode?: string | null;
  showPrice?: number;
}) {
  await env.DB.prepare(
    `INSERT INTO catalogue_items (
       id,
       public_id,
       catalogue_id,
       category_id,
       item_type,
       name,
       slug,
       sku,
       price_minor_units,
       currency_code,
       show_price,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.catalogueId,
      input.categoryId ?? null,
      input.itemType ?? "product",
      input.name,
      input.slug,
      input.sku ?? null,
      input.priceMinorUnits ?? null,
      input.currencyCode ?? null,
      input.showPrice ?? 0,
      "draft",
      now,
      now,
    )
    .run();
}

describe("catalogue items and attributes", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("seeds system attributes and business-type presets", async () => {
    const systemAttributes = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM attribute_definitions WHERE organization_id IS NULL",
    ).first<{ count: number }>();

    const mappings = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM business_type_attributes",
    ).first<{ count: number }>();

    expect(systemAttributes?.count).toBe(208);
    expect(mappings?.count).toBe(177);
  });

  it("enforces catalogue product/service mode", async () => {
    await createOrganization(
      20101,
      "org_11111111111111111111111111111111",
      "Mode Test",
    );

    await createCatalogue(
      20201,
      "cat_22222222222222222222222222222222",
      20101,
      "Products Only",
      "products-only",
      "products",
    );

    await expect(
      createItem({
        id: 20301,
        publicId: "itm_33333333333333333333333333333333",
        catalogueId: 20201,
        itemType: "service",
        name: "Installation",
        slug: "installation",
      }),
    ).rejects.toThrow();

    await expect(
      createItem({
        id: 20302,
        publicId: "itm_44444444444444444444444444444444",
        catalogueId: 20201,
        itemType: "product",
        name: "Industrial Pump",
        slug: "industrial-pump",
      }),
    ).resolves.toBeUndefined();
  });

  it("requires an item's category to belong to the same catalogue", async () => {
    await createOrganization(
      20401,
      "org_55555555555555555555555555555555",
      "Category Scope Test",
    );

    await createCatalogue(
      20501,
      "cat_66666666666666666666666666666666",
      20401,
      "Catalogue A",
      "scope-catalogue-a",
    );

    await createCatalogue(
      20502,
      "cat_77777777777777777777777777777777",
      20401,
      "Catalogue B",
      "scope-catalogue-b",
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
        20601,
        "ctg_88888888888888888888888888888888",
        20502,
        "Other Catalogue Category",
        "other-category",
        now,
        now,
      )
      .run();

    await expect(
      createItem({
        id: 20701,
        publicId: "itm_99999999999999999999999999999999",
        catalogueId: 20501,
        categoryId: 20601,
        name: "Wrong Category Item",
        slug: "wrong-category-item",
      }),
    ).rejects.toThrow();
  });

  it("enforces active item slug, SKU, and price consistency", async () => {
    await createOrganization(
      20801,
      "org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "Uniqueness Test",
    );

    await createCatalogue(
      20901,
      "cat_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      20801,
      "Uniqueness Catalogue",
      "uniqueness-catalogue",
    );

    await createItem({
      id: 21001,
      publicId: "itm_cccccccccccccccccccccccccccccccc",
      catalogueId: 20901,
      name: "Pump One",
      slug: "pump-one",
      sku: "PUMP-001",
      priceMinorUnits: 125000,
      currencyCode: "INR",
      showPrice: 1,
    });

    await expect(
      createItem({
        id: 21002,
        publicId: "itm_dddddddddddddddddddddddddddddddd",
        catalogueId: 20901,
        name: "Duplicate Slug",
        slug: "pump-one",
      }),
    ).rejects.toThrow();

    await expect(
      createItem({
        id: 21003,
        publicId: "itm_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        catalogueId: 20901,
        name: "Duplicate SKU",
        slug: "pump-two",
        sku: "pump-001",
      }),
    ).rejects.toThrow();

    await expect(
      createItem({
        id: 21004,
        publicId: "itm_ffffffffffffffffffffffffffffffff",
        catalogueId: 20901,
        name: "Bad Price",
        slug: "bad-price",
        priceMinorUnits: 10000,
        currencyCode: null,
      }),
    ).rejects.toThrow();
  });

  it("allows only system or same-tenant custom attributes", async () => {
    await createOrganization(
      21101,
      "org_12121212121212121212121212121212",
      "Attribute Tenant A",
    );
    await createOrganization(
      21102,
      "org_13131313131313131313131313131313",
      "Attribute Tenant B",
    );

    await createCatalogue(
      21201,
      "cat_14141414141414141414141414141414",
      21101,
      "Tenant A Catalogue",
      "tenant-a-catalogue",
    );
    await createCatalogue(
      21202,
      "cat_15151515151515151515151515151515",
      21102,
      "Tenant B Catalogue",
      "tenant-b-catalogue",
    );

    await createItem({
      id: 21301,
      publicId: "itm_16161616161616161616161616161616",
      catalogueId: 21201,
      name: "Tenant A Item",
      slug: "tenant-a-item",
    });

    await createItem({
      id: 21302,
      publicId: "itm_17171717171717171717171717171717",
      catalogueId: 21202,
      name: "Tenant B Item",
      slug: "tenant-b-item",
    });

    await env.DB.prepare(
      `INSERT INTO attribute_definitions (
         id,
         public_id,
         organization_id,
         code,
         label,
         data_type,
         applies_to,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        21401,
        "atr_18181818181818181818181818181818",
        21101,
        "internal-code",
        "Internal Code",
        "text",
        "product",
        now,
        now,
      )
      .run();

    await expect(
      env.DB.prepare(
        `INSERT INTO item_attribute_values (
           item_id,
           attribute_definition_id,
           value_text,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(21301, 21401, "A-100", now, now)
        .run(),
    ).resolves.toBeDefined();

    await expect(
      env.DB.prepare(
        `INSERT INTO item_attribute_values (
           item_id,
           attribute_definition_id,
           value_text,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(21302, 21401, "SHOULD-FAIL", now, now)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `INSERT INTO item_attribute_values (
           item_id,
           attribute_definition_id,
           value_text,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(21302, 1, "Techabanca Test Brand", now, now)
        .run(),
    ).resolves.toBeDefined();
  });

  it("keeps item repository reads inside the resolved tenant", async () => {
    await createOrganization(
      21501,
      "org_19191919191919191919191919191919",
      "Repository Tenant A",
    );
    await createOrganization(
      21502,
      "org_20202020202020202020202020202020",
      "Repository Tenant B",
    );

    await createCatalogue(
      21601,
      "cat_21212121212121212121212121212121",
      21501,
      "Repository Catalogue A",
      "repository-catalogue-a",
    );
    await createCatalogue(
      21602,
      "cat_22222222222222222222222222222221",
      21502,
      "Repository Catalogue B",
      "repository-catalogue-b",
    );

    await createItem({
      id: 21701,
      publicId: "itm_23232323232323232323232323232323",
      catalogueId: 21601,
      name: "Visible To A",
      slug: "visible-to-a",
      sku: "A-001",
      priceMinorUnits: 50000,
      currencyCode: "INR",
      showPrice: 1,
    });

    await createItem({
      id: 21702,
      publicId: "itm_24242424242424242424242424242424",
      catalogueId: 21602,
      name: "Visible To B",
      slug: "visible-to-b",
    });

    const tenantA = tenantContextFromResolvedMembership({
      organizationId: 21501,
      organizationPublicId: "org_19191919191919191919191919191919",
    });

    const repository = new CatalogueItemRepository(env.DB);

    await expect(
      repository.findByPublicId(
        tenantA,
        "itm_23232323232323232323232323232323",
      ),
    ).resolves.toMatchObject({
      id: 21701,
      name: "Visible To A",
      sku: "A-001",
      priceMinorUnits: 50000,
      currencyCode: "INR",
      showPrice: true,
    });

    await expect(
      repository.findByPublicId(
        tenantA,
        "itm_24242424242424242424242424242424",
      ),
    ).resolves.toBeNull();
  });
});

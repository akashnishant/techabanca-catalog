import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const now = "2026-10-02T08:15:00.000Z";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM item_attribute_values"),
    env.DB.prepare("DELETE FROM catalogue_items"),
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
  mode: "products" | "services" | "both" = "both",
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
      "Authoring Integrity Catalogue",
      slug,
      mode,
      "draft",
      now,
      now,
    )
    .run();
}

async function createCategory(input: {
  id: number;
  publicId: string;
  catalogueId: number;
  parentId?: number | null;
  name: string;
  slug: string;
}) {
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
      input.id,
      input.publicId,
      input.catalogueId,
      input.parentId ?? null,
      input.name,
      input.slug,
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
  currencyCode?: string | null;
  priceMinorUnits?: number | null;
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
       price_minor_units,
       currency_code,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.catalogueId,
      input.categoryId ?? null,
      input.itemType ?? "product",
      input.name,
      input.slug,
      input.priceMinorUnits ?? null,
      input.currencyCode ?? null,
      "draft",
      now,
      now,
    )
    .run();
}

type AttributeDataType = "text" | "number" | "boolean" | "date" | "url";

async function createAttributeDefinition(input: {
  id: number;
  publicId: string;
  organizationId: number;
  code: string;
  label: string;
  dataType: AttributeDataType;
  appliesTo?: "product" | "service" | "both";
}) {
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
      input.id,
      input.publicId,
      input.organizationId,
      input.code,
      input.label,
      input.dataType,
      input.appliesTo ?? "product",
      now,
      now,
    )
    .run();
}

async function insertAttributeValue(input: {
  itemId: number;
  attributeDefinitionId: number;
  valueText: string;
  valueNumber?: number | null;
  valueBoolean?: number | null;
  valueDate?: string | null;
  valueUrl?: string | null;
}) {
  return env.DB.prepare(
    `INSERT INTO item_attribute_values (
       item_id,
       attribute_definition_id,
       value_text,
       value_number,
       value_boolean,
       value_date,
       value_url,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.itemId,
      input.attributeDefinitionId,
      input.valueText,
      input.valueNumber ?? null,
      input.valueBoolean ?? null,
      input.valueDate ?? null,
      input.valueUrl ?? null,
      now,
      now,
    )
    .run();
}

describe("M4 authoring integrity", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("detaches active children and items when a category is soft deleted", async () => {
    await createOrganization(
      30101,
      "org_31313131313131313131313131313131",
      "Category Integrity",
    );
    await createCatalogue(
      30201,
      "cat_32323232323232323232323232323232",
      30101,
      "category-integrity",
    );
    await createCategory({
      id: 30301,
      publicId: "ctg_33333333333333333333333333333331",
      catalogueId: 30201,
      name: "Machines",
      slug: "machines",
    });
    await createCategory({
      id: 30302,
      publicId: "ctg_33333333333333333333333333333332",
      catalogueId: 30201,
      parentId: 30301,
      name: "CNC Machines",
      slug: "cnc-machines",
    });
    await createItem({
      id: 30401,
      publicId: "itm_34343434343434343434343434343434",
      catalogueId: 30201,
      categoryId: 30301,
      name: "Five Axis Mill",
      slug: "five-axis-mill",
    });

    await env.DB.prepare(
      `UPDATE categories
       SET deleted_at = ?,
           updated_at = ?,
           version = version + 1
       WHERE id = ?`,
    )
      .bind(now, now, 30301)
      .run();

    const child = await env.DB.prepare(
      `SELECT parent_id, version
       FROM categories
       WHERE id = ?`,
    )
      .bind(30302)
      .first<{ parent_id: number | null; version: number }>();

    const item = await env.DB.prepare(
      `SELECT category_id, version
       FROM catalogue_items
       WHERE id = ?`,
    )
      .bind(30401)
      .first<{ category_id: number | null; version: number }>();

    expect(child).toEqual({
      parent_id: null,
      version: 2,
    });
    expect(item).toEqual({
      category_id: null,
      version: 2,
    });
  });

  it("stores and validates typed attribute values", async () => {
    await createOrganization(
      30501,
      "org_35353535353535353535353535353535",
      "Typed Attribute Integrity",
    );
    await createCatalogue(
      30601,
      "cat_36363636363636363636363636363636",
      30501,
      "typed-attribute-integrity",
    );
    await createItem({
      id: 30701,
      publicId: "itm_37373737373737373737373737373737",
      catalogueId: 30601,
      name: "Typed Product",
      slug: "typed-product",
    });

    const definitions = [
      {
        id: 30801,
        publicId: "atr_38383838383838383838383838383831",
        code: "finish",
        label: "Finish",
        dataType: "text" as const,
      },
      {
        id: 30802,
        publicId: "atr_38383838383838383838383838383832",
        code: "weight",
        label: "Weight",
        dataType: "number" as const,
      },
      {
        id: 30803,
        publicId: "atr_38383838383838383838383838383833",
        code: "in-stock",
        label: "In Stock",
        dataType: "boolean" as const,
      },
      {
        id: 30804,
        publicId: "atr_38383838383838383838383838383834",
        code: "launch-date",
        label: "Launch Date",
        dataType: "date" as const,
      },
      {
        id: 30805,
        publicId: "atr_38383838383838383838383838383835",
        code: "spec-url",
        label: "Specification URL",
        dataType: "url" as const,
      },
    ];

    for (const definition of definitions) {
      await createAttributeDefinition({
        ...definition,
        organizationId: 30501,
      });
    }

    await expect(
      insertAttributeValue({
        itemId: 30701,
        attributeDefinitionId: 30801,
        valueText: "Brushed",
      }),
    ).resolves.toBeDefined();

    await expect(
      insertAttributeValue({
        itemId: 30701,
        attributeDefinitionId: 30802,
        valueText: "12.5",
        valueNumber: 12.5,
      }),
    ).resolves.toBeDefined();

    await expect(
      insertAttributeValue({
        itemId: 30701,
        attributeDefinitionId: 30803,
        valueText: "true",
        valueBoolean: 1,
      }),
    ).resolves.toBeDefined();

    await expect(
      insertAttributeValue({
        itemId: 30701,
        attributeDefinitionId: 30804,
        valueText: "2026-10-02",
        valueDate: "2026-10-02",
      }),
    ).resolves.toBeDefined();

    await expect(
      insertAttributeValue({
        itemId: 30701,
        attributeDefinitionId: 30805,
        valueText: "https://techabanca.com/specs/pump",
        valueUrl: "https://techabanca.com/specs/pump",
      }),
    ).resolves.toBeDefined();

    const typed = await env.DB.prepare(
      `SELECT
         value_number,
         value_boolean,
         value_date,
         value_url
       FROM item_attribute_values
       WHERE item_id = ?
         AND attribute_definition_id = ?`,
    )
      .bind(30701, 30802)
      .first<{
        value_number: number | null;
        value_boolean: number | null;
        value_date: string | null;
        value_url: string | null;
      }>();

    expect(typed).toEqual({
      value_number: 12.5,
      value_boolean: null,
      value_date: null,
      value_url: null,
    });

    await expect(
      insertAttributeValue({
        itemId: 30701,
        attributeDefinitionId: 30802,
        valueText: "13.5",
      }),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `UPDATE item_attribute_values
         SET value_text = ?,
             value_date = ?,
             updated_at = ?
         WHERE item_id = ?
           AND attribute_definition_id = ?`,
      )
        .bind("2026-02-30", "2026-02-30", now, 30701, 30804)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `UPDATE item_attribute_values
         SET value_text = ?,
             value_url = ?,
             updated_at = ?
         WHERE item_id = ?
           AND attribute_definition_id = ?`,
      )
        .bind("javascript:alert(1)", "javascript:alert(1)", now, 30701, 30805)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        `UPDATE item_attribute_values
         SET value_number = ?,
             updated_at = ?
         WHERE item_id = ?
           AND attribute_definition_id = ?`,
      )
        .bind(1, now, 30701, 30801)
        .run(),
    ).rejects.toThrow();
  });

  it("blocks reverse changes that would invalidate existing attribute scope", async () => {
    await createOrganization(
      30901,
      "org_39393939393939393939393939393931",
      "Reverse Scope Tenant A",
    );
    await createOrganization(
      30902,
      "org_39393939393939393939393939393932",
      "Reverse Scope Tenant B",
    );
    await createCatalogue(
      31001,
      "cat_40404040404040404040404040404040",
      30901,
      "reverse-scope",
      "both",
    );
    await createItem({
      id: 31101,
      publicId: "itm_41414141414141414141414141414141",
      catalogueId: 31001,
      itemType: "product",
      name: "Scoped Product",
      slug: "scoped-product",
    });
    await createAttributeDefinition({
      id: 31201,
      publicId: "atr_42424242424242424242424242424242",
      organizationId: 30901,
      code: "product-grade",
      label: "Product Grade",
      dataType: "text",
      appliesTo: "product",
    });
    await insertAttributeValue({
      itemId: 31101,
      attributeDefinitionId: 31201,
      valueText: "Industrial",
    });

    await expect(
      env.DB.prepare(
        "UPDATE catalogue_items SET item_type = 'service' WHERE id = ?",
      )
        .bind(31101)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        "UPDATE attribute_definitions SET applies_to = 'service' WHERE id = ?",
      )
        .bind(31201)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        "UPDATE attribute_definitions SET organization_id = ? WHERE id = ?",
      )
        .bind(30902, 31201)
        .run(),
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        "UPDATE attribute_definitions SET data_type = 'number' WHERE id = ?",
      )
        .bind(31201)
        .run(),
    ).rejects.toThrow();
  });

  it("requires currency codes to be exactly three ASCII uppercase letters", async () => {
    await createOrganization(
      31301,
      "org_43434343434343434343434343434343",
      "Currency Integrity",
    );
    await createCatalogue(
      31401,
      "cat_44444444444444444444444444444444",
      31301,
      "currency-integrity",
    );

    await expect(
      createItem({
        id: 31501,
        publicId: "itm_45454545454545454545454545454545",
        catalogueId: 31401,
        name: "Valid Currency",
        slug: "valid-currency",
        priceMinorUnits: 10000,
        currencyCode: "INR",
      }),
    ).resolves.toBeUndefined();

    await expect(
      createItem({
        id: 31502,
        publicId: "itm_46464646464646464646464646464646",
        catalogueId: 31401,
        name: "Numeric Currency",
        slug: "numeric-currency",
        priceMinorUnits: 10000,
        currencyCode: "123",
      }),
    ).rejects.toThrow();

    await expect(
      createItem({
        id: 31503,
        publicId: "itm_47474747474747474747474747474747",
        catalogueId: 31401,
        name: "Mixed Currency",
        slug: "mixed-currency",
        priceMinorUnits: 10000,
        currencyCode: "IN1",
      }),
    ).rejects.toThrow();

    await expect(
      createItem({
        id: 31504,
        publicId: "itm_48484848484848484848484848484848",
        catalogueId: 31401,
        name: "Lower Currency",
        slug: "lower-currency",
        priceMinorUnits: 10000,
        currencyCode: "inr",
      }),
    ).rejects.toThrow();
  });
});
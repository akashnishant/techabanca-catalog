import {
  env,
  exports,
} from "cloudflare:workers";
import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { SECURE_SESSION_COOKIE_NAME } from "../src/worker/http/session-cookie";
import { TENANT_HEADER } from "../src/worker/middleware/require-tenant-access";
import {
  SessionRepository,
} from "../src/worker/repositories";
import { AuthSessionService } from "../src/worker/services/auth-session-service";

const NOW = "2026-10-02T09:00:00.000Z";

const OWNER_ID = 99501;
const OWNER_PUBLIC_ID =
  "usr_61616161616161616161616161616161";
const EDITOR_ID = 99502;
const EDITOR_PUBLIC_ID =
  "usr_62626262626262626262626262626262";
const ORG_ID = 99601;
const ORG_PUBLIC_ID =
  "org_63636363636363636363636363636363";
const CATALOGUE_ID = 99701;
const CATALOGUE_PUBLIC_ID =
  "cat_64646464646464646464646464646464";
const CATEGORY_ID = 99801;
const CATEGORY_PUBLIC_ID =
  "ctg_65656565656565656565656565656565";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM item_attribute_values"),
    env.DB.prepare("DELETE FROM item_documents"),
    env.DB.prepare("DELETE FROM item_images"),
    env.DB.prepare("DELETE FROM enquiries"),
    env.DB.prepare("DELETE FROM catalogue_items"),
    env.DB.prepare("DELETE FROM categories"),
    env.DB.prepare("DELETE FROM catalogues"),
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function insertUser(
  id: number,
  publicId: string,
  email: string,
) {
  await env.DB.prepare(
    `INSERT INTO users (
       id,
       public_id,
       email,
       password_hash,
       display_name,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  )
    .bind(
      id,
      publicId,
      email,
      "test-password-hash",
      email,
      NOW,
      NOW,
    )
    .run();
}

async function insertMembership(
  id: number,
  publicId: string,
  userId: number,
  role: "owner" | "editor",
) {
  await env.DB.prepare(
    `INSERT INTO organization_members (
       id,
       public_id,
       organization_id,
       user_id,
       role,
       status,
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
  )
    .bind(
      id,
      publicId,
      ORG_ID,
      userId,
      role,
      NOW,
      NOW,
    )
    .run();
}

async function createFixture() {
  await insertUser(
    OWNER_ID,
    OWNER_PUBLIC_ID,
    "item-owner@example.com",
  );
  await insertUser(
    EDITOR_ID,
    EDITOR_PUBLIC_ID,
    "item-editor@example.com",
  );

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
     ) VALUES (?, ?, ?, 'IN', 'Asia/Kolkata', 'active', 1, ?, ?)`,
  )
    .bind(
      ORG_ID,
      ORG_PUBLIC_ID,
      "Item Authoring Test",
      NOW,
      NOW,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO business_profiles (
       organization_id,
       legal_or_display_name,
       city,
       country_code,
       created_at,
       updated_at
     ) VALUES (?, ?, 'Mumbai', 'IN', ?, ?)`,
  )
    .bind(
      ORG_ID,
      "Item Authoring Test",
      NOW,
      NOW,
    )
    .run();

  await insertMembership(
    99901,
    "mem_66666666666666666666666666666661",
    OWNER_ID,
    "owner",
  );
  await insertMembership(
    99902,
    "mem_66666666666666666666666666666662",
    EDITOR_ID,
    "editor",
  );

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
     ) VALUES (?, ?, ?, ?, ?, 'both', 'draft', ?, ?)`,
  )
    .bind(
      CATALOGUE_ID,
      CATALOGUE_PUBLIC_ID,
      ORG_ID,
      "Item Authoring Test",
      "item-authoring-test",
      NOW,
      NOW,
    )
    .run();

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
      CATEGORY_ID,
      CATEGORY_PUBLIC_ID,
      CATALOGUE_ID,
      "Industrial",
      "industrial",
      NOW,
      NOW,
    )
    .run();
}

async function sessionCookie(
  userId: number,
): Promise<string> {
  const service = new AuthSessionService(
    new SessionRepository(env.DB),
  );

  const created = await service.create(
    userId,
    new Date(),
  );

  return (
    `${SECURE_SESSION_COOKIE_NAME}=${created.token}`
  );
}

function tenantHeaders(
  cookie: string,
  origin = "https://catalogue.test",
): Record<string, string> {
  return {
    cookie,
    [TENANT_HEADER]: ORG_PUBLIC_ID,
    Origin: origin,
    "Content-Type": "application/json",
  };
}

async function createItem(
  cookie: string,
  input: {
    itemType?: "product" | "service";
    name: string;
    slug?: string;
    sku?: string | null;
    categoryId?: string | null;
    shortDescription?: string | null;
    longDescription?: string | null;
    priceMinorUnits?: number | null;
    currencyCode?: string | null;
    showPrice?: boolean;
    status?: "draft" | "published" | "hidden";
    isFeatured?: boolean;
    sortOrder?: number;
  },
) {
  return exports.default.fetch(
    new Request(
      "https://catalogue.test/api/v1/catalogue/items",
      {
        method: "POST",
        headers: tenantHeaders(cookie),
        body: JSON.stringify({
          itemType: input.itemType ?? "product",
          ...input,
        }),
      },
    ),
  );
}

describe("item authoring HTTP boundary", () => {
  beforeEach(async () => {
    await resetFixture();
    await createFixture();
  });

  it("requires authentication before listing tenant items", async () => {
    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/items",
        {
          headers: {
            [TENANT_HEADER]: ORG_PUBLIC_ID,
          },
        },
      ),
    );

    expect(response.status).toBe(401);
  });

  it("lets editors read items but not create them", async () => {
    const editorCookie =
      await sessionCookie(EDITOR_ID);

    const list = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/items",
        {
          headers: {
            cookie: editorCookie,
            [TENANT_HEADER]: ORG_PUBLIC_ID,
          },
        },
      ),
    );

    expect(list.status).toBe(200);

    const create = await createItem(
      editorCookie,
      {
        name: "Editor Item",
      },
    );

    expect(create.status).toBe(403);

    const body = await create.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "insufficient_permissions",
    );
  });

  it("creates a complete product with category, pricing, and normalized values", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const response = await createItem(
      cookie,
      {
        name: "  Industrial   Pump  ",
        slug: " Industrial Pump Pro ",
        sku: "  PUMP-001  ",
        categoryId:
          CATEGORY_PUBLIC_ID,
        shortDescription:
          "  Heavy   duty pump  ",
        longDescription:
          "Long product description.",
        priceMinorUnits: 125000,
        currencyCode: " inr ",
        showPrice: true,
        status: "published",
        isFeatured: true,
        sortOrder: 25,
      },
    );

    expect(response.status).toBe(201);

    const body = await response.json<{
      data: {
        item: {
          id: string;
          catalogueId: string;
          categoryId: string | null;
          itemType: string;
          name: string;
          slug: string;
          sku: string | null;
          shortDescription: string | null;
          longDescription: string | null;
          priceMinorUnits: number | null;
          currencyCode: string | null;
          showPrice: boolean;
          status: string;
          isFeatured: boolean;
          sortOrder: number;
          version: number;
        };
      };
    }>();

    expect(body.data.item).toMatchObject({
      catalogueId:
        CATALOGUE_PUBLIC_ID,
      categoryId:
        CATEGORY_PUBLIC_ID,
      itemType: "product",
      name: "Industrial Pump",
      slug: "industrial-pump-pro",
      sku: "PUMP-001",
      shortDescription:
        "Heavy duty pump",
      longDescription:
        "Long product description.",
      priceMinorUnits: 125000,
      currencyCode: "INR",
      showPrice: true,
      status: "published",
      isFeatured: true,
      sortOrder: 25,
      version: 1,
    });

    expect(body.data.item.id).toMatch(
      /^itm_[0-9a-f]{32}$/,
    );
  });

  it("enforces catalogue mode and pricing invariants", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    await env.DB.prepare(
      `UPDATE catalogues
       SET mode = 'products'
       WHERE id = ?`,
    )
      .bind(CATALOGUE_ID)
      .run();

    const wrongType = await createItem(
      cookie,
      {
        name: "Service Not Allowed",
        itemType: "service",
      },
    );

    expect(wrongType.status).toBe(400);

    const wrongTypeBody =
      await wrongType.json<{
        error: {
          code: string;
        };
      }>();

    expect(
      wrongTypeBody.error.code,
    ).toBe("item_type_not_allowed");

    const incompletePrice =
      await createItem(
        cookie,
        {
          name: "Bad Price",
          priceMinorUnits: 10000,
          showPrice: true,
        },
      );

    expect(
      incompletePrice.status,
    ).toBe(400);

    const invalidCurrency =
      await createItem(
        cookie,
        {
          name: "Bad Currency",
          priceMinorUnits: 10000,
          currencyCode: "IN1",
        },
      );

    expect(
      invalidCurrency.status,
    ).toBe(400);
  });

  it("rejects duplicate active item slugs and SKUs", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    expect(
      (await createItem(
        cookie,
        {
          name: "Pump One",
          slug: "pump-one",
          sku: "PUMP-001",
        },
      )).status,
    ).toBe(201);

    const duplicateSlug =
      await createItem(
        cookie,
        {
          name: "Duplicate Slug",
          slug: "PUMP ONE",
          sku: "PUMP-002",
        },
      );

    expect(
      duplicateSlug.status,
    ).toBe(409);

    const duplicateSku =
      await createItem(
        cookie,
        {
          name: "Pump Two",
          slug: "pump-two",
          sku: "pump-001",
        },
      );

    expect(
      duplicateSku.status,
    ).toBe(409);

    const skuBody =
      await duplicateSku.json<{
        error: {
          code: string;
        };
      }>();

    expect(skuBody.error.code).toBe(
      "item_sku_unavailable",
    );
  });

  it("filters, searches, and cursor-paginates the authoring item list", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const first = await createItem(
      cookie,
      {
        name: "Alpha Pump",
        sku: "ALPHA-001",
        categoryId:
          CATEGORY_PUBLIC_ID,
        status: "draft",
        sortOrder: 10,
      },
    );

    expect(first.status).toBe(201);

    expect(
      (await createItem(
        cookie,
        {
          name: "Beta Service",
          itemType: "service",
          status: "hidden",
          sortOrder: 20,
        },
      )).status,
    ).toBe(201);

    expect(
      (await createItem(
        cookie,
        {
          name: "Gamma Pump",
          sku: "GAMMA-001",
          categoryId:
            CATEGORY_PUBLIC_ID,
          status: "draft",
          sortOrder: 30,
        },
      )).status,
    ).toBe(201);

    const firstPage =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/catalogue/items?itemType=product&status=draft&limit=1",
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    expect(firstPage.status).toBe(200);

    const firstBody =
      await firstPage.json<{
        data: {
          items: Array<{
            id: string;
            name: string;
          }>;
          nextCursor: string | null;
        };
      }>();

    expect(firstBody.data.items).toHaveLength(1);
    expect(
      firstBody.data.items[0].name,
    ).toBe("Alpha Pump");
    expect(
      firstBody.data.nextCursor,
    ).toBeTruthy();

    const secondPage =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/items?itemType=product&status=draft&limit=1&after=${firstBody.data.nextCursor}`,
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    const secondBody =
      await secondPage.json<{
        data: {
          items: Array<{
            name: string;
          }>;
          nextCursor: string | null;
        };
      }>();

    expect(secondPage.status).toBe(200);
    expect(
      secondBody.data.items.map(
        (item) => item.name,
      ),
    ).toEqual(["Gamma Pump"]);
    expect(
      secondBody.data.nextCursor,
    ).toBeNull();

    const searched =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/catalogue/items?q=gamma&categoryId="
            + CATEGORY_PUBLIC_ID,
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    expect(searched.status).toBe(200);

    const searchBody =
      await searched.json<{
        data: {
          items: Array<{
            name: string;
          }>;
        };
      }>();

    expect(
      searchBody.data.items.map(
        (item) => item.name,
      ),
    ).toEqual(["Gamma Pump"]);
  });

  it("updates an item with optimistic versioning and supports clearing category and price", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created = await createItem(
      cookie,
      {
        name: "Pump",
        sku: "P-1",
        categoryId:
          CATEGORY_PUBLIC_ID,
        priceMinorUnits: 50000,
        currencyCode: "INR",
        showPrice: true,
      },
    );

    const createdBody =
      await created.json<{
        data: {
          item: {
            id: string;
          };
        };
      }>();

    const itemId =
      createdBody.data.item.id;

    const update =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/items/${itemId}`,
          {
            method: "PATCH",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 1,
              name: "Updated Pump",
              categoryId: null,
              priceMinorUnits: null,
              currencyCode: null,
              showPrice: false,
              status: "hidden",
              isFeatured: true,
              sortOrder: 40,
            }),
          },
        ),
      );

    expect(update.status).toBe(200);

    const updateBody =
      await update.json<{
        data: {
          item: {
            name: string;
            categoryId: string | null;
            priceMinorUnits: number | null;
            currencyCode: string | null;
            showPrice: boolean;
            status: string;
            isFeatured: boolean;
            sortOrder: number;
            version: number;
          };
        };
      }>();

    expect(
      updateBody.data.item,
    ).toMatchObject({
      name: "Updated Pump",
      categoryId: null,
      priceMinorUnits: null,
      currencyCode: null,
      showPrice: false,
      status: "hidden",
      isFeatured: true,
      sortOrder: 40,
      version: 2,
    });

    const stale =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/items/${itemId}`,
          {
            method: "PATCH",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 1,
              name: "Stale Pump",
            }),
          },
        ),
      );

    expect(stale.status).toBe(409);

    const staleBody =
      await stale.json<{
        error: {
          code: string;
        };
      }>();

    expect(staleBody.error.code).toBe(
      "item_version_conflict",
    );
  });

  it("maps incompatible item-type changes with existing attributes to a conflict", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created = await createItem(
      cookie,
      {
        name: "Attributed Product",
      },
    );

    const createdBody =
      await created.json<{
        data: {
          item: {
            id: string;
          };
        };
      }>();

    const row = await env.DB.prepare(
      `SELECT id
       FROM catalogue_items
       WHERE public_id = ?`,
    )
      .bind(createdBody.data.item.id)
      .first<{ id: number }>();

    if (!row) {
      throw new Error(
        "item_attribute_fixture_missing",
      );
    }

    await env.DB.prepare(
      `INSERT INTO item_attribute_values (
         item_id,
         attribute_definition_id,
         value_text,
         created_at,
         updated_at
       ) VALUES (?, 1, ?, ?, ?)`,
    )
      .bind(
        row.id,
        "Techabanca",
        NOW,
        NOW,
      )
      .run();

    const response =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/items/${createdBody.data.item.id}`,
          {
            method: "PATCH",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 1,
              itemType: "service",
            }),
          },
        ),
      );

    expect(response.status).toBe(409);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "item_attribute_scope_conflict",
    );
  });

  it("soft deletes items and allows their slug and SKU to be reused", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created = await createItem(
      cookie,
      {
        name: "Reusable Item",
        slug: "reusable-item",
        sku: "REUSE-1",
      },
    );

    const createdBody =
      await created.json<{
        data: {
          item: {
            id: string;
          };
        };
      }>();

    const deletion =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/items/${createdBody.data.item.id}`,
          {
            method: "DELETE",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 1,
            }),
          },
        ),
      );

    expect(deletion.status).toBe(204);

    const getDeleted =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/items/${createdBody.data.item.id}`,
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    expect(getDeleted.status).toBe(404);

    const replacement =
      await createItem(
        cookie,
        {
          name: "Replacement",
          slug: "reusable-item",
          sku: "reuse-1",
        },
      );

    expect(replacement.status).toBe(201);
  });

  it("rejects unsafe item mutations from a foreign origin", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/items",
        {
          method: "POST",
          headers: tenantHeaders(
            cookie,
            "https://evil.example",
          ),
          body: JSON.stringify({
            itemType: "product",
            name: "Rejected Item",
          }),
        },
      ),
    );

    expect(response.status).toBe(403);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "cross_origin_request_rejected",
    );
  });

  it("keeps item reads inside the selected tenant", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/items/itm_99999999999999999999999999999999",
        {
          headers: {
            cookie,
            [TENANT_HEADER]:
              ORG_PUBLIC_ID,
          },
        },
      ),
    );

    expect(response.status).toBe(404);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "item_not_found",
    );
  });
});
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

const NOW = "2026-10-02T08:30:00.000Z";

const OWNER_ID = 99101;
const OWNER_PUBLIC_ID =
  "usr_51515151515151515151515151515151";
const EDITOR_ID = 99102;
const EDITOR_PUBLIC_ID =
  "usr_52525252525252525252525252525252";
const ORG_ID = 99201;
const ORG_PUBLIC_ID =
  "org_53535353535353535353535353535353";
const CATALOGUE_ID = 99301;
const CATALOGUE_PUBLIC_ID =
  "cat_54545454545454545454545454545454";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM item_attribute_values"),
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
    "category-owner@example.com",
  );
  await insertUser(
    EDITOR_ID,
    EDITOR_PUBLIC_ID,
    "category-editor@example.com",
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
      "Category Authoring Test",
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
      "Category Authoring Test",
      NOW,
      NOW,
    )
    .run();

  await insertMembership(
    99401,
    "mem_55555555555555555555555555555551",
    OWNER_ID,
    "owner",
  );
  await insertMembership(
    99402,
    "mem_55555555555555555555555555555552",
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
      "Category Authoring Test",
      "category-authoring-test",
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

async function createCategory(
  cookie: string,
  input: {
    name: string;
    slug?: string;
    parentId?: string | null;
    description?: string | null;
    sortOrder?: number;
    isVisible?: boolean;
  },
) {
  return exports.default.fetch(
    new Request(
      "https://catalogue.test/api/v1/catalogue/categories",
      {
        method: "POST",
        headers: tenantHeaders(cookie),
        body: JSON.stringify(input),
      },
    ),
  );
}

describe("category authoring HTTP boundary", () => {
  beforeEach(async () => {
    await resetFixture();
    await createFixture();
  });

  it("requires authentication before listing tenant categories", async () => {
    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/categories",
        {
          headers: {
            [TENANT_HEADER]: ORG_PUBLIC_ID,
          },
        },
      ),
    );

    expect(response.status).toBe(401);
  });

  it("lets editors read categories but not create them", async () => {
    const editorCookie = await sessionCookie(
      EDITOR_ID,
    );

    const list = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/categories",
        {
          headers: {
            cookie: editorCookie,
            [TENANT_HEADER]: ORG_PUBLIC_ID,
          },
        },
      ),
    );

    expect(list.status).toBe(200);

    const create = await createCategory(
      editorCookie,
      {
        name: "Editor Category",
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

  it("creates root and child categories with normalized slugs and lists them", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const rootResponse = await createCategory(
      cookie,
      {
        name: "Industrial Pumps",
        description: "Core pump range",
        sortOrder: 10,
      },
    );

    expect(rootResponse.status).toBe(201);

    const rootBody = await rootResponse.json<{
      data: {
        category: {
          id: string;
          parentId: string | null;
          name: string;
          slug: string;
          version: number;
        };
      };
    }>();

    expect(rootBody.data.category).toMatchObject({
      parentId: null,
      name: "Industrial Pumps",
      slug: "industrial-pumps",
      version: 1,
    });

    const childResponse = await createCategory(
      cookie,
      {
        name: "High Pressure",
        parentId: rootBody.data.category.id,
        sortOrder: 20,
      },
    );

    expect(childResponse.status).toBe(201);

    const childBody = await childResponse.json<{
      data: {
        category: {
          id: string;
          parentId: string | null;
          slug: string;
        };
      };
    }>();

    expect(childBody.data.category).toMatchObject({
      parentId: rootBody.data.category.id,
      slug: "high-pressure",
    });

    const listResponse = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/categories",
        {
          headers: {
            cookie,
            [TENANT_HEADER]: ORG_PUBLIC_ID,
          },
        },
      ),
    );

    expect(listResponse.status).toBe(200);
    expect(
      listResponse.headers.get("cache-control"),
    ).toBe("no-store");
    expect(
      listResponse.headers.get("x-request-id"),
    ).toBeTruthy();

    const listBody = await listResponse.json<{
      data: {
        catalogueId: string;
        categories: Array<{
          id: string;
          parentId: string | null;
        }>;
      };
    }>();

    expect(listBody.data.catalogueId).toBe(
      CATALOGUE_PUBLIC_ID,
    );
    expect(listBody.data.categories).toHaveLength(2);
    expect(
      listBody.data.categories.some(
        (category) =>
          category.parentId
          === rootBody.data.category.id,
      ),
    ).toBe(true);
  });

  it("returns a validation error for an overlong category description", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await createCategory(
      cookie,
      {
        name: "Oversized Description",
        description: "x".repeat(2001),
      },
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "invalid_category",
    );

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM categories
       WHERE catalogue_id = ?`,
    )
      .bind(CATALOGUE_ID)
      .first<{ count: number }>();

    expect(count?.count).toBe(0);
  });

  it("rejects duplicate active category slugs", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    expect(
      (await createCategory(cookie, {
        name: "Pumps",
        slug: "pumps",
      })).status,
    ).toBe(201);

    const duplicate = await createCategory(
      cookie,
      {
        name: "Pump Collection",
        slug: "PUMPS",
      },
    );

    expect(duplicate.status).toBe(409);

    const body = await duplicate.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "category_slug_unavailable",
    );
  });

  it("updates a category with optimistic versioning and rejects stale writes", async () => {
    const cookie = await sessionCookie(OWNER_ID);
    const created = await createCategory(
      cookie,
      {
        name: "Machinery",
      },
    );

    const createdBody = await created.json<{
      data: {
        category: {
          id: string;
          version: number;
        };
      };
    }>();

    const categoryId =
      createdBody.data.category.id;

    const update = await exports.default.fetch(
      new Request(
        `https://catalogue.test/api/v1/catalogue/categories/${categoryId}`,
        {
          method: "PATCH",
          headers: tenantHeaders(cookie),
          body: JSON.stringify({
            version: 1,
            name: "Industrial Machinery",
            description: "Updated category",
            sortOrder: 25,
            isVisible: false,
          }),
        },
      ),
    );

    expect(update.status).toBe(200);

    const updateBody = await update.json<{
      data: {
        category: {
          name: string;
          slug: string;
          description: string | null;
          sortOrder: number;
          isVisible: boolean;
          version: number;
        };
      };
    }>();

    expect(updateBody.data.category).toMatchObject({
      name: "Industrial Machinery",
      slug: "machinery",
      description: "Updated category",
      sortOrder: 25,
      isVisible: false,
      version: 2,
    });

    const stale = await exports.default.fetch(
      new Request(
        `https://catalogue.test/api/v1/catalogue/categories/${categoryId}`,
        {
          method: "PATCH",
          headers: tenantHeaders(cookie),
          body: JSON.stringify({
            version: 1,
            name: "Stale Update",
          }),
        },
      ),
    );

    expect(stale.status).toBe(409);

    const staleBody = await stale.json<{
      error: {
        code: string;
      };
    }>();

    expect(staleBody.error.code).toBe(
      "category_version_conflict",
    );
  });

  it("prevents a category with children from becoming a child", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const parentResponse = await createCategory(
      cookie,
      {
        name: "Machines",
      },
    );
    const parentBody = await parentResponse.json<{
      data: {
        category: {
          id: string;
        };
      };
    }>();

    const childResponse = await createCategory(
      cookie,
      {
        name: "CNC",
        parentId: parentBody.data.category.id,
      },
    );

    expect(childResponse.status).toBe(201);

    const otherRootResponse = await createCategory(
      cookie,
      {
        name: "Other Root",
      },
    );
    const otherRootBody =
      await otherRootResponse.json<{
        data: {
          category: {
            id: string;
          };
        };
      }>();

    const blocked = await exports.default.fetch(
      new Request(
        `https://catalogue.test/api/v1/catalogue/categories/${parentBody.data.category.id}`,
        {
          method: "PATCH",
          headers: tenantHeaders(cookie),
          body: JSON.stringify({
            version: 1,
            parentId:
              otherRootBody.data.category.id,
          }),
        },
      ),
    );

    expect(blocked.status).toBe(409);

    const blockedBody = await blocked.json<{
      error: {
        code: string;
      };
    }>();

    expect(blockedBody.error.code).toBe(
      "category_has_children",
    );

    const rows = await env.DB.prepare(
      `SELECT id, public_id
       FROM categories
       WHERE public_id IN (?, ?)`,
    )
      .bind(
        parentBody.data.category.id,
        otherRootBody.data.category.id,
      )
      .all<{
        id: number;
        public_id: string;
      }>();

    const parent = rows.results.find(
      (row) =>
        row.public_id
        === parentBody.data.category.id,
    );
    const otherRoot = rows.results.find(
      (row) =>
        row.public_id
        === otherRootBody.data.category.id,
    );

    if (!parent || !otherRoot) {
      throw new Error(
        "category_depth_fixture_missing",
      );
    }

    await expect(
      env.DB.prepare(
        `UPDATE categories
         SET parent_id = ?
         WHERE id = ?`,
      )
        .bind(otherRoot.id, parent.id)
        .run(),
    ).rejects.toThrow();
  });

  it("soft deletes a category and detaches its active children and items", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const parentResponse = await createCategory(
      cookie,
      {
        name: "Parent Category",
      },
    );
    const parentBody = await parentResponse.json<{
      data: {
        category: {
          id: string;
        };
      };
    }>();

    const childResponse = await createCategory(
      cookie,
      {
        name: "Child Category",
        parentId: parentBody.data.category.id,
      },
    );
    const childBody = await childResponse.json<{
      data: {
        category: {
          id: string;
        };
      };
    }>();

    const parentRow = await env.DB.prepare(
      "SELECT id FROM categories WHERE public_id = ?",
    )
      .bind(parentBody.data.category.id)
      .first<{ id: number }>();

    if (!parentRow) {
      throw new Error(
        "category_delete_fixture_missing",
      );
    }

    await env.DB.prepare(
      `INSERT INTO catalogue_items (
         public_id,
         catalogue_id,
         category_id,
         item_type,
         name,
         slug,
         status,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, 'product', ?, ?, 'draft', ?, ?)`,
    )
      .bind(
        "itm_56565656565656565656565656565656",
        CATALOGUE_ID,
        parentRow.id,
        "Pump Item",
        "pump-item",
        NOW,
        NOW,
      )
      .run();

    const deletion = await exports.default.fetch(
      new Request(
        `https://catalogue.test/api/v1/catalogue/categories/${parentBody.data.category.id}`,
        {
          method: "DELETE",
          headers: tenantHeaders(cookie),
          body: JSON.stringify({
            version: 1,
          }),
        },
      ),
    );

    expect(deletion.status).toBe(204);

    const parentAfter = await env.DB.prepare(
      `SELECT deleted_at, version
       FROM categories
       WHERE public_id = ?`,
    )
      .bind(parentBody.data.category.id)
      .first<{
        deleted_at: string | null;
        version: number;
      }>();

    const childAfter = await env.DB.prepare(
      `SELECT parent_id, version
       FROM categories
       WHERE public_id = ?`,
    )
      .bind(childBody.data.category.id)
      .first<{
        parent_id: number | null;
        version: number;
      }>();

    const itemAfter = await env.DB.prepare(
      `SELECT category_id, version
       FROM catalogue_items
       WHERE public_id = ?`,
    )
      .bind(
        "itm_56565656565656565656565656565656",
      )
      .first<{
        category_id: number | null;
        version: number;
      }>();

    expect(parentAfter?.deleted_at).not.toBeNull();
    expect(parentAfter?.version).toBe(2);
    expect(childAfter).toEqual({
      parent_id: null,
      version: 2,
    });
    expect(itemAfter).toEqual({
      category_id: null,
      version: 2,
    });
  });

  it("rejects unsafe category mutations from a foreign origin", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/categories",
        {
          method: "POST",
          headers: tenantHeaders(
            cookie,
            "https://evil.example",
          ),
          body: JSON.stringify({
            name: "Rejected Category",
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

  it("returns not found for categories outside the selected tenant", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/categories/ctg_99999999999999999999999999999999",
        {
          headers: {
            cookie,
            [TENANT_HEADER]: ORG_PUBLIC_ID,
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
      "category_not_found",
    );
  });
});
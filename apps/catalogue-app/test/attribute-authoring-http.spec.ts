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

const NOW = "2026-10-02T09:30:00.000Z";

const OWNER_ID = 100501;
const OWNER_PUBLIC_ID =
  "usr_71717171717171717171717171717171";
const EDITOR_ID = 100502;
const EDITOR_PUBLIC_ID =
  "usr_72727272727272727272727272727272";
const ORG_ID = 100601;
const ORG_PUBLIC_ID =
  "org_73737373737373737373737373737373";
const CATALOGUE_ID = 100701;
const CATALOGUE_PUBLIC_ID =
  "cat_74747474747474747474747474747474";
const ITEM_ID = 100801;
const ITEM_PUBLIC_ID =
  "itm_75757575757575757575757575757575";
const SYSTEM_BRAND_ID =
  "atr_00000000000000000000000000000001";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM item_attribute_values",
    ),
    env.DB.prepare(
      "DELETE FROM item_documents",
    ),
    env.DB.prepare(
      "DELETE FROM item_images",
    ),
    env.DB.prepare(
      "DELETE FROM enquiries",
    ),
    env.DB.prepare(
      "DELETE FROM catalogue_items",
    ),
    env.DB.prepare(
      "DELETE FROM attribute_definitions WHERE organization_id IS NOT NULL",
    ),
    env.DB.prepare(
      "DELETE FROM categories",
    ),
    env.DB.prepare(
      "DELETE FROM catalogues",
    ),
    env.DB.prepare(
      "DELETE FROM business_profiles",
    ),
    env.DB.prepare(
      "DELETE FROM organization_members",
    ),
    env.DB.prepare(
      "DELETE FROM sessions",
    ),
    env.DB.prepare(
      "DELETE FROM organizations",
    ),
    env.DB.prepare(
      "DELETE FROM users",
    ),
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
    "attribute-owner@example.com",
  );

  await insertUser(
    EDITOR_ID,
    EDITOR_PUBLIC_ID,
    "attribute-editor@example.com",
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
      "Attribute Authoring Test",
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
      "Attribute Authoring Test",
      NOW,
      NOW,
    )
    .run();

  await insertMembership(
    100901,
    "mem_76767676767676767676767676767671",
    OWNER_ID,
    "owner",
  );

  await insertMembership(
    100902,
    "mem_76767676767676767676767676767672",
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
      "Attribute Catalogue",
      "attribute-catalogue",
      NOW,
      NOW,
    )
    .run();

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
     ) VALUES (?, ?, ?, 'product', ?, ?, 'draft', ?, ?)`,
  )
    .bind(
      ITEM_ID,
      ITEM_PUBLIC_ID,
      CATALOGUE_ID,
      "Industrial Pump",
      "industrial-pump",
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
    [TENANT_HEADER]:
      ORG_PUBLIC_ID,
    Origin: origin,
    "Content-Type": "application/json",
  };
}

async function createDefinition(
  cookie: string,
  input: {
    code?: string;
    label: string;
    dataType:
      | "text"
      | "number"
      | "boolean"
      | "date"
      | "url";
    appliesTo?:
      | "product"
      | "service"
      | "both";
    unitHint?: string | null;
    sortOrder?: number;
  },
) {
  const response =
    await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/catalogue/attributes",
        {
          method: "POST",
          headers:
            tenantHeaders(cookie),
          body: JSON.stringify(input),
        },
      ),
    );

  return response;
}

async function createdDefinitionId(
  response: Response,
): Promise<string> {
  const body = await response.json<{
    data: {
      attribute: {
        id: string;
      };
    };
  }>();

  return body.data.attribute.id;
}

async function setValue(
  cookie: string,
  attributeId: string,
  body: Record<string, unknown>,
) {
  return exports.default.fetch(
    new Request(
      `https://catalogue.test/api/v1/catalogue/items/${ITEM_PUBLIC_ID}/attributes/${attributeId}`,
      {
        method: "PUT",
        headers: tenantHeaders(cookie),
        body: JSON.stringify(body),
      },
    ),
  );
}

describe("attribute authoring HTTP boundary", () => {
  beforeEach(async () => {
    await resetFixture();
    await createFixture();
  });

  it("requires authentication before listing attributes", async () => {
    const response =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/catalogue/attributes",
          {
            headers: {
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    expect(response.status).toBe(401);
  });

  it("lets editors read attributes but not create custom definitions", async () => {
    const cookie =
      await sessionCookie(EDITOR_ID);

    const list =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/catalogue/attributes",
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    expect(list.status).toBe(200);

    const create =
      await createDefinition(
        cookie,
        {
          label: "Editor Field",
          dataType: "text",
        },
      );

    expect(create.status).toBe(403);
  });

  it("lists system attributes with business-type preset metadata", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const response =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/catalogue/attributes?appliesTo=product",
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        attributes: Array<{
          id: string;
          source: string;
          code: string;
          isSuggested: boolean;
          suggestedSortOrder:
            number | null;
        }>;
      };
    }>();

    const brand =
      body.data.attributes.find(
        (attribute) =>
          attribute.id
          === SYSTEM_BRAND_ID,
      );

    expect(brand).toMatchObject({
      source: "system",
      code: "brand",
      isSuggested: true,
      suggestedSortOrder: 10,
    });
  });

  it("creates normalized tenant custom definitions and blocks system-code collisions", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created =
      await createDefinition(
        cookie,
        {
          label:
            "  Maximum   Pressure  ",
          dataType: "number",
          appliesTo: "product",
          unitHint: " bar ",
          sortOrder: 40,
        },
      );

    expect(created.status).toBe(201);

    const body = await created.json<{
      data: {
        attribute: {
          id: string;
          source: string;
          code: string;
          label: string;
          dataType: string;
          appliesTo: string;
          unitHint: string | null;
          version: number;
        };
      };
    }>();

    expect(
      body.data.attribute,
    ).toMatchObject({
      source: "custom",
      code: "maximum-pressure",
      label: "Maximum Pressure",
      dataType: "number",
      appliesTo: "product",
      unitHint: "bar",
      version: 1,
    });

    expect(
      body.data.attribute.id,
    ).toMatch(/^atr_[0-9a-f]{32}$/);

    const conflict =
      await createDefinition(
        cookie,
        {
          code: "brand",
          label: "My Brand",
          dataType: "text",
        },
      );

    expect(conflict.status).toBe(409);

    const conflictBody =
      await conflict.json<{
        error: {
          code: string;
        };
      }>();

    expect(
      conflictBody.error.code,
    ).toBe(
      "attribute_code_unavailable",
    );
  });

  it("updates custom definitions optimistically and keeps system definitions read-only", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created =
      await createDefinition(
        cookie,
        {
          label: "Finish Type",
          dataType: "text",
          appliesTo: "product",
        },
      );

    const id =
      await createdDefinitionId(
        created,
      );

    const update =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/attributes/${id}`,
          {
            method: "PATCH",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 1,
              label:
                "Surface Finish",
              sortOrder: 55,
            }),
          },
        ),
      );

    expect(update.status).toBe(200);

    const updated =
      await update.json<{
        data: {
          attribute: {
            label: string;
            sortOrder: number;
            version: number;
          };
        };
      }>();

    expect(
      updated.data.attribute,
    ).toMatchObject({
      label: "Surface Finish",
      sortOrder: 55,
      version: 2,
    });

    const stale =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/attributes/${id}`,
          {
            method: "PATCH",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 1,
              label: "Stale",
            }),
          },
        ),
      );

    expect(stale.status).toBe(409);

    const system =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/attributes/${SYSTEM_BRAND_ID}`,
          {
            method: "PATCH",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 1,
              label: "Changed Brand",
            }),
          },
        ),
      );

    expect(system.status).toBe(403);
  });

  it("maps definition changes that would invalidate existing values to a conflict", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created =
      await createDefinition(
        cookie,
        {
          label: "Product Grade",
          dataType: "text",
          appliesTo: "product",
        },
      );

    const id =
      await createdDefinitionId(
        created,
      );

    expect(
      (await setValue(
        cookie,
        id,
        {
          value: "Industrial",
        },
      )).status,
    ).toBe(200);

    const update =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/attributes/${id}`,
          {
            method: "PATCH",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 1,
              appliesTo: "service",
            }),
          },
        ),
      );

    expect(update.status).toBe(409);

    const body =
      await update.json<{
        error: {
          code: string;
        };
      }>();

    expect(body.error.code).toBe(
      "attribute_definition_in_use",
    );
  });

  it("archives custom definitions while preserving them for explicit inactive listings", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created =
      await createDefinition(
        cookie,
        {
          label: "Internal Note",
          dataType: "text",
        },
      );

    const id =
      await createdDefinitionId(
        created,
      );

    const deletion =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/attributes/${id}`,
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

    const activeList =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/catalogue/attributes",
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    const activeBody =
      await activeList.json<{
        data: {
          attributes: Array<{
            id: string;
          }>;
        };
      }>();

    expect(
      activeBody.data.attributes.some(
        (attribute) =>
          attribute.id === id,
      ),
    ).toBe(false);

    const inactiveList =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/catalogue/attributes?includeInactive=true",
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    const inactiveBody =
      await inactiveList.json<{
        data: {
          attributes: Array<{
            id: string;
            isActive: boolean;
            version: number;
          }>;
        };
      }>();

    expect(
      inactiveBody.data.attributes.find(
        (attribute) =>
          attribute.id === id,
      ),
    ).toMatchObject({
      isActive: false,
      version: 2,
    });
  });

  it("returns suggested system and custom fields for an item", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created =
      await createDefinition(
        cookie,
        {
          label: "Internal Code",
          dataType: "text",
          appliesTo: "product",
        },
      );

    const customId =
      await createdDefinitionId(
        created,
      );

    const response =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/items/${ITEM_PUBLIC_ID}/attributes`,
          {
            headers: {
              cookie,
              [TENANT_HEADER]:
                ORG_PUBLIC_ID,
            },
          },
        ),
      );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        attributes: Array<{
          definition: {
            id: string;
            source: string;
            isSuggested: boolean;
          };
          value: unknown;
        }>;
      };
    }>();

    expect(
      body.data.attributes.some(
        (entry) =>
          entry.definition.id
            === SYSTEM_BRAND_ID
          && entry.definition
            .isSuggested,
      ),
    ).toBe(true);

    expect(
      body.data.attributes.some(
        (entry) =>
          entry.definition.id
            === customId
          && entry.definition.source
            === "custom",
      ),
    ).toBe(true);
  });

  it("stores text, number, boolean, date, and URL values with typed representations", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const definitions = [
      {
        label: "Custom Text",
        dataType: "text" as const,
        value: "Brushed",
      },
      {
        label: "Custom Number",
        dataType: "number" as const,
        value: 12.5,
      },
      {
        label: "Custom Boolean",
        dataType: "boolean" as const,
        value: true,
      },
      {
        label: "Custom Date",
        dataType: "date" as const,
        value: "2026-10-02",
      },
      {
        label: "Custom URL",
        dataType: "url" as const,
        value:
          "https://techabanca.com/specs/pump",
      },
    ];

    const ids: string[] = [];

    for (const definition of definitions) {
      const created =
        await createDefinition(
          cookie,
          {
            label:
              definition.label,
            dataType:
              definition.dataType,
            appliesTo: "product",
          },
        );

      expect(created.status).toBe(201);

      const id =
        await createdDefinitionId(
          created,
        );

      ids.push(id);

      const saved = await setValue(
        cookie,
        id,
        {
          value: definition.value,
        },
      );

      expect(saved.status).toBe(200);
    }

    const rows = await env.DB.prepare(
      `SELECT
         ad.data_type,
         v.value_text,
         v.value_number,
         v.value_boolean,
         v.value_date,
         v.value_url,
         v.version
       FROM item_attribute_values v
       INNER JOIN attribute_definitions ad
         ON ad.id =
            v.attribute_definition_id
       WHERE v.item_id = ?
       ORDER BY ad.code`,
    )
      .bind(ITEM_ID)
      .all<{
        data_type: string;
        value_text: string;
        value_number: number | null;
        value_boolean: number | null;
        value_date: string | null;
        value_url: string | null;
        version: number;
      }>();

    expect(rows.results).toHaveLength(5);

    const numberValue =
      rows.results.find(
        (row) =>
          row.data_type === "number",
      );

    expect(numberValue).toMatchObject({
      value_text: "12.5",
      value_number: 12.5,
      value_boolean: null,
      value_date: null,
      value_url: null,
      version: 1,
    });

    const booleanValue =
      rows.results.find(
        (row) =>
          row.data_type === "boolean",
      );

    expect(booleanValue).toMatchObject({
      value_text: "true",
      value_boolean: 1,
    });

    expect(ids).toHaveLength(5);
  });

  it("rejects values whose runtime type or format does not match the definition", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const numberDefinition =
      await createDefinition(
        cookie,
        {
          label: "Weight",
          dataType: "number",
          appliesTo: "product",
        },
      );

    const numberId =
      await createdDefinitionId(
        numberDefinition,
      );

    expect(
      (await setValue(
        cookie,
        numberId,
        {
          value: "12.5",
        },
      )).status,
    ).toBe(400);

    const dateDefinition =
      await createDefinition(
        cookie,
        {
          label: "Launch Date",
          dataType: "date",
          appliesTo: "product",
        },
      );

    const dateId =
      await createdDefinitionId(
        dateDefinition,
      );

    expect(
      (await setValue(
        cookie,
        dateId,
        {
          value: "2026-02-30",
        },
      )).status,
    ).toBe(400);

    const urlDefinition =
      await createDefinition(
        cookie,
        {
          label: "Specification URL",
          dataType: "url",
          appliesTo: "product",
        },
      );

    const urlId =
      await createdDefinitionId(
        urlDefinition,
      );

    expect(
      (await setValue(
        cookie,
        urlId,
        {
          value:
            "javascript:alert(1)",
        },
      )).status,
    ).toBe(400);
  });

  it("enforces item applicability and tenant ownership for attribute values", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const serviceDefinition =
      await createDefinition(
        cookie,
        {
          label: "Service Duration",
          dataType: "text",
          appliesTo: "service",
        },
      );

    const serviceId =
      await createdDefinitionId(
        serviceDefinition,
      );

    const wrongType =
      await setValue(
        cookie,
        serviceId,
        {
          value: "Two hours",
        },
      );

    expect(wrongType.status).toBe(400);

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
        101001,
        "org_77777777777777777777777777777777",
        "Other Attribute Tenant",
        NOW,
        NOW,
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO attribute_definitions (
         public_id,
         organization_id,
         code,
         label,
         data_type,
         applies_to,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, 'text', 'product', ?, ?)`,
    )
      .bind(
        "atr_78787878787878787878787878787878",
        101001,
        "other-secret",
        "Other Secret",
        NOW,
        NOW,
      )
      .run();

    const crossTenant =
      await setValue(
        cookie,
        "atr_78787878787878787878787878787878",
        {
          value: "Should fail",
        },
      );

    expect(crossTenant.status).toBe(404);
  });

  it("updates and deletes item values with optimistic versions", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const created =
      await createDefinition(
        cookie,
        {
          code: "test-finish-field",
          label: "Finish",
          dataType: "text",
          appliesTo: "product",
        },
      );

    expect(created.status).toBe(201);

    const id =
      await createdDefinitionId(
        created,
      );

    const first =
      await setValue(
        cookie,
        id,
        {
          value: "Brushed",
          sortOrder: 25,
          isVisible: true,
        },
      );

    expect(first.status).toBe(200);

    const firstBody =
      await first.json<{
        data: {
          value: {
            version: number;
          };
        };
      }>();

    expect(
      firstBody.data.value.version,
    ).toBe(1);

    const second =
      await setValue(
        cookie,
        id,
        {
          value: "Polished",
          version: 1,
          isVisible: false,
        },
      );

    expect(second.status).toBe(200);

    const secondBody =
      await second.json<{
        data: {
          value: {
            value: string;
            valueText: string;
            isVisible: boolean;
            version: number;
          };
        };
      }>();

    expect(
      secondBody.data.value,
    ).toMatchObject({
      value: "Polished",
      valueText: "Polished",
      isVisible: false,
      version: 2,
    });

    const stale =
      await setValue(
        cookie,
        id,
        {
          value: "Stale",
          version: 1,
        },
      );

    expect(stale.status).toBe(409);

    const deletion =
      await exports.default.fetch(
        new Request(
          `https://catalogue.test/api/v1/catalogue/items/${ITEM_PUBLIC_ID}/attributes/${id}`,
          {
            method: "DELETE",
            headers:
              tenantHeaders(cookie),
            body: JSON.stringify({
              version: 2,
            }),
          },
        ),
      );

    expect(deletion.status).toBe(204);

    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM item_attribute_values`,
    ).first<{ count: number }>();

    expect(row?.count).toBe(0);
  });

  it("keeps editors read-only for item values", async () => {
    const ownerCookie =
      await sessionCookie(OWNER_ID);

    const editorCookie =
      await sessionCookie(EDITOR_ID);

    const created =
      await createDefinition(
        ownerCookie,
        {
          label: "Owner Field",
          dataType: "text",
        },
      );

    const id =
      await createdDefinitionId(
        created,
      );

    const response =
      await setValue(
        editorCookie,
        id,
        {
          value: "Rejected",
        },
      );

    expect(response.status).toBe(403);
  });

  it("rejects unsafe attribute mutations from a foreign origin", async () => {
    const cookie =
      await sessionCookie(OWNER_ID);

    const response =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/catalogue/attributes",
          {
            method: "POST",
            headers: tenantHeaders(
              cookie,
              "https://evil.example",
            ),
            body: JSON.stringify({
              label: "Rejected Field",
              dataType: "text",
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
});

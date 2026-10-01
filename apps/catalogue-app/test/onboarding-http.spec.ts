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
import { SessionRepository } from "../src/worker/repositories";
import { AuthSessionService } from "../src/worker/services/auth-session-service";

const NOW = "2026-10-01T12:00:00.000Z";

const OWNER_ID = 98101;
const OWNER_PUBLIC_ID =
  "usr_11111111111111111111111111111111";
const EDITOR_ID = 98102;
const EDITOR_PUBLIC_ID =
  "usr_22222222222222222222222222222222";

const ORG_ID = 98201;
const ORG_PUBLIC_ID =
  "org_11111111111111111111111111111111";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM catalogue_website_settings",
    ),
    env.DB.prepare("DELETE FROM catalogue_items"),
    env.DB.prepare("DELETE FROM categories"),
    env.DB.prepare("DELETE FROM catalogues"),
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare(
      "DELETE FROM organization_members",
    ),
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
  await env.DB
    .prepare(
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
  await env.DB
    .prepare(
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
    "owner@example.com",
  );
  await insertUser(
    EDITOR_ID,
    EDITOR_PUBLIC_ID,
    "editor@example.com",
  );

  await env.DB
    .prepare(
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
       ) VALUES (?, ?, ?, NULL, 'UTC', 'active', NULL, ?, ?)`,
    )
    .bind(
      ORG_ID,
      ORG_PUBLIC_ID,
      "Starter Business",
      NOW,
      NOW,
    )
    .run();

  await env.DB
    .prepare(
      `INSERT INTO business_profiles (
         organization_id,
         legal_or_display_name,
         city,
         country_code,
         created_at,
         updated_at
       ) VALUES (?, ?, NULL, NULL, ?, ?)`,
    )
    .bind(
      ORG_ID,
      "Starter Business",
      NOW,
      NOW,
    )
    .run();

  await insertMembership(
    98301,
    "mem_11111111111111111111111111111111",
    OWNER_ID,
    "owner",
  );

  await insertMembership(
    98302,
    "mem_22222222222222222222222222222222",
    EDITOR_ID,
    "editor",
  );
}

async function completeOnboardingPrerequisites() {
  await env.DB.batch([
    env.DB
      .prepare(
        `UPDATE organizations
         SET
           country_code = 'IN',
           business_type_id = (
             SELECT id
             FROM business_types
             WHERE code = 'manufacturer'
             LIMIT 1
           ),
           updated_at = ?
         WHERE id = ?`,
      )
      .bind(NOW, ORG_ID),
    env.DB
      .prepare(
        `UPDATE business_profiles
         SET
           city = 'Mumbai',
           country_code = 'IN',
           updated_at = ?
         WHERE organization_id = ?`,
      )
      .bind(NOW, ORG_ID),
  ]);
}

async function createDraftCatalogueForOnboarding() {
  await env.DB
    .prepare(
      `INSERT INTO catalogues (
         public_id,
         organization_id,
         name,
         slug,
         mode,
         status,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, 'products', 'draft', ?, ?)`,
    )
    .bind(
      "cat_33333333333333333333333333333333",
      ORG_ID,
      "Starter Business",
      "draft-33333333333333333333333333333333",
      NOW,
      NOW,
    )
    .run();
}

async function completeThemePrerequisites() {
  await completeOnboardingPrerequisites();
  await createDraftCatalogueForOnboarding();

  await env.DB
    .prepare(
      `UPDATE business_profiles
       SET
         email = 'sales@example.com',
         updated_at = ?
       WHERE organization_id = ?`,
    )
    .bind(NOW, ORG_ID)
    .run();
}

async function completeSlugPrerequisites() {
  await completeThemePrerequisites();

  const catalogue = await env.DB
    .prepare(
      `SELECT id
       FROM catalogues
       WHERE organization_id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(ORG_ID)
    .first<{ id: number }>();

  if (!catalogue) {
    throw new Error(
      "catalogue_fixture_missing",
    );
  }

  await env.DB
    .prepare(
      `INSERT INTO catalogue_website_settings (
         catalogue_id,
         theme_code,
         created_at,
         updated_at
       ) VALUES (?, 'professional', ?, ?)`,
    )
    .bind(
      catalogue.id,
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
): Record<string, string> {
  return {
    cookie,
    [TENANT_HEADER]: ORG_PUBLIC_ID,
  };
}

describe("onboarding HTTP foundation", () => {
  beforeEach(async () => {
    await resetFixture();
    await createFixture();
  });

  it("requires authentication for onboarding state", async () => {
    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/state",
        {
          headers: {
            [TENANT_HEADER]: ORG_PUBLIC_ID,
          },
        },
      ),
    );

    expect(response.status).toBe(401);
  });

  it("requires explicit tenant selection for onboarding state", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/state",
        {
          headers: {
            cookie,
          },
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "organization_required",
    );
  });

  it("returns tenant-scoped onboarding state and reference data", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/state",
        {
          headers: tenantHeaders(cookie),
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "no-store",
    );
    expect(response.headers.get("x-request-id")).toBeTruthy();

    const body = await response.json<{
      data: {
        organization: {
          id: string;
          name: string;
          countryCode: string | null;
          businessType: unknown;
        };
        profile: {
          businessName: string;
          city: string | null;
        };
        catalogue: unknown;
        reference: {
          businessTypes: Array<{
            code: string;
          }>;
          themes: Array<{
            code: string;
          }>;
          suggestedAttributes: Array<{
            code: string;
          }>;
        };
        progress: {
          identityComplete: boolean;
          businessTypeComplete: boolean;
          catalogueStarted: boolean;
        };
      };
    }>();

    expect(body.data.organization).toMatchObject({
      id: ORG_PUBLIC_ID,
      name: "Starter Business",
      countryCode: null,
      businessType: null,
    });
    expect(body.data.profile).toMatchObject({
      businessName: "Starter Business",
      city: null,
    });
    expect(body.data.catalogue).toBeNull();
    expect(
      body.data.reference.businessTypes.map(
        (type) => type.code,
      ),
    ).toHaveLength(12);
    expect(
      body.data.reference.businessTypes[0]?.code,
    ).toBe("manufacturer");
    expect(
      body.data.reference.businessTypes.at(-1)?.code,
    ).toBe("other");
    expect(
      body.data.reference.themes.map(
        (theme) => theme.code,
      ),
    ).toEqual(["professional"]);
    expect(
      body.data.reference.suggestedAttributes,
    ).toEqual([]);
    expect(body.data.progress).toEqual({
      identityComplete: false,
      businessTypeComplete: false,
      catalogueStarted: false,
      contactsComplete: false,
      themeComplete: false,
      slugComplete: false,
    });

    expect(JSON.stringify(body)).not.toContain(
      `"organizationId":${ORG_ID}`,
    );
  });

  it("allows an owner to select an active business type and returns its suggested fields", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/business-type",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessTypeCode: "  MANUFACTURER  ",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        organization: {
          businessType: {
            code: string;
            name: string;
          } | null;
        };
        reference: {
          suggestedAttributes: Array<{
            code: string;
            label: string;
          }>;
        };
        progress: {
          businessTypeComplete: boolean;
        };
      };
    }>();

    expect(
      body.data.organization.businessType,
    ).toMatchObject({
      code: "manufacturer",
      name: "Manufacturer",
    });
    expect(
      body.data.progress.businessTypeComplete,
    ).toBe(true);
    expect(
      body.data.reference.suggestedAttributes.length,
    ).toBeGreaterThan(0);

    const persisted = await env.DB
      .prepare(
        `SELECT bt.code
         FROM organizations o
         INNER JOIN business_types bt
           ON bt.id = o.business_type_id
         WHERE o.id = ?`,
      )
      .bind(ORG_ID)
      .first<{ code: string }>();

    expect(persisted?.code).toBe("manufacturer");
  });

  it("rejects unavailable business types without changing the organization", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/business-type",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessTypeCode: "not-a-real-type",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "business_type_unavailable",
    );

    const organization = await env.DB
      .prepare(
        `SELECT business_type_id
         FROM organizations
         WHERE id = ?`,
      )
      .bind(ORG_ID)
      .first<{
        business_type_id: number | null;
      }>();

    expect(
      organization?.business_type_id,
    ).toBeNull();
  });

  it("rejects malformed business-type requests", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/business-type",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessTypeCode: "***",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe("invalid_request");
  });

  it("prevents editors from changing the business type", async () => {
    const cookie = await sessionCookie(EDITOR_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/business-type",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessTypeCode: "retailer",
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
      "insufficient_permissions",
    );

    const organization = await env.DB
      .prepare(
        `SELECT business_type_id
         FROM organizations
         WHERE id = ?`,
      )
      .bind(ORG_ID)
      .first<{
        business_type_id: number | null;
      }>();

    expect(
      organization?.business_type_id,
    ).toBeNull();
  });

  it("creates a draft catalogue when an owner selects catalogue mode", async () => {
    await completeOnboardingPrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/catalogue-mode",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "both",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        catalogue: {
          id: string;
          name: string;
          slug: string | null;
          slugClaimed: boolean;
          mode: string;
          status: string;
        } | null;
        progress: {
          catalogueStarted: boolean;
        };
      };
    }>();

    expect(body.data.catalogue).not.toBeNull();
    expect(body.data.catalogue?.id).toMatch(
      /^cat_[a-f0-9]{32}$/,
    );
    expect(body.data.catalogue).toMatchObject({
      name: "Starter Business",
      slug: null,
      slugClaimed: false,
      mode: "both",
      status: "draft",
    });
    expect(
      body.data.progress.catalogueStarted,
    ).toBe(true);

    const persisted = await env.DB
      .prepare(
        `SELECT
           public_id,
           slug,
           mode,
           status
         FROM catalogues
         WHERE organization_id = ?`,
      )
      .bind(ORG_ID)
      .first<{
        public_id: string;
        slug: string;
        mode: string;
        status: string;
      }>();

    expect(persisted?.public_id).toBe(
      body.data.catalogue?.id,
    );
    expect(persisted?.slug).toMatch(
      /^draft-[a-f0-9]{32}$/,
    );
    expect(persisted).toMatchObject({
      mode: "both",
      status: "draft",
    });
  });

  it("updates catalogue mode without creating a second catalogue", async () => {
    await completeOnboardingPrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    for (const mode of ["products", "services"]) {
      const response = await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/onboarding/catalogue-mode",
          {
            method: "PATCH",
            headers: {
              ...tenantHeaders(cookie),
              Origin: "https://catalogue.test",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mode,
            }),
          },
        ),
      );

      expect(response.status).toBe(200);
    }

    const rows = await env.DB
      .prepare(
        `SELECT mode
         FROM catalogues
         WHERE organization_id = ?
           AND deleted_at IS NULL
         ORDER BY id`,
      )
      .bind(ORG_ID)
      .all<{ mode: string }>();

    expect(rows.results).toEqual([
      {
        mode: "services",
      },
    ]);
  });

  it("requires completed identity and business type before catalogue mode", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/catalogue-mode",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "products",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "onboarding_prerequisite_required",
    );

    const count = await env.DB
      .prepare(
        `SELECT COUNT(*) AS count
         FROM catalogues
         WHERE organization_id = ?`,
      )
      .bind(ORG_ID)
      .first<{ count: number }>();

    expect(count?.count).toBe(0);
  });

  it("rejects invalid catalogue modes", async () => {
    await completeOnboardingPrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/catalogue-mode",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "inventory",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "invalid_request",
    );
  });

  it("prevents editors from starting a catalogue", async () => {
    await completeOnboardingPrerequisites();

    const cookie = await sessionCookie(EDITOR_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/catalogue-mode",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "products",
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
      "insufficient_permissions",
    );

    const count = await env.DB
      .prepare(
        `SELECT COUNT(*) AS count
         FROM catalogues
         WHERE organization_id = ?`,
      )
      .bind(ORG_ID)
      .first<{ count: number }>();

    expect(count?.count).toBe(0);
  });

  it("allows an owner to save normalized business contact details", async () => {
    await completeOnboardingPrerequisites();
    await createDraftCatalogueForOnboarding();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/contacts",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: " +91 22 5555 1234 ",
            whatsappNumber:
              " +91 (98765) 43210 ",
            email: " Sales@Example.COM ",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        profile: {
          phone: string | null;
          whatsappNumber: string | null;
          email: string | null;
        };
        progress: {
          contactsComplete: boolean;
        };
      };
    }>();

    expect(body.data.profile).toMatchObject({
      phone: "+91 22 5555 1234",
      whatsappNumber: "+919876543210",
      email: "sales@example.com",
    });
    expect(
      body.data.progress.contactsComplete,
    ).toBe(true);

    const persisted = await env.DB
      .prepare(
        `SELECT
           phone,
           whatsapp_number,
           email
         FROM business_profiles
         WHERE organization_id = ?`,
      )
      .bind(ORG_ID)
      .first<{
        phone: string | null;
        whatsapp_number: string | null;
        email: string | null;
      }>();

    expect(persisted).toMatchObject({
      phone: "+91 22 5555 1234",
      whatsapp_number: "+919876543210",
      email: "sales@example.com",
    });
  });

  it("supports partial contact updates without erasing existing details", async () => {
    await completeOnboardingPrerequisites();
    await createDraftCatalogueForOnboarding();

    await env.DB
      .prepare(
        `UPDATE business_profiles
         SET
           phone = '+91 22 4000 5000',
           whatsapp_number = '+919999999999',
           email = 'old@example.com'
         WHERE organization_id = ?`,
      )
      .bind(ORG_ID)
      .run();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/contacts",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "new@example.com",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        profile: {
          phone: string | null;
          whatsappNumber: string | null;
          email: string | null;
        };
      };
    }>();

    expect(body.data.profile).toEqual({
      businessName: "Starter Business",
      city: "Mumbai",
      phone: "+91 22 4000 5000",
      whatsappNumber: "+919999999999",
      email: "new@example.com",
    });
  });

  it("requires a started catalogue before contact details", async () => {
    await completeOnboardingPrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/contacts",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "sales@example.com",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "onboarding_prerequisite_required",
    );
  });

  it("rejects invalid or empty contact details", async () => {
    await completeOnboardingPrerequisites();
    await createDraftCatalogueForOnboarding();

    const cookie = await sessionCookie(OWNER_ID);

    const invalidEmail = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/contacts",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "not-an-email",
          }),
        },
      ),
    );

    expect(invalidEmail.status).toBe(400);

    const invalidBody = await invalidEmail.json<{
      error: {
        code: string;
      };
    }>();

    expect(invalidBody.error.code).toBe(
      "invalid_contact_details",
    );

    const emptySet = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/contacts",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone: null,
            whatsappNumber: null,
            email: null,
          }),
        },
      ),
    );

    expect(emptySet.status).toBe(400);

    const emptyBody = await emptySet.json<{
      error: {
        code: string;
      };
    }>();

    expect(emptyBody.error.code).toBe(
      "invalid_contact_details",
    );
  });

  it("prevents editors from changing business contact details", async () => {
    await completeOnboardingPrerequisites();
    await createDraftCatalogueForOnboarding();

    const cookie = await sessionCookie(EDITOR_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/contacts",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "editor@example.com",
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
      "insufficient_permissions",
    );

    const persisted = await env.DB
      .prepare(
        `SELECT email
         FROM business_profiles
         WHERE organization_id = ?`,
      )
      .bind(ORG_ID)
      .first<{
        email: string | null;
      }>();

    expect(persisted?.email).toBeNull();
  });

  it("creates website settings when an owner selects an active theme", async () => {
    await completeThemePrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/theme",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            themeCode: "  PROFESSIONAL  ",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        website: {
          theme: {
            code: string;
            name: string;
          } | null;
        };
        progress: {
          themeComplete: boolean;
        };
      };
    }>();

    expect(body.data.website.theme).toMatchObject({
      code: "professional",
      name: "Professional",
    });
    expect(
      body.data.progress.themeComplete,
    ).toBe(true);

    const persisted = await env.DB
      .prepare(
        `SELECT
           s.theme_code,
           s.version
         FROM catalogue_website_settings s
         INNER JOIN catalogues c
           ON c.id = s.catalogue_id
         WHERE c.organization_id = ?`,
      )
      .bind(ORG_ID)
      .first<{
        theme_code: string;
        version: number;
      }>();

    expect(persisted).toEqual({
      theme_code: "professional",
      version: 1,
    });
  });

  it("updates the existing website settings row instead of creating another", async () => {
    await completeThemePrerequisites();

    const catalogue = await env.DB
      .prepare(
        `SELECT id
         FROM catalogues
         WHERE organization_id = ?`,
      )
      .bind(ORG_ID)
      .first<{ id: number }>();

    if (!catalogue) {
      throw new Error("catalogue_fixture_missing");
    }

    await env.DB
      .prepare(
        `INSERT INTO catalogue_website_settings (
           catalogue_id,
           theme_code,
           created_at,
           updated_at
         ) VALUES (?, 'professional', ?, ?)`,
      )
      .bind(catalogue.id, NOW, NOW)
      .run();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/theme",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            themeCode: "professional",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    const rows = await env.DB
      .prepare(
        `SELECT theme_code, version
         FROM catalogue_website_settings
         WHERE catalogue_id = ?`,
      )
      .bind(catalogue.id)
      .all<{
        theme_code: string;
        version: number;
      }>();

    expect(rows.results).toEqual([
      {
        theme_code: "professional",
        version: 2,
      },
    ]);
  });

  it("requires completed contacts before theme selection", async () => {
    await completeOnboardingPrerequisites();
    await createDraftCatalogueForOnboarding();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/theme",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            themeCode: "professional",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "onboarding_prerequisite_required",
    );

    const count = await env.DB
      .prepare(
        `SELECT COUNT(*) AS count
         FROM catalogue_website_settings`,
      )
      .first<{ count: number }>();

    expect(count?.count).toBe(0);
  });

  it("rejects unavailable themes without creating website settings", async () => {
    await completeThemePrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/theme",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            themeCode: "future-theme",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "theme_unavailable",
    );

    const count = await env.DB
      .prepare(
        `SELECT COUNT(*) AS count
         FROM catalogue_website_settings`,
      )
      .first<{ count: number }>();

    expect(count?.count).toBe(0);
  });

  it("prevents editors from changing the catalogue theme", async () => {
    await completeThemePrerequisites();

    const cookie = await sessionCookie(EDITOR_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/theme",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            themeCode: "professional",
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
      "insufficient_permissions",
    );

    const count = await env.DB
      .prepare(
        `SELECT COUNT(*) AS count
         FROM catalogue_website_settings`,
      )
      .first<{ count: number }>();

    expect(count?.count).toBe(0);
  });

  it("reports normalized public slug availability for the current catalogue", async () => {
    await completeSlugPrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/slug-availability?slug=Acme%20Industrial%20Tools",
        {
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
          },
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        slug: string;
        available: boolean;
        reason: string;
      };
    }>();

    expect(body.data).toEqual({
      slug: "acme-industrial-tools",
      available: true,
      reason: "available",
    });
  });

  it("keeps reserved and onboarding-internal public slugs unavailable", async () => {
    await completeSlugPrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const reserved = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/slug-availability?slug=billing",
        {
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
          },
        },
      ),
    );

    expect(reserved.status).toBe(200);

    const reservedBody = await reserved.json<{
      data: {
        available: boolean;
        reason: string;
      };
    }>();

    expect(reservedBody.data).toMatchObject({
      available: false,
      reason: "reserved",
    });

    const internal = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/slug-availability?slug=draft-my-catalogue",
        {
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
          },
        },
      ),
    );

    expect(internal.status).toBe(200);

    const internalBody = await internal.json<{
      data: {
        available: boolean;
        reason: string;
      };
    }>();

    expect(internalBody.data).toMatchObject({
      available: false,
      reason: "reserved",
    });
  });

  it("allows an owner to claim a normalized public catalogue slug", async () => {
    await completeSlugPrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/slug",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slug: "  Acme Industrial Tools  ",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        catalogue: {
          slug: string | null;
          slugClaimed: boolean;
        } | null;
        progress: {
          slugComplete: boolean;
        };
      };
    }>();

    expect(body.data.catalogue).toMatchObject({
      slug: "acme-industrial-tools",
      slugClaimed: true,
    });

    expect(
      body.data.progress.slugComplete,
    ).toBe(true);

    const persisted = await env.DB
      .prepare(
        `SELECT slug
         FROM catalogues
         WHERE organization_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(ORG_ID)
      .first<{ slug: string }>();

    expect(persisted?.slug).toBe(
      "acme-industrial-tools",
    );
  });

  it("rejects a public slug already claimed by another active catalogue", async () => {
    await completeSlugPrerequisites();

    await env.DB
      .prepare(
        `INSERT INTO organizations (
           id,
           public_id,
           name,
           timezone,
           status,
           created_at,
           updated_at
         ) VALUES (
           98202,
           'org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
           'Another Catalogue Owner',
           'Asia/Kolkata',
           'active',
           ?,
           ?
         )`,
      )
      .bind(NOW, NOW)
      .run();

    await env.DB
      .prepare(
        `INSERT INTO catalogues (
           public_id,
           organization_id,
           name,
           slug,
           mode,
           status,
           created_at,
           updated_at
         ) VALUES (
           'cat_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
           98202,
           'Already Claimed',
           'claimed-business',
           'products',
           'draft',
           ?,
           ?
         )`,
      )
      .bind(NOW, NOW)
      .run();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/slug",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slug: "claimed-business",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "slug_unavailable",
    );

    const unchanged = await env.DB
      .prepare(
        `SELECT slug
         FROM catalogues
         WHERE organization_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(ORG_ID)
      .first<{ slug: string }>();

    expect(unchanged?.slug).toMatch(
      /^draft-[a-f0-9]{32}$/,
    );
  });

  it("requires a selected theme before public slug claiming", async () => {
    await completeThemePrerequisites();

    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/slug",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slug: "needs-theme-first",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "onboarding_prerequisite_required",
    );
  });

  it("prevents editors from claiming a public catalogue slug", async () => {
    await completeSlugPrerequisites();

    const cookie = await sessionCookie(EDITOR_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/slug",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            slug: "editor-cannot-claim",
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
      "insufficient_permissions",
    );

    const unchanged = await env.DB
      .prepare(
        `SELECT slug
         FROM catalogues
         WHERE organization_id = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(ORG_ID)
      .first<{ slug: string }>();

    expect(unchanged?.slug).toMatch(
      /^draft-[a-f0-9]{32}$/,
    );
  });

  it("rejects malformed identity input", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/identity",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessName: "",
            countryCode: "IND",
            city: "",
          }),
        },
      ),
    );

    expect(response.status).toBe(400);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe("invalid_request");
  });

  it("rejects an unsafe onboarding update from a foreign origin", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/identity",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://evil.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessName: "Acme Industries",
            countryCode: "IN",
            city: "Mumbai",
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

  it("allows owner identity updates and persists normalized values", async () => {
    const cookie = await sessionCookie(OWNER_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/identity",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessName: "  Acme   Industries  ",
            countryCode: "in",
            city: "  Mumbai  ",
          }),
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        organization: {
          name: string;
          countryCode: string | null;
        };
        profile: {
          businessName: string;
          city: string | null;
        };
        progress: {
          identityComplete: boolean;
        };
      };
    }>();

    expect(body.data.organization).toMatchObject({
      name: "Acme Industries",
      countryCode: "IN",
    });
    expect(body.data.profile).toMatchObject({
      businessName: "Acme Industries",
      city: "Mumbai",
    });
    expect(
      body.data.progress.identityComplete,
    ).toBe(true);

    const persisted = await env.DB
      .prepare(
        `SELECT
           o.name,
           o.country_code,
           bp.legal_or_display_name,
           bp.city,
           bp.country_code AS profile_country_code
         FROM organizations o
         INNER JOIN business_profiles bp
           ON bp.organization_id = o.id
         WHERE o.id = ?`,
      )
      .bind(ORG_ID)
      .first<{
        name: string;
        country_code: string | null;
        legal_or_display_name: string;
        city: string | null;
        profile_country_code: string | null;
      }>();

    expect(persisted).toMatchObject({
      name: "Acme Industries",
      country_code: "IN",
      legal_or_display_name: "Acme Industries",
      city: "Mumbai",
      profile_country_code: "IN",
    });
  });

  it("prevents editors from changing onboarding identity", async () => {
    const cookie = await sessionCookie(EDITOR_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/onboarding/identity",
        {
          method: "PATCH",
          headers: {
            ...tenantHeaders(cookie),
            Origin: "https://catalogue.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            businessName: "Editor Rename",
            countryCode: "IN",
            city: "Mumbai",
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
      "insufficient_permissions",
    );

    const organization = await env.DB
      .prepare(
        "SELECT name FROM organizations WHERE id = ?",
      )
      .bind(ORG_ID)
      .first<{ name: string }>();

    expect(organization?.name).toBe(
      "Starter Business",
    );
  });
});

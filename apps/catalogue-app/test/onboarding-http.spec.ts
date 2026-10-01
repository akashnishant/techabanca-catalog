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
    expect(body.data.progress).toEqual({
      identityComplete: false,
      businessTypeComplete: false,
      catalogueStarted: false,
    });

    expect(JSON.stringify(body)).not.toContain(
      `"organizationId":${ORG_ID}`,
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

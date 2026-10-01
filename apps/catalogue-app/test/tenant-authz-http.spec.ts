import { env, exports } from "cloudflare:workers";
import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { SessionRepository } from "../src/worker/repositories";
import { TENANT_HEADER } from "../src/worker/middleware/require-tenant-access";
import { AuthSessionService } from "../src/worker/services/auth-session-service";

const NOW = "2026-09-30T18:00:00.000Z";

const USER_A_ID = 96101;
const USER_A_PUBLIC_ID =
  "usr_dddddddddddddddddddddddddddddddd";
const USER_B_ID = 96102;
const USER_B_PUBLIC_ID =
  "usr_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const ORG_A_ID = 96201;
const ORG_A_PUBLIC_ID =
  "org_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORG_B_ID = 96202;
const ORG_B_PUBLIC_ID =
  "org_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ORG_C_ID = 96203;
const ORG_C_PUBLIC_ID =
  "org_cccccccccccccccccccccccccccccccc";

async function resetFixture() {
  await env.DB.batch([
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      email,
      "test-password-hash",
      email,
      "active",
      NOW,
      NOW,
    )
    .run();
}

async function insertOrganization(
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
       created_at,
       updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      publicId,
      name,
      "IN",
      "Asia/Kolkata",
      "active",
      NOW,
      NOW,
    )
    .run();
}

async function insertMembership(input: {
  id: number;
  publicId: string;
  organizationId: number;
  userId: number;
  role: "owner" | "admin" | "editor";
  status?: "active" | "invited" | "suspended";
}) {
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.publicId,
      input.organizationId,
      input.userId,
      input.role,
      input.status ?? "active",
      NOW,
      NOW,
    )
    .run();
}

async function sessionCookie(
  userId: number,
): Promise<{
  cookie: string;
  sessionPublicId: string;
}> {
  const service = new AuthSessionService(
    new SessionRepository(env.DB),
  );

  const created = await service.create(
    userId,
    new Date(),
  );

  return {
    cookie:
      `__Host-techabanca_catalogue_session=${created.token}`,
    sessionPublicId: created.sessionPublicId,
  };
}

async function createFixture() {
  await insertUser(
    USER_A_ID,
    USER_A_PUBLIC_ID,
    "user-a@example.com",
  );
  await insertUser(
    USER_B_ID,
    USER_B_PUBLIC_ID,
    "user-b@example.com",
  );

  await insertOrganization(
    ORG_A_ID,
    ORG_A_PUBLIC_ID,
    "Alpha Industries",
  );
  await insertOrganization(
    ORG_B_ID,
    ORG_B_PUBLIC_ID,
    "Beta Traders",
  );
  await insertOrganization(
    ORG_C_ID,
    ORG_C_PUBLIC_ID,
    "Gamma Services",
  );

  await insertMembership({
    id: 96301,
    publicId:
      "mem_11111111111111111111111111111111",
    organizationId: ORG_A_ID,
    userId: USER_A_ID,
    role: "owner",
  });
  await insertMembership({
    id: 96302,
    publicId:
      "mem_22222222222222222222222222222222",
    organizationId: ORG_B_ID,
    userId: USER_A_ID,
    role: "editor",
    status: "suspended",
  });
  await insertMembership({
    id: 96303,
    publicId:
      "mem_33333333333333333333333333333333",
    organizationId: ORG_C_ID,
    userId: USER_B_ID,
    role: "admin",
  });
}

describe("authenticated tenant authorization boundary", () => {
  beforeEach(async () => {
    await resetFixture();
    await createFixture();
  });

  it("requires an authenticated session before listing organizations", async () => {
    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/auth/organizations",
      ),
    );

    expect(response.status).toBe(401);

    const body = await response.json<{
      error: {
        code: string;
      };
    }>();

    expect(body.error.code).toBe(
      "authentication_required",
    );
  });

  it("lists only active organizations belonging to the authenticated user", async () => {
    const { cookie } = await sessionCookie(USER_A_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/auth/organizations",
        {
          headers: {
            cookie,
          },
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
        organizations: Array<{
          id: string;
          name: string;
          role: string;
        }>;
      };
    }>();

    expect(body.data.organizations).toEqual([
      {
        id: ORG_A_PUBLIC_ID,
        name: "Alpha Industries",
        role: "owner",
      },
    ]);

    expect(
      JSON.stringify(body),
    ).not.toContain(ORG_A_ID.toString());
  });

  it("requires an explicit organization selection for tenant context", async () => {
    const { cookie } = await sessionCookie(USER_A_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/auth/tenant-context",
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

  it("resolves the authenticated user's active tenant and role", async () => {
    const { cookie } = await sessionCookie(USER_A_ID);

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/auth/tenant-context",
        {
          headers: {
            cookie,
            [TENANT_HEADER]: ORG_A_PUBLIC_ID,
          },
        },
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        organization: {
          id: string;
          name: string;
          role: string;
        };
      };
    }>();

    expect(body.data.organization).toEqual({
      id: ORG_A_PUBLIC_ID,
      name: "Alpha Industries",
      role: "owner",
    });
  });

  it("rejects suspended memberships and cross-tenant organization IDs", async () => {
    const { cookie } = await sessionCookie(USER_A_ID);

    for (const organizationPublicId of [
      ORG_B_PUBLIC_ID,
      ORG_C_PUBLIC_ID,
    ]) {
      const response = await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/auth/tenant-context",
          {
            headers: {
              cookie,
              [TENANT_HEADER]: organizationPublicId,
            },
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
        "tenant_access_denied",
      );
    }
  });

  it("rejects revoked sessions before tenant resolution", async () => {
    const { cookie, sessionPublicId } =
      await sessionCookie(USER_A_ID);

    const repository = new SessionRepository(env.DB);

    await repository.revokeForUser(
      USER_A_ID,
      sessionPublicId,
      new Date().toISOString(),
    );

    const response = await exports.default.fetch(
      new Request(
        "https://catalogue.test/api/v1/auth/tenant-context",
        {
          headers: {
            cookie,
            [TENANT_HEADER]: ORG_A_PUBLIC_ID,
          },
        },
      ),
    );

    expect(response.status).toBe(401);
  });
});

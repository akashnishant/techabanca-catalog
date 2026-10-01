import { env, exports } from "cloudflare:workers";
import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  RegistrationRepository,
} from "../src/worker/repositories";
import {
  PasswordHasher,
} from "../src/worker/security/password-hasher";

const COOKIE_NAME =
  "techabanca_catalogue_session";
const PASSWORD =
  "Strong registration password 42!";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function register(input?: {
  email?: string;
  password?: string;
  displayName?: string;
  organizationName?: string;
}) {
  return exports.default.fetch(
    new Request(
      "https://catalogue.test/api/v1/auth/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email:
            input?.email
            ?? "Owner@Example.COM",
          password:
            input?.password
            ?? PASSWORD,
          displayName:
            input?.displayName
            ?? "  Akash  Nishant  ",
          organizationName:
            input?.organizationName
            ?? "  Example  Industries  ",
        }),
      },
    ),
  );
}

function cookiePair(
  setCookie: string,
): string {
  return setCookie.split(";", 1)[0];
}

describe("registration and tenant bootstrap", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("creates a user, owner organization, profile, membership, and authenticated session atomically", async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe(
      "no-store",
    );
    expect(response.headers.get("x-request-id")).toBeTruthy();

    const setCookie =
      response.headers.get("set-cookie") ?? "";

    expect(setCookie).toContain(
      `${COOKIE_NAME}=`,
    );
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");

    const body = await response.json<{
      data: {
        user: {
          id: string;
          email: string;
          displayName: string;
          emailVerified: boolean;
        };
        organization: {
          id: string;
          name: string;
          role: string;
        };
        session: {
          expiresAt: string;
        };
      };
    }>();

    expect(body.data.user.email).toBe(
      "owner@example.com",
    );
    expect(body.data.user.displayName).toBe(
      "Akash Nishant",
    );
    expect(body.data.user.emailVerified).toBe(false);

    expect(body.data.organization.name).toBe(
      "Example Industries",
    );
    expect(body.data.organization.role).toBe(
      "owner",
    );

    const user = await env.DB.prepare(
      `SELECT
         id,
         password_hash
       FROM users
       WHERE public_id = ?`,
    )
      .bind(body.data.user.id)
      .first<{
        id: number;
        password_hash: string;
      }>();

    expect(user).not.toBeNull();
    expect(user?.password_hash).not.toBe(
      PASSWORD,
    );

    const hasher = new PasswordHasher();

    await expect(
      hasher.verify(
        PASSWORD,
        user?.password_hash ?? "",
      ),
    ).resolves.toBe(true);

    const organization =
      await env.DB.prepare(
        `SELECT
           id
         FROM organizations
         WHERE public_id = ?`,
      )
        .bind(body.data.organization.id)
        .first<{ id: number }>();

    expect(organization).not.toBeNull();

    const membership =
      await env.DB.prepare(
        `SELECT
           role,
           status
         FROM organization_members
         WHERE organization_id = ?
           AND user_id = ?`,
      )
        .bind(
          organization?.id,
          user?.id,
        )
        .first<{
          role: string;
          status: string;
        }>();

    expect(membership).toEqual({
      role: "owner",
      status: "active",
    });

    const profile =
      await env.DB.prepare(
        `SELECT
           legal_or_display_name
         FROM business_profiles
         WHERE organization_id = ?`,
      )
        .bind(organization?.id)
        .first<{
          legal_or_display_name: string;
        }>();

    expect(
      profile?.legal_or_display_name,
    ).toBe("Example Industries");

    const session =
      await env.DB.prepare(
        `SELECT
           token_hash,
           revoked_at
         FROM sessions
         WHERE user_id = ?`,
      )
        .bind(user?.id)
        .first<{
          token_hash: string;
          revoked_at: string | null;
        }>();

    const rawToken =
      cookiePair(setCookie).split("=")[1];

    expect(session?.token_hash).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(session?.token_hash).not.toBe(
      rawToken,
    );
    expect(session?.revoked_at).toBeNull();
  });

  it("can immediately use the new session to list the bootstrapped organization", async () => {
    const registration = await register();
    const setCookie =
      registration.headers.get("set-cookie") ?? "";
    const cookie = cookiePair(setCookie);

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

    const body = await response.json<{
      data: {
        organizations: Array<{
          id: string;
          name: string;
          role: string;
        }>;
      };
    }>();

    expect(body.data.organizations).toHaveLength(1);
    expect(body.data.organizations[0]).toMatchObject({
      name: "Example Industries",
      role: "owner",
    });
  });

  it("uses a generic conflict response for an existing email without creating another tenant", async () => {
    const first = await register();

    expect(first.status).toBe(201);

    const second = await register({
      organizationName:
        "Should Not Be Created",
    });

    expect(second.status).toBe(409);

    const body = await second.json<{
      error: {
        code: string;
        message: string;
      };
    }>();

    expect(body.error.code).toBe(
      "account_unavailable",
    );
    expect(body.error.message).not.toContain(
      "owner@example.com",
    );

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users_count,
         (SELECT COUNT(*) FROM organizations)
           AS organizations_count,
         (SELECT COUNT(*) FROM sessions)
           AS sessions_count`,
    ).first<{
      users_count: number;
      organizations_count: number;
      sessions_count: number;
    }>();

    expect(counts).toEqual({
      users_count: 1,
      organizations_count: 1,
      sessions_count: 1,
    });
  });

  it("rejects weak or malformed registration payloads before creating records", async () => {
    const weak = await register({
      password: "short",
    });

    expect(weak.status).toBe(400);

    const missingName =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/auth/register",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body: JSON.stringify({
              email: "new@example.com",
              password: PASSWORD,
              displayName: "User",
            }),
          },
        ),
      );

    expect(missingName.status).toBe(400);

    const counts = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM users)
           AS users_count,
         (SELECT COUNT(*) FROM organizations)
           AS organizations_count`,
    ).first<{
      users_count: number;
      organizations_count: number;
    }>();

    expect(counts).toEqual({
      users_count: 0,
      organizations_count: 0,
    });
  });

  it("rolls back the whole bootstrap batch if a later statement fails", async () => {
    await env.DB.prepare(
      `INSERT INTO organizations (
         public_id,
         name,
         timezone,
         status,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "org_ffffffffffffffffffffffffffffffff",
        "Existing Organization",
        "UTC",
        "active",
        "2026-10-01T10:00:00.000Z",
        "2026-10-01T10:00:00.000Z",
      )
      .run();

    const repository =
      new RegistrationRepository(env.DB);

    await expect(
      repository.createOwnerAccount({
        userPublicId:
          "usr_10101010101010101010101010101010",
        email:
          "rollback@example.com",
        passwordHash:
          "test-password-hash",
        displayName:
          "Rollback User",
        organizationPublicId:
          "org_ffffffffffffffffffffffffffffffff",
        organizationName:
          "Duplicate Organization",
        membershipPublicId:
          "mem_20202020202020202020202020202020",
        sessionPublicId:
          "ses_30303030303030303030303030303030",
        sessionTokenHash:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sessionExpiresAt:
          "2026-11-01T10:00:00.000Z",
        createdAt:
          "2026-10-01T10:00:00.000Z",
      }),
    ).rejects.toBeTruthy();

    const user = await env.DB.prepare(
      `SELECT id
       FROM users
       WHERE email = ?`,
    )
      .bind("rollback@example.com")
      .first<{ id: number }>();

    expect(user).toBeNull();

    const membership = await env.DB.prepare(
      `SELECT id
       FROM organization_members
       WHERE public_id = ?`,
    )
      .bind(
        "mem_20202020202020202020202020202020",
      )
      .first<{ id: number }>();

    expect(membership).toBeNull();

    const session = await env.DB.prepare(
      `SELECT id
       FROM sessions
       WHERE public_id = ?`,
    )
      .bind(
        "ses_30303030303030303030303030303030",
      )
      .first<{ id: number }>();

    expect(session).toBeNull();
  });
});

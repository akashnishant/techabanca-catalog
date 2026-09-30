import { env, exports } from "cloudflare:workers";
import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const USER_ID = 95101;
const USER_PUBLIC_ID =
  "usr_cccccccccccccccccccccccccccccccc";
const EMAIL = "owner@example.com";
const PASSWORD = "TechabancaTestPassword!42";
const PASSWORD_HASH =
  "pbkdf2-sha256$600000$101112131415161718191a1b1c1d1e1f$a3be905efe864c4c9d133ac6bf32f95490995ad5d15d9cff3dfc4d5eacecf3cd";
const COOKIE_NAME =
  "techabanca_catalogue_session";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function insertUser(input?: {
  status?: "active" | "suspended";
  deletedAt?: string | null;
}) {
  const now = "2026-09-30T17:15:00.000Z";

  await env.DB.prepare(
    `INSERT INTO users (
       id,
       public_id,
       email,
       password_hash,
       display_name,
       status,
       email_verified_at,
       created_at,
       updated_at,
       deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      USER_ID,
      USER_PUBLIC_ID,
      EMAIL,
      PASSWORD_HASH,
      "Catalogue Owner",
      input?.status ?? "active",
      "2026-09-01T10:00:00.000Z",
      now,
      now,
      input?.deletedAt ?? null,
    )
    .run();
}

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0];
}

async function login(
  email = EMAIL,
  password = PASSWORD,
) {
  return exports.default.fetch(
    "https://catalogue.test/api/v1/auth/login",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    },
  );
}

describe("authentication HTTP API", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("logs in with a secure HttpOnly SameSite cookie without returning the token", async () => {
    await insertUser();

    const response = await login(
      "  OWNER@EXAMPLE.COM ",
      PASSWORD,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "no-store",
    );
    expect(response.headers.get("x-request-id")).toBeTruthy();

    const setCookie = response.headers.get("set-cookie");

    expect(setCookie).toContain(
      `${COOKIE_NAME}=`,
    );
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");

    const body = await response.json<{
      data: {
        user: {
          id: string;
          email: string;
          displayName: string;
          emailVerified: boolean;
        };
        session: {
          expiresAt: string;
        };
      };
    }>();

    expect(body.data.user).toEqual({
      id: USER_PUBLIC_ID,
      email: EMAIL,
      displayName: "Catalogue Owner",
      emailVerified: true,
    });
    expect(body.data.session.expiresAt).toBeTruthy();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain(PASSWORD_HASH);

    const stored = await env.DB.prepare(
      `SELECT token_hash
       FROM sessions
       WHERE user_id = ?`,
    )
      .bind(USER_ID)
      .first<{ token_hash: string }>();

    expect(stored?.token_hash).toMatch(/^[0-9a-f]{64}$/);

    const token = cookiePair(setCookie ?? "")
      .split("=")[1];

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.token_hash).not.toBe(token);
  });

  it("returns the same generic error for an unknown email and a wrong password", async () => {
    await insertUser();

    const wrongPassword = await login(
      EMAIL,
      "wrong password",
    );
    const unknownUser = await login(
      "nobody@example.com",
      PASSWORD,
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);

    const wrongBody = await wrongPassword.json<{
      error: {
        code: string;
        message: string;
      };
    }>();
    const unknownBody = await unknownUser.json<{
      error: {
        code: string;
        message: string;
      };
    }>();

    expect(wrongBody.error.code).toBe(
      "invalid_credentials",
    );
    expect(unknownBody.error.code).toBe(
      "invalid_credentials",
    );
    expect(wrongBody.error.message).toBe(
      unknownBody.error.message,
    );

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sessions",
    ).first<{ count: number }>();

    expect(count?.count).toBe(0);
  });

  it("rejects suspended and soft-deleted users", async () => {
    await insertUser({
      status: "suspended",
    });

    const suspended = await login();

    expect(suspended.status).toBe(401);

    await resetFixture();

    await insertUser({
      deletedAt: "2026-09-30T17:00:00.000Z",
    });

    const deleted = await login();

    expect(deleted.status).toBe(401);
  });

  it("validates an authenticated session from the cookie", async () => {
    await insertUser();

    const loginResponse = await login();
    const setCookie =
      loginResponse.headers.get("set-cookie") ?? "";

    const response = await exports.default.fetch(
      "https://catalogue.test/api/v1/auth/session",
      {
        headers: {
          cookie: cookiePair(setCookie),
        },
      },
    );

    expect(response.status).toBe(200);

    const body = await response.json<{
      data: {
        user: {
          id: string;
          email: string;
        };
      };
    }>();

    expect(body.data.user).toMatchObject({
      id: USER_PUBLIC_ID,
      email: EMAIL,
    });
  });

  it("logs out idempotently, clears the cookie, and revokes the active session", async () => {
    await insertUser();

    const loginResponse = await login();
    const setCookie =
      loginResponse.headers.get("set-cookie") ?? "";
    const cookie = cookiePair(setCookie);

    const logoutResponse = await exports.default.fetch(
      "https://catalogue.test/api/v1/auth/logout",
      {
        method: "POST",
        headers: {
          cookie,
        },
      },
    );

    expect(logoutResponse.status).toBe(204);

    const cleared =
      logoutResponse.headers.get("set-cookie") ?? "";

    expect(cleared).toContain(`${COOKIE_NAME}=`);
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("HttpOnly");
    expect(cleared).toContain("Secure");
    expect(cleared).toContain("SameSite=Lax");

    const stored = await env.DB.prepare(
      `SELECT revoked_at
       FROM sessions
       WHERE user_id = ?`,
    )
      .bind(USER_ID)
      .first<{ revoked_at: string | null }>();

    expect(stored?.revoked_at).not.toBeNull();

    const sessionAfterLogout = await exports.default.fetch(
      "https://catalogue.test/api/v1/auth/session",
      {
        headers: {
          cookie,
        },
      },
    );

    expect(sessionAfterLogout.status).toBe(401);

    const secondLogout = await exports.default.fetch(
      "https://catalogue.test/api/v1/auth/logout",
      {
        method: "POST",
        headers: {
          cookie,
        },
      },
    );

    expect(secondLogout.status).toBe(204);
  });

  it("rejects malformed or oversized login input", async () => {
    const malformed = await exports.default.fetch(
      "https://catalogue.test/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{not-json",
      },
    );

    expect(malformed.status).toBe(400);

    const oversized = await exports.default.fetch(
      "https://catalogue.test/api/v1/auth/login",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: EMAIL,
          password: "x".repeat(513),
        }),
      },
    );

    expect(oversized.status).toBe(400);
  });
});

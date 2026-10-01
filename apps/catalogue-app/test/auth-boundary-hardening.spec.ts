import { env, exports } from "cloudflare:workers";
import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

const EMAIL = "security@example.com";
const PASSWORD =
  "TechabancaTestPassword!42";
const REGISTRATION_PASSWORD =
  "Strong auth boundary password 42!";

async function resetFixture() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM business_profiles"),
    env.DB.prepare("DELETE FROM organization_members"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM organizations"),
    env.DB.prepare("DELETE FROM users"),
  ]);
}

async function register(
  baseUrl: string,
  email: string,
  headers?: Record<string, string>,
) {
  return exports.default.fetch(
    new Request(
      `${baseUrl}/api/v1/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          ...headers,
        },
        body: JSON.stringify({
          email,
          password:
            REGISTRATION_PASSWORD,
          displayName:
            "Security User",
          organizationName:
            "Security Test Organization",
        }),
      },
    ),
  );
}

async function login(
  baseUrl: string,
  headers?: Record<string, string>,
) {
  return exports.default.fetch(
    new Request(
      `${baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          ...headers,
        },
        body: JSON.stringify({
          email: EMAIL,
          password: PASSWORD,
        }),
      },
    ),
  );
}

describe("authentication boundary hardening", () => {
  beforeEach(async () => {
    await resetFixture();
  });

  it("uses a __Host cookie on HTTPS with no Domain attribute", async () => {
    const response = await register(
      "https://catalogue.test",
      "secure-cookie@example.com",
      {
        Origin:
          "https://catalogue.test",
        "Sec-Fetch-Site":
          "same-origin",
      },
    );

    expect(response.status).toBe(201);

    const cookie =
      response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain(
      "__Host-techabanca_catalogue_session=",
    );
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Domain=");
  });

  it("uses a localhost-friendly non-Secure cookie on HTTP", async () => {
    const response = await register(
      "http://catalogue.test",
      "local-cookie@example.com",
      {
        Origin:
          "http://catalogue.test",
        "Sec-Fetch-Site":
          "same-origin",
      },
    );

    expect(response.status).toBe(201);

    const cookie =
      response.headers.get("set-cookie") ?? "";

    expect(cookie).toContain(
      "techabanca_catalogue_session=",
    );
    expect(cookie).not.toContain(
      "__Host-techabanca_catalogue_session=",
    );
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
  });

  it("rejects an unsafe request with a foreign Origin before authentication logic", async () => {
    const response = await login(
      "https://catalogue.test",
      {
        Origin:
          "https://attacker.example",
        "Sec-Fetch-Site":
          "cross-site",
      },
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

    const sessions = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sessions",
    ).first<{ count: number }>();

    expect(sessions?.count).toBe(0);
  });

  it("rejects cross-site Fetch Metadata even when Origin is absent", async () => {
    const response = await login(
      "https://catalogue.test",
      {
        "Sec-Fetch-Site":
          "cross-site",
      },
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

  it("allows a same-origin unsafe request to reach normal request validation", async () => {
    const response =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/v1/auth/register",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
              Origin:
                "https://catalogue.test",
              "Sec-Fetch-Site":
                "same-origin",
            },
            body: JSON.stringify({
              email: "bad",
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

  it("adds baseline security headers to API responses", async () => {
    const response =
      await exports.default.fetch(
        new Request(
          "https://catalogue.test/api/health",
        ),
      );

    expect(response.status).toBe(200);
    expect(
      response.headers.get(
        "x-content-type-options",
      ),
    ).toBe("nosniff");
    expect(
      response.headers.get(
        "cross-origin-resource-policy",
      ),
    ).toBe("same-origin");
    expect(
      response.headers.get(
        "referrer-policy",
      ),
    ).toBe("no-referrer");
  });
});

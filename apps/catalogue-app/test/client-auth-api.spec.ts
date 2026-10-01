import {
  describe,
  expect,
  it,
} from "vitest";
import {
  AuthApiError,
  createAuthApi,
} from "../src/client/auth-api";

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

describe("browser auth API client", () => {
  it("treats a 401 session response as signed out", async () => {
    const fetcher = (async () =>
      jsonResponse(
        {
          error: {
            code: "authentication_required",
            message:
              "Authentication is required.",
          },
        },
        401,
      )) as typeof fetch;

    const api = createAuthApi(fetcher);

    await expect(
      api.session(),
    ).resolves.toBeNull();
  });

  it("posts login JSON with same-origin credentials", async () => {
    let capturedPath = "";
    let capturedInit:
      | RequestInit
      | undefined;

    const fetcher = (async (
      input,
      init,
    ) => {
      capturedPath = String(input);
      capturedInit = init;

      return jsonResponse({
        data: {
          user: {
            id:
              "usr_11111111111111111111111111111111",
            email: "owner@example.com",
            displayName: "Owner",
            emailVerified: false,
          },
          session: {
            expiresAt:
              "2026-11-01T00:00:00.000Z",
          },
        },
      });
    }) as typeof fetch;

    const api = createAuthApi(fetcher);

    const result = await api.login({
      email: "owner@example.com",
      password: "password",
    });

    expect(capturedPath).toBe(
      "/api/v1/auth/login",
    );
    expect(capturedInit?.method).toBe(
      "POST",
    );
    expect(capturedPath.startsWith("/api/")).toBe(true);

    const headers = new Headers(
      capturedInit?.headers,
    );

    expect(
      headers.get("content-type"),
    ).toBe("application/json");
    expect(result.user.email).toBe(
      "owner@example.com",
    );
  });

  it("surfaces structured API errors", async () => {
    const fetcher = (async () =>
      jsonResponse(
        {
          error: {
            code: "invalid_credentials",
            message:
              "The email or password is incorrect.",
            requestId: "req_test",
          },
        },
        401,
      )) as typeof fetch;

    const api = createAuthApi(fetcher);

    try {
      await api.login({
        email: "owner@example.com",
        password: "wrong",
      });

      throw new Error(
        "Expected login to fail.",
      );
    } catch (error) {
      expect(error).toBeInstanceOf(
        AuthApiError,
      );

      const authError =
        error as AuthApiError;

      expect(authError.status).toBe(401);
      expect(authError.code).toBe(
        "invalid_credentials",
      );
      expect(authError.requestId).toBe(
        "req_test",
      );
    }
  });

  it("loads active organizations for the authenticated session", async () => {
    const fetcher = (async () =>
      jsonResponse({
        data: {
          organizations: [
            {
              id:
                "org_11111111111111111111111111111111",
              name: "Example Industries",
              role: "owner",
            },
          ],
        },
      })) as typeof fetch;

    const api = createAuthApi(fetcher);
    const result =
      await api.organizations();

    expect(result.organizations).toEqual([
      {
        id:
          "org_11111111111111111111111111111111",
        name: "Example Industries",
        role: "owner",
      },
    ]);
  });
});

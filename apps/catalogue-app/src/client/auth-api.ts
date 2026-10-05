export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};

export type AuthOrganization = {
  id: string;
  name: string;
  role: "owner" | "admin" | "editor";
};

export type SessionData = {
  user: AuthUser;
  session: {
    expiresAt: string;
  };
};

export type RegistrationData = SessionData & {
  organization: AuthOrganization;
};

type OrganizationsData = {
  organizations: AuthOrganization[];
};

type ApiSuccess<T> = {
  data: T;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
};

export class AuthApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

type Fetcher = typeof fetch;

async function readJson(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiErrorFromResponse(
  response: Response,
  body: unknown,
): AuthApiError {
  const parsed =
    typeof body === "object" && body !== null
      ? (body as ApiErrorBody)
      : {};

  return new AuthApiError(
    response.status,
    parsed.error?.code ?? "request_failed",
    parsed.error?.message
      ?? "The request could not be completed.",
    parsed.error?.requestId,
  );
}

export function createAuthApi(
  fetcher: Fetcher = fetch,
) {
  async function request<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(init?.headers);

    headers.set("Accept", "application/json");

    // Auth endpoints are relative same-origin URLs. Browser fetch
    // sends same-origin credentials by default, so the HttpOnly
    // session cookie is included without exposing it to client code.
    const response = await fetcher(path, {
      ...init,
      headers,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const body = await readJson(response);

    if (!response.ok) {
      throw apiErrorFromResponse(
        response,
        body,
      );
    }

    if (
      typeof body !== "object"
      || body === null
      || !("data" in body)
    ) {
      throw new AuthApiError(
        500,
        "invalid_response",
        "The server returned an invalid response.",
      );
    }

    return (body as ApiSuccess<T>).data;
  }

  async function postJson<T>(
    path: string,
    payload: unknown,
  ): Promise<T> {
    return request<T>(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  return {
    async session(): Promise<SessionData | null> {
      try {
        return await request<SessionData>(
          "/api/v1/auth/session",
        );
      } catch (error) {
        if (
          error instanceof AuthApiError
          && error.status === 401
        ) {
          return null;
        }

        throw error;
      }
    },

    security() {
      return request<{ enabled: boolean; siteKey: string | null }>("/api/v1/auth/security");
    },

    login(input: {
      email: string;
      password: string;
      turnstileToken?: string;
    }) {
      return postJson<SessionData>(
        "/api/v1/auth/login",
        input,
      );
    },

    register(input: {
      email: string;
      password: string;
      displayName: string;
      organizationName: string;
      turnstileToken?: string;
    }) {
      return postJson<RegistrationData>(
        "/api/v1/auth/register",
        input,
      );
    },

    organizations() {
      return request<OrganizationsData>(
        "/api/v1/auth/organizations",
      );
    },

    logout() {
      return request<void>(
        "/api/v1/auth/logout",
        {
          method: "POST",
        },
      );
    },
  };
}

export const authApi = createAuthApi();

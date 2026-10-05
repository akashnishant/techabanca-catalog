import { readRequestJson } from "../http/request-json";
import { normalizeLoginEmail } from "@techabanca/domain";
import { Hono, type Context } from "hono";
import {
  RegistrationRepository,
  SessionRepository,
  UserAuthRepository,
} from "../repositories";
import {
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from "../http/session-cookie";
import { PasswordHasher } from "../security/password-hasher";
import { AuthSessionService } from "../services/auth-session-service";
import { RegistrationService } from "../services/registration-service";

import type { CatalogueAppEnv } from "../app-env";
import { AuthProtectionError, authSecurityConfiguration, consumeAuthBudget, verifyAuthChallenge } from "../services/auth-abuse-service";

type LoginInput = {
  email: string;
  password: string;
  turnstileToken?: unknown;
};

const DUMMY_PASSWORD_HASH =
  "pbkdf2-sha256$600000$000102030405060708090a0b0c0d0e0f$41e9d93f06bb6a386029e218529b867631a4a025a572fd884f536a71a9227900";

function requestId(c: Context): string {
  const id = crypto.randomUUID();
  c.header("X-Request-Id", id);
  c.header("Cache-Control", "no-store");
  return id;
}

function errorResponse(
  c: Context,
  status: 400 | 401 | 409 | 429 | 500 | 503,
  code: string,
  message: string,
) {
  const id = requestId(c);

  return c.json(
    {
      error: {
        code,
        message,
        requestId: id,
      },
    },
    status,
  );
}

async function parseLoginInput(
  c: Context,
): Promise<LoginInput | null> {
  let body: unknown;

  try {
    body = await readRequestJson(c.req.raw, 16384);
  } catch {
    return null;
  }

  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
    || Object.keys(body).some(key => !["email", "password", "turnstileToken"].includes(key))
    || !("email" in body)
    || !("password" in body)
  ) {
    return null;
  }

  const email = (body as Record<string, unknown>).email;
  const password = (body as Record<string, unknown>).password;

  if (
    typeof email !== "string"
    || typeof password !== "string"
  ) {
    return null;
  }

  const normalizedEmail = normalizeLoginEmail(email);

  if (
    normalizedEmail.length < 3
    || normalizedEmail.length > 320
    || !normalizedEmail.includes("@")
    || password.length === 0
    || password.length > 512
  ) {
    return null;
  }

  return {
    email: normalizedEmail,
    password,
    turnstileToken: (body as Record<string, unknown>).turnstileToken,
  };
}

type RegistrationInput = {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
  turnstileToken?: unknown;
};

async function parseRegistrationInput(
  c: Context,
): Promise<RegistrationInput | null> {
  let body: unknown;

  try {
    body = await readRequestJson(c.req.raw, 16384);
  } catch {
    return null;
  }

  if (
    typeof body !== "object"
    || body === null
    || Array.isArray(body)
    || Object.keys(body).some(key => !["email", "password", "displayName", "organizationName", "turnstileToken"].includes(key))
  ) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const email = record.email;
  const password = record.password;
  const displayName = record.displayName;
  const organizationName = record.organizationName;

  if (
    typeof email !== "string"
    || typeof password !== "string"
    || typeof displayName !== "string"
    || typeof organizationName !== "string"
  ) {
    return null;
  }

  const normalizedEmail = normalizeLoginEmail(email);
  const cleanDisplayName = displayName.trim();
  const cleanOrganizationName =
    organizationName.trim();

  if (
    normalizedEmail.length < 3
    || normalizedEmail.length > 320
    || !normalizedEmail.includes("@")
    || password.length < 12
    || password.length > 128
    || cleanDisplayName.length < 1
    || cleanDisplayName.length > 120
    || cleanOrganizationName.length < 1
    || cleanOrganizationName.length > 160
  ) {
    return null;
  }

  return {
    email: normalizedEmail,
    password,
    displayName: cleanDisplayName,
    organizationName: cleanOrganizationName,
    turnstileToken: record.turnstileToken,
  };
}

function sessionPayload(session: {
  userPublicId: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  expiresAt: string;
}) {
  return {
    user: {
      id: session.userPublicId,
      email: session.email,
      displayName: session.displayName,
      emailVerified: session.emailVerifiedAt !== null,
    },
    session: {
      expiresAt: session.expiresAt,
    },
  };
}

export function createAuthRoutes() {
  const auth = new Hono<CatalogueAppEnv>();

  auth.get("/security", c => {
    requestId(c);
    try { return c.json({ data: authSecurityConfiguration(c.env) }); }
    catch { return errorResponse(c, 503, "authentication_unavailable", "Sign in is temporarily unavailable. Please try again."); }
  });

  auth.post("/register", async (c) => {
    const input = await parseRegistrationInput(c);

    if (!input) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        "Valid account and business details are required.",
      );
    }

    try {
      authSecurityConfiguration(c.env);
      await consumeAuthBudget(c.env, c.req.raw, "register", input.email);
      await verifyAuthChallenge(c.env, c.req.raw, "register", input.turnstileToken);
      const registration =
        new RegistrationService(
          new RegistrationRepository(c.env.DB),
        );

      const result = await registration.register(
        input,
        new Date(),
      );

      if (result.kind === "conflict") {
        return errorResponse(
          c,
          409,
          "account_unavailable",
          "An account could not be created with those details.",
        );
      }

      writeSessionCookie(
        c,
        result.account.token,
      );
      requestId(c);

      return c.json(
        {
          data: {
            user: {
              id: result.account.user.publicId,
              email: result.account.user.email,
              displayName:
                result.account.user.displayName,
              emailVerified: false,
            },
            organization: {
              id:
                result.account.organization.publicId,
              name:
                result.account.organization.name,
              role:
                result.account.organization.role,
            },
            session: {
              expiresAt:
                result.account.expiresAt,
            },
          },
        },
        201,
      );
    } catch (error) {
      if (error instanceof AuthProtectionError) {
        if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
        return errorResponse(c, error.status, error.code, error.message);
      }
      return errorResponse(
        c,
        500,
        "internal_error",
        "The account could not be created.",
      );
    }
  });

  auth.post("/login", async (c) => {
    const input = await parseLoginInput(c);

    if (!input) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        "A valid email and password are required.",
      );
    }

    try {
      authSecurityConfiguration(c.env);
      await consumeAuthBudget(c.env, c.req.raw, "login", input.email);
      await verifyAuthChallenge(c.env, c.req.raw, "login", input.turnstileToken);
      const users = new UserAuthRepository(c.env.DB);
      const sessions = new SessionRepository(c.env.DB);
      const sessionService = new AuthSessionService(sessions);
      const passwordHasher = new PasswordHasher();

      const user = await users.findActiveByEmail(input.email);

      const passwordMatches = await passwordHasher.verify(
        input.password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (!user || !passwordMatches) {
        return errorResponse(
          c,
          401,
          "invalid_credentials",
          "The email or password is incorrect.",
        );
      }

      const created = await sessionService.create(
        user.id,
        new Date(),
      );

      writeSessionCookie(c, created.token);
      requestId(c);

      return c.json({
        data: {
          user: {
            id: user.publicId,
            email: user.email,
            displayName: user.displayName,
            emailVerified: user.emailVerifiedAt !== null,
          },
          session: {
            expiresAt: created.expiresAt,
          },
        },
      });
    } catch (error) {
      if (error instanceof AuthProtectionError) {
        if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
        return errorResponse(c, error.status, error.code, error.message);
      }
      return errorResponse(
        c,
        500,
        "internal_error",
        "Authentication could not be completed.",
      );
    }
  });

  auth.get("/session", async (c) => {
    const token = readSessionCookie(c);

    if (!token) {
      return errorResponse(
        c,
        401,
        "authentication_required",
        "Authentication is required.",
      );
    }

    try {
      const sessions = new SessionRepository(c.env.DB);
      const service = new AuthSessionService(sessions);
      const session = await service.authenticate(
        token,
        new Date(),
      );

      if (!session) {
        clearSessionCookie(c);

        return errorResponse(
          c,
          401,
          "authentication_required",
          "Authentication is required.",
        );
      }

      requestId(c);

      return c.json({
        data: sessionPayload(session),
      });
    } catch {
      return errorResponse(
        c,
        503,
        "authentication_unavailable",
        "The session is temporarily unavailable. Please try again.",
      );
    }
  });

  auth.post("/logout", async (c) => {
    const token = readSessionCookie(c);

    try {
      if (token) {
        const sessions = new SessionRepository(c.env.DB);
        const service = new AuthSessionService(sessions);
        const now = new Date();
        const session = await service.authenticate(
          token,
          now,
        );

        if (session) {
          await service.revoke(
            session.userId,
            session.sessionPublicId,
            now,
          );
        }
      }

      clearSessionCookie(c);
      requestId(c);

      return c.body(null, 204);
    } catch {
      clearSessionCookie(c);

      return errorResponse(
        c,
        500,
        "internal_error",
        "Logout could not be completed.",
      );
    }
  });

  return auth;
}

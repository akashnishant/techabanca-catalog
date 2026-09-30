import { normalizeLoginEmail } from "@techabanca/domain";
import { Hono, type Context } from "hono";
import {
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

type CatalogueAppEnv = {
  Bindings: Env;
};

type LoginInput = {
  email: string;
  password: string;
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
  status: 400 | 401 | 500,
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
    body = await c.req.json();
  } catch {
    return null;
  }

  if (
    typeof body !== "object"
    || body === null
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
    } catch {
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
      clearSessionCookie(c);

      return errorResponse(
        c,
        500,
        "internal_error",
        "The session could not be validated.",
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

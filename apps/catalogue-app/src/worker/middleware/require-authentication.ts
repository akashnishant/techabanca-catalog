import { createMiddleware } from "hono/factory";
import type { CatalogueAppEnv } from "../app-env";
import { apiError } from "../http/api-response";
import {
  clearSessionCookie,
  readSessionCookie,
} from "../http/session-cookie";
import { SessionRepository } from "../repositories";
import { AuthSessionService } from "../services/auth-session-service";

export const requireAuthentication =
  createMiddleware<CatalogueAppEnv>(
    async (c, next) => {
      const token = readSessionCookie(c);

      if (!token) {
        return apiError(
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

          return apiError(
            c,
            401,
            "authentication_required",
            "Authentication is required.",
          );
        }

        c.set("authSession", session);
      } catch {
        return apiError(
          c,
          503,
          "authentication_unavailable",
          "Authentication is temporarily unavailable. Please try again.",
        );
      }

      await next();
    },
  );

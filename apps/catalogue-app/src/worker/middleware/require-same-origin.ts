import { createMiddleware } from "hono/factory";
import type { CatalogueAppEnv } from "../app-env";
import { apiError } from "../http/api-response";

const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

function normalizedOrigin(
  value: string,
): string | null {
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

export const requireSameOrigin =
  createMiddleware<CatalogueAppEnv>(
    async (c, next) => {
      if (SAFE_METHODS.has(c.req.method)) {
        await next();
        return;
      }

      const requestOrigin =
        new URL(c.req.url).origin;

      const originHeader =
        c.req.header("Origin");

      if (originHeader) {
        const origin =
          normalizedOrigin(originHeader);

        if (
          !origin
          || origin !== originHeader
          || origin !== requestOrigin
        ) {
          return apiError(
            c,
            403,
            "cross_origin_request_rejected",
            "The request origin is not allowed.",
          );
        }
      }

      if (!originHeader) {
        const refererHeader =
          c.req.header("Referer");

        if (refererHeader) {
          const refererOrigin =
            normalizedOrigin(refererHeader);

          if (
            !refererOrigin
            || refererOrigin !== requestOrigin
          ) {
            return apiError(
              c,
              403,
              "cross_origin_request_rejected",
              "The request origin is not allowed.",
            );
          }
        }
      }

      const fetchSite =
        c.req.header("Sec-Fetch-Site")
          ?.toLowerCase();

      if (
        fetchSite !== undefined
        && fetchSite !== "same-origin"
        && fetchSite !== "none"
      ) {
        return apiError(
          c,
          403,
          "cross_origin_request_rejected",
          "The request origin is not allowed.",
        );
      }

      await next();
    },
  );

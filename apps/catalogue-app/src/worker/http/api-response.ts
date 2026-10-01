import type { Context } from "hono";
import type { CatalogueAppEnv } from "../app-env";

export type ApiErrorStatus = 400 | 401 | 403 | 500;

export function ensureApiRequestId(
  c: Context<CatalogueAppEnv>,
): string {
  const existing = c.get("requestId");

  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();

  c.set("requestId", id);
  c.header("X-Request-Id", id);
  c.header("Cache-Control", "no-store");

  return id;
}

export function apiError(
  c: Context<CatalogueAppEnv>,
  status: ApiErrorStatus,
  code: string,
  message: string,
) {
  const requestId = ensureApiRequestId(c);

  return c.json(
    {
      error: {
        code,
        message,
        requestId,
      },
    },
    status,
  );
}

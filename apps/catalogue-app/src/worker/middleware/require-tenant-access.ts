import { createMiddleware } from "hono/factory";
import type { CatalogueAppEnv } from "../app-env";
import { apiError } from "../http/api-response";
import { TenantAccessRepository } from "../repositories";

export const TENANT_HEADER =
  "X-Techabanca-Organization";

export const requireTenantAccess =
  createMiddleware<CatalogueAppEnv>(
    async (c, next) => {
      const organizationPublicId =
        c.req.header(TENANT_HEADER)?.trim();

      if (!organizationPublicId) {
        return apiError(
          c,
          400,
          "organization_required",
          "An organization must be selected.",
        );
      }

      const session = c.get("authSession");

      try {
        const repository =
          new TenantAccessRepository(c.env.DB);

        const access =
          await repository.resolveAccessForUser(
            session.userId,
            organizationPublicId,
          );

        if (!access) {
          return apiError(
            c,
            403,
            "tenant_access_denied",
            "Access to the selected organization is not allowed.",
          );
        }

        c.set("tenantAccess", access);
        await next();
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "Organization access could not be validated.",
        );
      }
    },
  );

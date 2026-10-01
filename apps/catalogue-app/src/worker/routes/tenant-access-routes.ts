import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import { ensureApiRequestId } from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { TenantAccessRepository } from "../repositories";

export function createTenantAccessRoutes() {
  const routes = new Hono<CatalogueAppEnv>();

  routes.get(
    "/organizations",
    requireAuthentication,
    async (c) => {
      const session = c.get("authSession");
      const repository =
        new TenantAccessRepository(c.env.DB);

      const organizations =
        await repository.listForUser(session.userId);

      ensureApiRequestId(c);

      return c.json({
        data: {
          organizations: organizations.map(
            (organization) => ({
              id: organization.organizationPublicId,
              name: organization.organizationName,
              role: organization.role,
            }),
          ),
        },
      });
    },
  );

  routes.get(
    "/tenant-context",
    requireAuthentication,
    requireTenantAccess,
    (c) => {
      const access = c.get("tenantAccess");

      ensureApiRequestId(c);

      return c.json({
        data: {
          organization: {
            id: access.tenant.organizationPublicId,
            name: access.organizationName,
            role: access.role,
          },
        },
      });
    },
  );

  return routes;
}

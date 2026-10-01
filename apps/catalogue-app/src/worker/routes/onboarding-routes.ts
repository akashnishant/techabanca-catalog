import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import {
  apiError,
  ensureApiRequestId,
} from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { OnboardingRepository } from "../repositories";
import {
  OnboardingService,
  type OnboardingIdentityInput,
} from "../services/onboarding-service";

function onboardingService(
  db: D1Database,
): OnboardingService {
  return new OnboardingService(
    new OnboardingRepository(db),
  );
}

function parseIdentityInput(
  value: unknown,
): OnboardingIdentityInput | null {
  if (
    typeof value !== "object"
    || value === null
  ) {
    return null;
  }

  const input = value as Record<string, unknown>;

  if (
    typeof input.businessName !== "string"
    || typeof input.countryCode !== "string"
    || typeof input.city !== "string"
  ) {
    return null;
  }

  const businessName =
    input.businessName.trim().replace(/\s+/g, " ");
  const countryCode =
    input.countryCode.trim().toUpperCase();
  const city =
    input.city.trim().replace(/\s+/g, " ");

  if (
    businessName.length < 1
    || businessName.length > 160
    || !/^[A-Z]{2}$/.test(countryCode)
    || city.length < 1
    || city.length > 120
  ) {
    return null;
  }

  return {
    businessName,
    countryCode,
    city,
  };
}

export function createOnboardingRoutes() {
  const routes = new Hono<CatalogueAppEnv>();

  routes.get(
    "/state",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      try {
        const access = c.get("tenantAccess");
        const service = onboardingService(c.env.DB);
        const state = await service.state(
          access.tenant,
        );

        ensureApiRequestId(c);

        return c.json({
          data: state,
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "Onboarding state could not be loaded.",
        );
      }
    },
  );

  routes.patch(
    "/business-type",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      const access = c.get("tenantAccess");

      let body: unknown;

      try {
        body = await c.req.json();
      } catch {
        return apiError(
          c,
          400,
          "invalid_request",
          "A valid JSON request body is required.",
        );
      }

      if (
        typeof body !== "object"
        || body === null
        || typeof (
          body as Record<string, unknown>
        ).businessTypeCode !== "string"
      ) {
        return apiError(
          c,
          400,
          "invalid_request",
          "A business type is required.",
        );
      }

      const businessTypeCode = (
        body as Record<string, string>
      ).businessTypeCode.trim();

      if (
        businessTypeCode.length < 2
        || businessTypeCode.length > 64
        || !/^[A-Za-z0-9-]+$/.test(
          businessTypeCode,
        )
      ) {
        return apiError(
          c,
          400,
          "invalid_request",
          "A valid business type is required.",
        );
      }

      try {
        const service = onboardingService(c.env.DB);
        const result =
          await service.updateBusinessType(
            access.tenant,
            access.role,
            businessTypeCode,
            new Date(),
          );

        if (result.kind === "forbidden") {
          return apiError(
            c,
            403,
            "insufficient_permissions",
            "Owner or admin access is required.",
          );
        }

        if (result.kind === "unavailable") {
          return apiError(
            c,
            400,
            "business_type_unavailable",
            "The selected business type is not available.",
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: result.state,
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "Business type could not be updated.",
        );
      }
    },
  );

  routes.patch(
    "/identity",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      const access = c.get("tenantAccess");

      let body: unknown;

      try {
        body = await c.req.json();
      } catch {
        return apiError(
          c,
          400,
          "invalid_request",
          "A valid JSON request body is required.",
        );
      }

      const input = parseIdentityInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "Business name, two-letter country code, and city are required.",
        );
      }

      try {
        const service = onboardingService(c.env.DB);
        const result = await service.updateIdentity(
          access.tenant,
          access.role,
          input,
          new Date(),
        );

        if (result.kind === "forbidden") {
          return apiError(
            c,
            403,
            "insufficient_permissions",
            "Owner or admin access is required.",
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: result.state,
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "Business identity could not be updated.",
        );
      }
    },
  );

  return routes;
}

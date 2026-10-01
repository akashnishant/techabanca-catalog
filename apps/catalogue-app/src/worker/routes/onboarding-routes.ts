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
    "/contacts",
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
      ) {
        return apiError(
          c,
          400,
          "invalid_request",
          "Contact details are required.",
        );
      }

      const record =
        body as Record<string, unknown>;

      const allowedKeys = [
        "phone",
        "whatsappNumber",
        "email",
      ] as const;

      const providedKeys =
        allowedKeys.filter((key) =>
          Object.prototype.hasOwnProperty.call(
            record,
            key,
          ),
        );

      if (providedKeys.length === 0) {
        return apiError(
          c,
          400,
          "invalid_request",
          "Provide at least one contact field.",
        );
      }

      for (const key of providedKeys) {
        const value = record[key];

        if (
          value !== null
          && typeof value !== "string"
        ) {
          return apiError(
            c,
            400,
            "invalid_request",
            "Contact fields must be text or null.",
          );
        }
      }

      try {
        const service = onboardingService(c.env.DB);
        const result =
          await service.updateContacts(
            access.tenant,
            access.role,
            {
              phone:
                Object.prototype.hasOwnProperty.call(
                  record,
                  "phone",
                )
                  ? (record.phone as string | null)
                  : undefined,
              whatsappNumber:
                Object.prototype.hasOwnProperty.call(
                  record,
                  "whatsappNumber",
                )
                  ? (record.whatsappNumber as string | null)
                  : undefined,
              email:
                Object.prototype.hasOwnProperty.call(
                  record,
                  "email",
                )
                  ? (record.email as string | null)
                  : undefined,
            },
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

        if (
          result.kind ===
          "prerequisite_required"
        ) {
          return apiError(
            c,
            400,
            "onboarding_prerequisite_required",
            "Start the catalogue before adding contact details.",
          );
        }

        if (result.kind === "invalid") {
          return apiError(
            c,
            400,
            "invalid_contact_details",
            "Provide at least one valid phone, WhatsApp number, or email address.",
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
          "Contact details could not be updated.",
        );
      }
    },
  );

  routes.patch(
    "/catalogue-mode",
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
        ).mode !== "string"
      ) {
        return apiError(
          c,
          400,
          "invalid_request",
          "A catalogue mode is required.",
        );
      }

      const mode = (
        body as Record<string, string>
      ).mode.trim().toLowerCase();

      if (
        mode !== "products"
        && mode !== "services"
        && mode !== "both"
      ) {
        return apiError(
          c,
          400,
          "invalid_request",
          "Catalogue mode must be products, services, or both.",
        );
      }

      try {
        const service = onboardingService(c.env.DB);
        const result =
          await service.updateCatalogueMode(
            access.tenant,
            access.role,
            mode,
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

        if (
          result.kind ===
          "prerequisite_required"
        ) {
          return apiError(
            c,
            400,
            "onboarding_prerequisite_required",
            "Complete business identity and business type first.",
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
          "Catalogue mode could not be updated.",
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

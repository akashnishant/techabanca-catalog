import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import {
  apiError,
  ensureApiRequestId,
} from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import { CategoryRepository } from "../repositories";
import {
  CategoryService,
  type CategoryCreateInput,
  type CategoryDeleteInput,
  type CategoryMutationResult,
  type CategoryUpdateInput,
} from "../services/category-service";

function categoryService(
  db: D1Database,
): CategoryService {
  return new CategoryService(
    new CategoryRepository(db),
  );
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

function parseCreateInput(
  value: unknown,
): CategoryCreateInput | null {
  if (!isObject(value) || typeof value.name !== "string") {
    return null;
  }

  if (
    value.slug !== undefined
    && typeof value.slug !== "string"
  ) {
    return null;
  }

  if (
    value.description !== undefined
    && value.description !== null
    && typeof value.description !== "string"
  ) {
    return null;
  }

  if (
    value.parentId !== undefined
    && value.parentId !== null
    && typeof value.parentId !== "string"
  ) {
    return null;
  }

  if (
    value.sortOrder !== undefined
    && typeof value.sortOrder !== "number"
  ) {
    return null;
  }

  if (
    value.isVisible !== undefined
    && typeof value.isVisible !== "boolean"
  ) {
    return null;
  }

  return {
    name: value.name,
    slug: value.slug as string | undefined,
    description: value.description as
      | string
      | null
      | undefined,
    parentId: value.parentId as
      | string
      | null
      | undefined,
    sortOrder: value.sortOrder as
      | number
      | undefined,
    isVisible: value.isVisible as
      | boolean
      | undefined,
  };
}

function parseUpdateInput(
  value: unknown,
): CategoryUpdateInput | null {
  if (
    !isObject(value)
    || typeof value.version !== "number"
  ) {
    return null;
  }

  if (
    value.name !== undefined
    && typeof value.name !== "string"
  ) {
    return null;
  }

  if (
    value.slug !== undefined
    && typeof value.slug !== "string"
  ) {
    return null;
  }

  if (
    value.description !== undefined
    && value.description !== null
    && typeof value.description !== "string"
  ) {
    return null;
  }

  if (
    value.parentId !== undefined
    && value.parentId !== null
    && typeof value.parentId !== "string"
  ) {
    return null;
  }

  if (
    value.sortOrder !== undefined
    && typeof value.sortOrder !== "number"
  ) {
    return null;
  }

  if (
    value.isVisible !== undefined
    && typeof value.isVisible !== "boolean"
  ) {
    return null;
  }

  return {
    version: value.version,
    name: value.name as string | undefined,
    slug: value.slug as string | undefined,
    description: value.description as
      | string
      | null
      | undefined,
    parentId: value.parentId as
      | string
      | null
      | undefined,
    sortOrder: value.sortOrder as
      | number
      | undefined,
    isVisible: value.isVisible as
      | boolean
      | undefined,
  };
}

function parseDeleteInput(
  value: unknown,
): CategoryDeleteInput | null {
  if (
    !isObject(value)
    || typeof value.version !== "number"
  ) {
    return null;
  }

  return {
    version: value.version,
  };
}

function categoryPayload(category: {
  publicId: string;
  parentPublicId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  version: number;
}) {
  return {
    id: category.publicId,
    parentId: category.parentPublicId,
    name: category.name,
    slug: category.slug,
    description: category.description,
    sortOrder: category.sortOrder,
    isVisible: category.isVisible,
    version: category.version,
  };
}

function mutationError(
  c: Parameters<typeof apiError>[0],
  result: Exclude<
    CategoryMutationResult,
    { kind: "created" | "updated" }
  >,
) {
  switch (result.kind) {
    case "forbidden":
      return apiError(
        c,
        403,
        "insufficient_permissions",
        "Owner or admin access is required.",
      );
    case "catalogue_required":
      return apiError(
        c,
        400,
        "catalogue_required",
        "Create the catalogue before managing categories.",
      );
    case "invalid":
      return apiError(
        c,
        400,
        "invalid_category",
        "Provide valid category details.",
      );
    case "not_found":
      return apiError(
        c,
        404,
        "category_not_found",
        "Category was not found.",
      );
    case "invalid_parent":
      return apiError(
        c,
        400,
        "invalid_category_parent",
        "Choose a root category from this catalogue as the parent.",
      );
    case "slug_conflict":
      return apiError(
        c,
        409,
        "category_slug_unavailable",
        "That category URL slug is already in use.",
      );
    case "version_conflict":
      return apiError(
        c,
        409,
        "category_version_conflict",
        "This category changed since it was loaded. Refresh and try again.",
      );
    case "has_children":
      return apiError(
        c,
        409,
        "category_has_children",
        "A category with active children cannot become a child category.",
      );
  }
}

export function createCategoryRoutes() {
  const routes = new Hono<CatalogueAppEnv>();

  routes.get(
    "/categories",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      try {
        const access = c.get("tenantAccess");
        const result = await categoryService(
          c.env.DB,
        ).list(access.tenant);

        if (result.kind === "catalogue_required") {
          return apiError(
            c,
            400,
            "catalogue_required",
            "Create the catalogue before managing categories.",
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: {
            catalogueId: result.catalogue.publicId,
            categories:
              result.categories.map(categoryPayload),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "Categories could not be loaded.",
        );
      }
    },
  );

  routes.get(
    "/categories/:categoryId",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      try {
        const access = c.get("tenantAccess");
        const result = await categoryService(
          c.env.DB,
        ).get(
          access.tenant,
          c.req.param("categoryId"),
        );

        if (result.kind === "invalid") {
          return apiError(
            c,
            400,
            "invalid_category_id",
            "A valid category ID is required.",
          );
        }

        if (result.kind === "not_found") {
          return apiError(
            c,
            404,
            "category_not_found",
            "Category was not found.",
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: {
            category: categoryPayload(
              result.category,
            ),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The category could not be loaded.",
        );
      }
    },
  );

  routes.post(
    "/categories",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
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

      const input = parseCreateInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "Valid category details are required.",
        );
      }

      try {
        const access = c.get("tenantAccess");
        const result = await categoryService(
          c.env.DB,
        ).create(
          access.tenant,
          access.role,
          input,
          new Date(),
        );

        if (result.kind !== "created") {
          return mutationError(c, result);
        }

        ensureApiRequestId(c);

        return c.json(
          {
            data: {
              category: categoryPayload(
                result.category,
              ),
            },
          },
          201,
        );
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The category could not be created.",
        );
      }
    },
  );

  routes.patch(
    "/categories/:categoryId",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
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

      const input = parseUpdateInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "Valid category changes and a version are required.",
        );
      }

      try {
        const access = c.get("tenantAccess");
        const result = await categoryService(
          c.env.DB,
        ).update(
          access.tenant,
          access.role,
          c.req.param("categoryId"),
          input,
          new Date(),
        );

        if (result.kind !== "updated") {
          return mutationError(c, result);
        }

        ensureApiRequestId(c);

        return c.json({
          data: {
            category: categoryPayload(
              result.category,
            ),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The category could not be updated.",
        );
      }
    },
  );

  routes.delete(
    "/categories/:categoryId",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
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

      const input = parseDeleteInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "A valid category version is required.",
        );
      }

      try {
        const access = c.get("tenantAccess");
        const result = await categoryService(
          c.env.DB,
        ).delete(
          access.tenant,
          access.role,
          c.req.param("categoryId"),
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

        if (result.kind === "invalid") {
          return apiError(
            c,
            400,
            "invalid_category",
            "Provide a valid category ID and version.",
          );
        }

        if (result.kind === "not_found") {
          return apiError(
            c,
            404,
            "category_not_found",
            "Category was not found.",
          );
        }

        if (result.kind === "version_conflict") {
          return apiError(
            c,
            409,
            "category_version_conflict",
            "This category changed since it was loaded. Refresh and try again.",
          );
        }

        ensureApiRequestId(c);

        return c.body(null, 204);
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The category could not be deleted.",
        );
      }
    },
  );

  return routes;
}
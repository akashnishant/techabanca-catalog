import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import {
  apiError,
  ensureApiRequestId,
} from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import {
  CatalogueItemRepository,
  CategoryRepository,
  type CatalogueItemRecord,
  type CatalogueItemStatus,
  type CatalogueItemType,
} from "../repositories";
import {
  ItemService,
  type ItemCreateInput,
  type ItemDeleteInput,
  type ItemMutationFailure,
  type ItemUpdateInput,
} from "../services/item-service";

function itemService(
  db: D1Database,
): ItemService {
  return new ItemService(
    new CatalogueItemRepository(db),
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

function parseItemType(
  value: unknown,
): CatalogueItemType | null {
  return value === "product"
    || value === "service"
    ? value
    : null;
}

function parseStatus(
  value: unknown,
): CatalogueItemStatus | null {
  return value === "draft"
    || value === "published"
    || value === "hidden"
    ? value
    : null;
}

function parseCreateInput(
  value: unknown,
): ItemCreateInput | null {
  if (
    !isObject(value)
    || typeof value.name !== "string"
  ) {
    return null;
  }

  const itemType =
    parseItemType(value.itemType);

  if (!itemType) {
    return null;
  }

  if (
    value.slug !== undefined
    && typeof value.slug !== "string"
  ) {
    return null;
  }

  if (
    value.sku !== undefined
    && value.sku !== null
    && typeof value.sku !== "string"
  ) {
    return null;
  }

  if (
    value.categoryId !== undefined
    && value.categoryId !== null
    && typeof value.categoryId !== "string"
  ) {
    return null;
  }

  if (
    value.shortDescription !== undefined
    && value.shortDescription !== null
    && typeof value.shortDescription !== "string"
  ) {
    return null;
  }

  if (
    value.longDescription !== undefined
    && value.longDescription !== null
    && typeof value.longDescription !== "string"
  ) {
    return null;
  }

  if (
    value.priceMinorUnits !== undefined
    && value.priceMinorUnits !== null
    && typeof value.priceMinorUnits !== "number"
  ) {
    return null;
  }

  if (
    value.currencyCode !== undefined
    && value.currencyCode !== null
    && typeof value.currencyCode !== "string"
  ) {
    return null;
  }

  if (
    value.showPrice !== undefined
    && typeof value.showPrice !== "boolean"
  ) {
    return null;
  }

  const status = value.status === undefined
    ? undefined
    : parseStatus(value.status);

  if (
    value.status !== undefined
    && !status
  ) {
    return null;
  }

  if (
    value.isFeatured !== undefined
    && typeof value.isFeatured !== "boolean"
  ) {
    return null;
  }

  if (
    value.sortOrder !== undefined
    && typeof value.sortOrder !== "number"
  ) {
    return null;
  }

  return {
    itemType,
    name: value.name,
    slug: value.slug as
      | string
      | undefined,
    sku: value.sku as
      | string
      | null
      | undefined,
    categoryId: value.categoryId as
      | string
      | null
      | undefined,
    shortDescription:
      value.shortDescription as
        | string
        | null
        | undefined,
    longDescription:
      value.longDescription as
        | string
        | null
        | undefined,
    priceMinorUnits:
      value.priceMinorUnits as
        | number
        | null
        | undefined,
    currencyCode:
      value.currencyCode as
        | string
        | null
        | undefined,
    showPrice: value.showPrice as
      | boolean
      | undefined,
    status: status ?? undefined,
    isFeatured: value.isFeatured as
      | boolean
      | undefined,
    sortOrder: value.sortOrder as
      | number
      | undefined,
  };
}

function parseUpdateInput(
  value: unknown,
): ItemUpdateInput | null {
  if (
    !isObject(value)
    || typeof value.version !== "number"
  ) {
    return null;
  }

  const itemType =
    value.itemType === undefined
      ? undefined
      : parseItemType(value.itemType);

  if (
    value.itemType !== undefined
    && !itemType
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
    value.sku !== undefined
    && value.sku !== null
    && typeof value.sku !== "string"
  ) {
    return null;
  }

  if (
    value.categoryId !== undefined
    && value.categoryId !== null
    && typeof value.categoryId !== "string"
  ) {
    return null;
  }

  if (
    value.shortDescription !== undefined
    && value.shortDescription !== null
    && typeof value.shortDescription !== "string"
  ) {
    return null;
  }

  if (
    value.longDescription !== undefined
    && value.longDescription !== null
    && typeof value.longDescription !== "string"
  ) {
    return null;
  }

  if (
    value.priceMinorUnits !== undefined
    && value.priceMinorUnits !== null
    && typeof value.priceMinorUnits !== "number"
  ) {
    return null;
  }

  if (
    value.currencyCode !== undefined
    && value.currencyCode !== null
    && typeof value.currencyCode !== "string"
  ) {
    return null;
  }

  if (
    value.showPrice !== undefined
    && typeof value.showPrice !== "boolean"
  ) {
    return null;
  }

  const status = value.status === undefined
    ? undefined
    : parseStatus(value.status);

  if (
    value.status !== undefined
    && !status
  ) {
    return null;
  }

  if (
    value.isFeatured !== undefined
    && typeof value.isFeatured !== "boolean"
  ) {
    return null;
  }

  if (
    value.sortOrder !== undefined
    && typeof value.sortOrder !== "number"
  ) {
    return null;
  }

  return {
    version: value.version,
    itemType: itemType ?? undefined,
    name: value.name as
      | string
      | undefined,
    slug: value.slug as
      | string
      | undefined,
    sku: value.sku as
      | string
      | null
      | undefined,
    categoryId: value.categoryId as
      | string
      | null
      | undefined,
    shortDescription:
      value.shortDescription as
        | string
        | null
        | undefined,
    longDescription:
      value.longDescription as
        | string
        | null
        | undefined,
    priceMinorUnits:
      value.priceMinorUnits as
        | number
        | null
        | undefined,
    currencyCode:
      value.currencyCode as
        | string
        | null
        | undefined,
    showPrice: value.showPrice as
      | boolean
      | undefined,
    status: status ?? undefined,
    isFeatured: value.isFeatured as
      | boolean
      | undefined,
    sortOrder: value.sortOrder as
      | number
      | undefined,
  };
}

function parseDeleteInput(
  value: unknown,
): ItemDeleteInput | null {
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

function itemPayload(
  item: CatalogueItemRecord,
) {
  return {
    id: item.publicId,
    catalogueId:
      item.cataloguePublicId,
    categoryId:
      item.categoryPublicId,
    itemType: item.itemType,
    name: item.name,
    slug: item.slug,
    sku: item.sku,
    shortDescription:
      item.shortDescription,
    longDescription:
      item.longDescription,
    priceMinorUnits:
      item.priceMinorUnits,
    currencyCode:
      item.currencyCode,
    showPrice: item.showPrice,
    status: item.status,
    isFeatured: item.isFeatured,
    sortOrder: item.sortOrder,
    version: item.version,
  };
}

function mutationError(
  c: Parameters<typeof apiError>[0],
  result: ItemMutationFailure,
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
        "Create the catalogue before managing items.",
      );
    case "invalid":
      return apiError(
        c,
        400,
        "invalid_item",
        "Provide valid item details.",
      );
    case "not_found":
      return apiError(
        c,
        404,
        "item_not_found",
        "Item was not found.",
      );
    case "invalid_category":
      return apiError(
        c,
        400,
        "invalid_item_category",
        "Choose an active category from this catalogue.",
      );
    case "item_type_not_allowed":
      return apiError(
        c,
        400,
        "item_type_not_allowed",
        "The item type is not allowed by this catalogue.",
      );
    case "slug_conflict":
      return apiError(
        c,
        409,
        "item_slug_unavailable",
        "That item URL slug is already in use.",
      );
    case "sku_conflict":
      return apiError(
        c,
        409,
        "item_sku_unavailable",
        "That SKU is already in use.",
      );
    case "version_conflict":
      return apiError(
        c,
        409,
        "item_version_conflict",
        "This item changed since it was loaded. Refresh and try again.",
      );
    case "attribute_scope_conflict":
      return apiError(
        c,
        409,
        "item_attribute_scope_conflict",
        "Existing attributes are not compatible with the requested item type.",
      );
  }
}

export function createItemRoutes() {
  const routes =
    new Hono<CatalogueAppEnv>();

  routes.get(
    "/items",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      const limitValue =
        c.req.query("limit");

      const limit = limitValue === undefined
        ? undefined
        : Number(limitValue);

      const statusValue =
        c.req.query("status");

      const status = statusValue === undefined
        ? undefined
        : parseStatus(statusValue);

      if (
        statusValue !== undefined
        && !status
      ) {
        return apiError(
          c,
          400,
          "invalid_item_filter",
          "Provide valid item filters.",
        );
      }

      const itemTypeValue =
        c.req.query("itemType");

      const itemType =
        itemTypeValue === undefined
          ? undefined
          : parseItemType(itemTypeValue);

      if (
        itemTypeValue !== undefined
        && !itemType
      ) {
        return apiError(
          c,
          400,
          "invalid_item_filter",
          "Provide valid item filters.",
        );
      }

      const categoryValue =
        c.req.query("categoryId");

      const categoryId =
        categoryValue === undefined
          ? undefined
          : categoryValue === "uncategorized"
            ? null
            : categoryValue;

      try {
        const access =
          c.get("tenantAccess");

        const result =
          await itemService(
            c.env.DB,
          ).list(
            access.tenant,
            {
              search: c.req.query("q"),
              status: status ?? undefined,
              itemType:
                itemType ?? undefined,
              categoryId,
              after: c.req.query("after"),
              limit,
            },
          );

        if (result.kind === "catalogue_required") {
          return apiError(
            c,
            400,
            "catalogue_required",
            "Create the catalogue before managing items.",
          );
        }

        if (
          result.kind === "invalid"
        ) {
          return apiError(
            c,
            400,
            "invalid_item_filter",
            "Provide valid item filters.",
          );
        }

        if (
          result.kind === "invalid_category"
        ) {
          return apiError(
            c,
            400,
            "invalid_item_category",
            "Choose an active category from this catalogue.",
          );
        }

        if (
          result.kind === "invalid_cursor"
        ) {
          return apiError(
            c,
            400,
            "invalid_item_cursor",
            "The item list cursor is no longer valid.",
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: {
            catalogueId:
              result.catalogueId,
            items:
              result.items.map(
                itemPayload,
              ),
            nextCursor:
              result.nextCursor,
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "Items could not be loaded.",
        );
      }
    },
  );

  routes.get(
    "/items/:itemId",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      try {
        const access =
          c.get("tenantAccess");

        const result =
          await itemService(
            c.env.DB,
          ).get(
            access.tenant,
            c.req.param("itemId"),
          );

        if (result.kind === "invalid") {
          return apiError(
            c,
            400,
            "invalid_item_id",
            "A valid item ID is required.",
          );
        }

        if (result.kind === "not_found") {
          return apiError(
            c,
            404,
            "item_not_found",
            "Item was not found.",
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: {
            item: itemPayload(
              result.item,
            ),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The item could not be loaded.",
        );
      }
    },
  );

  routes.post(
    "/items",
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

      const input =
        parseCreateInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "Valid item details are required.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const result =
          await itemService(
            c.env.DB,
          ).create(
            access.tenant,
            access.role,
            input,
            new Date(),
          );

        if (result.kind !== "created") {
          return mutationError(
            c,
            result,
          );
        }

        ensureApiRequestId(c);

        return c.json(
          {
            data: {
              item: itemPayload(
                result.item,
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
          "The item could not be created.",
        );
      }
    },
  );

  routes.patch(
    "/items/:itemId",
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

      const input =
        parseUpdateInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "Valid item changes and a version are required.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const result =
          await itemService(
            c.env.DB,
          ).update(
            access.tenant,
            access.role,
            c.req.param("itemId"),
            input,
            new Date(),
          );

        if (result.kind !== "updated") {
          return mutationError(
            c,
            result,
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: {
            item: itemPayload(
              result.item,
            ),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The item could not be updated.",
        );
      }
    },
  );

  routes.delete(
    "/items/:itemId",
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

      const input =
        parseDeleteInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "A valid item version is required.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const result =
          await itemService(
            c.env.DB,
          ).delete(
            access.tenant,
            access.role,
            c.req.param("itemId"),
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
            "invalid_item",
            "Provide a valid item ID and version.",
          );
        }

        if (result.kind === "not_found") {
          return apiError(
            c,
            404,
            "item_not_found",
            "Item was not found.",
          );
        }

        if (
          result.kind ===
          "version_conflict"
        ) {
          return apiError(
            c,
            409,
            "item_version_conflict",
            "This item changed since it was loaded. Refresh and try again.",
          );
        }

        ensureApiRequestId(c);

        return c.body(null, 204);
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The item could not be deleted.",
        );
      }
    },
  );

  return routes;
}
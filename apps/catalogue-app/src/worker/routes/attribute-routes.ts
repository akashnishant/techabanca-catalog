import { Hono } from "hono";
import type { CatalogueAppEnv } from "../app-env";
import {
  apiError,
  ensureApiRequestId,
} from "../http/api-response";
import { requireAuthentication } from "../middleware/require-authentication";
import { requireTenantAccess } from "../middleware/require-tenant-access";
import {
  AttributeRepository,
  CatalogueItemRepository,
  type AttributeAppliesTo,
  type AttributeDataType,
  type AttributeDefinitionRecord,
  type ItemAttributeRecord,
  type ItemAttributeValueRecord,
} from "../repositories";
import {
  AttributeService,
  type AttributeDefinitionCreateInput,
  type AttributeDefinitionUpdateInput,
  type AttributeValueDeleteInput,
  type AttributeValueMutationFailure,
  type AttributeValueSetInput,
} from "../services/attribute-service";

function service(
  db: D1Database,
): AttributeService {
  return new AttributeService(
    new AttributeRepository(db),
    new CatalogueItemRepository(db),
  );
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value);
}

function parseDataType(
  value: unknown,
): AttributeDataType | null {
  return value === "text"
    || value === "number"
    || value === "boolean"
    || value === "date"
    || value === "url"
    ? value
    : null;
}

function parseAppliesTo(
  value: unknown,
): AttributeAppliesTo | null {
  return value === "product"
    || value === "service"
    || value === "both"
    ? value
    : null;
}

function parseCreateInput(
  value: unknown,
): AttributeDefinitionCreateInput | null {
  if (
    !isObject(value)
    || typeof value.label !== "string"
  ) {
    return null;
  }

  const dataType =
    parseDataType(value.dataType);

  if (!dataType) {
    return null;
  }

  const appliesTo =
    value.appliesTo === undefined
      ? undefined
      : parseAppliesTo(value.appliesTo);

  if (
    value.appliesTo !== undefined
    && !appliesTo
  ) {
    return null;
  }

  if (
    value.code !== undefined
    && typeof value.code !== "string"
  ) {
    return null;
  }

  if (
    value.unitHint !== undefined
    && value.unitHint !== null
    && typeof value.unitHint !== "string"
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
    value.isActive !== undefined
    && typeof value.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    code: value.code as
      | string
      | undefined,
    label: value.label,
    dataType,
    appliesTo:
      appliesTo ?? undefined,
    unitHint: value.unitHint as
      | string
      | null
      | undefined,
    sortOrder: value.sortOrder as
      | number
      | undefined,
    isActive: value.isActive as
      | boolean
      | undefined,
  };
}

function parseUpdateInput(
  value: unknown,
): AttributeDefinitionUpdateInput | null {
  if (
    !isObject(value)
    || typeof value.version !== "number"
  ) {
    return null;
  }

  const dataType =
    value.dataType === undefined
      ? undefined
      : parseDataType(value.dataType);

  if (
    value.dataType !== undefined
    && !dataType
  ) {
    return null;
  }

  const appliesTo =
    value.appliesTo === undefined
      ? undefined
      : parseAppliesTo(value.appliesTo);

  if (
    value.appliesTo !== undefined
    && !appliesTo
  ) {
    return null;
  }

  if (
    value.code !== undefined
    && typeof value.code !== "string"
  ) {
    return null;
  }

  if (
    value.label !== undefined
    && typeof value.label !== "string"
  ) {
    return null;
  }

  if (
    value.unitHint !== undefined
    && value.unitHint !== null
    && typeof value.unitHint !== "string"
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
    value.isActive !== undefined
    && typeof value.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    version: value.version,
    code: value.code as
      | string
      | undefined,
    label: value.label as
      | string
      | undefined,
    dataType:
      dataType ?? undefined,
    appliesTo:
      appliesTo ?? undefined,
    unitHint: value.unitHint as
      | string
      | null
      | undefined,
    sortOrder: value.sortOrder as
      | number
      | undefined,
    isActive: value.isActive as
      | boolean
      | undefined,
  };
}

function parseValueSetInput(
  value: unknown,
): AttributeValueSetInput | null {
  if (
    !isObject(value)
    || !Object.prototype.hasOwnProperty.call(
      value,
      "value",
    )
  ) {
    return null;
  }

  if (
    value.version !== undefined
    && value.version !== null
    && typeof value.version !== "number"
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
    value: value.value,
    version: value.version as
      | number
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

function parseValueDeleteInput(
  value: unknown,
): AttributeValueDeleteInput | null {
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

function definitionPayload(
  definition: AttributeDefinitionRecord,
) {
  return {
    id: definition.publicId,
    source: definition.source,
    code: definition.code,
    label: definition.label,
    dataType: definition.dataType,
    appliesTo: definition.appliesTo,
    unitHint: definition.unitHint,
    sortOrder: definition.sortOrder,
    isActive: definition.isActive,
    version: definition.version,
    isSuggested:
      definition.isSuggested,
    isRequired:
      definition.isRequired,
    suggestedSortOrder:
      definition.suggestedSortOrder,
  };
}

function typedValue(
  definition: AttributeDefinitionRecord,
  value: ItemAttributeValueRecord,
): string | number | boolean {
  if (definition.dataType === "number") {
    return value.valueNumber
      ?? Number(value.valueText);
  }

  if (definition.dataType === "boolean") {
    return value.valueBoolean
      ?? value.valueText.toLowerCase()
        === "true";
  }

  if (definition.dataType === "date") {
    return value.valueDate
      ?? value.valueText;
  }

  if (definition.dataType === "url") {
    return value.valueUrl
      ?? value.valueText;
  }

  return value.valueText;
}

function valuePayload(
  definition: AttributeDefinitionRecord,
  value: ItemAttributeValueRecord,
) {
  return {
    value:
      typedValue(definition, value),
    valueText: value.valueText,
    sortOrder: value.sortOrder,
    isVisible: value.isVisible,
    version: value.version,
  };
}

function itemAttributePayload(
  entry: ItemAttributeRecord,
) {
  return {
    definition:
      definitionPayload(
        entry.definition,
      ),
    value: entry.value
      ? valuePayload(
          entry.definition,
          entry.value,
        )
      : null,
  };
}

function definitionMutationError(
  c: Parameters<typeof apiError>[0],
  kind:
    | "forbidden"
    | "invalid"
    | "not_found"
    | "system_read_only"
    | "code_conflict"
    | "version_conflict"
    | "definition_in_use_conflict",
) {
  switch (kind) {
    case "forbidden":
      return apiError(
        c,
        403,
        "insufficient_permissions",
        "Owner or admin access is required.",
      );
    case "invalid":
      return apiError(
        c,
        400,
        "invalid_attribute_definition",
        "Provide valid attribute details.",
      );
    case "not_found":
      return apiError(
        c,
        404,
        "attribute_not_found",
        "Attribute was not found.",
      );
    case "system_read_only":
      return apiError(
        c,
        403,
        "system_attribute_read_only",
        "System attributes cannot be changed.",
      );
    case "code_conflict":
      return apiError(
        c,
        409,
        "attribute_code_unavailable",
        "That attribute code is already in use.",
      );
    case "version_conflict":
      return apiError(
        c,
        409,
        "attribute_version_conflict",
        "This attribute changed since it was loaded. Refresh and try again.",
      );
    case "definition_in_use_conflict":
      return apiError(
        c,
        409,
        "attribute_definition_in_use",
        "Existing item values are not compatible with that attribute change.",
      );
  }
}

function valueMutationError(
  c: Parameters<typeof apiError>[0],
  result: AttributeValueMutationFailure,
) {
  switch (result.kind) {
    case "forbidden":
      return apiError(
        c,
        403,
        "insufficient_permissions",
        "Owner or admin access is required.",
      );
    case "invalid":
      return apiError(
        c,
        400,
        "invalid_attribute_value",
        "Provide a value that matches the attribute type.",
      );
    case "item_not_found":
      return apiError(
        c,
        404,
        "item_not_found",
        "Item was not found.",
      );
    case "attribute_not_found":
      return apiError(
        c,
        404,
        "attribute_not_found",
        "Attribute was not found.",
      );
    case "attribute_inactive":
      return apiError(
        c,
        409,
        "attribute_inactive",
        "Archived attributes cannot receive new values.",
      );
    case "attribute_scope_conflict":
      return apiError(
        c,
        400,
        "attribute_scope_conflict",
        "The attribute does not apply to this item type.",
      );
    case "version_conflict":
      return apiError(
        c,
        409,
        "attribute_value_version_conflict",
        "This attribute value changed since it was loaded. Refresh and try again.",
      );
    case "value_conflict":
      return apiError(
        c,
        409,
        "attribute_value_conflict",
        "The attribute value changed concurrently. Refresh and try again.",
      );
  }
}

export function createAttributeRoutes() {
  const routes =
    new Hono<CatalogueAppEnv>();

  routes.get(
    "/attributes",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      const appliesToValue =
        c.req.query("appliesTo");

      const appliesTo =
        appliesToValue === undefined
          ? undefined
          : parseAppliesTo(
              appliesToValue,
            );

      if (
        appliesToValue !== undefined
        && !appliesTo
      ) {
        return apiError(
          c,
          400,
          "invalid_attribute_filter",
          "Provide valid attribute filters.",
        );
      }

      const includeInactiveValue =
        c.req.query("includeInactive");

      if (
        includeInactiveValue !== undefined
        && includeInactiveValue !== "true"
        && includeInactiveValue !== "false"
      ) {
        return apiError(
          c,
          400,
          "invalid_attribute_filter",
          "Provide valid attribute filters.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const definitions =
          await service(c.env.DB)
            .listDefinitions(
              access.tenant,
              {
                appliesTo:
                  appliesTo ?? undefined,
                includeInactiveCustom:
                  includeInactiveValue
                    === "true",
              },
            );

        ensureApiRequestId(c);

        return c.json({
          data: {
            attributes:
              definitions.map(
                definitionPayload,
              ),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "Attributes could not be loaded.",
        );
      }
    },
  );

  routes.post(
    "/attributes",
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
          "Valid custom attribute details are required.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const result =
          await service(c.env.DB)
            .createDefinition(
              access.tenant,
              access.role,
              input,
              new Date(),
            );

        if (result.kind !== "created") {
          return definitionMutationError(
            c,
            result.kind,
          );
        }

        ensureApiRequestId(c);

        return c.json(
          {
            data: {
              attribute:
                definitionPayload(
                  result.definition,
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
          "The custom attribute could not be created.",
        );
      }
    },
  );

  routes.patch(
    "/attributes/:attributeId",
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
          "Valid attribute changes and a version are required.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const result =
          await service(c.env.DB)
            .updateDefinition(
              access.tenant,
              access.role,
              c.req.param(
                "attributeId",
              ),
              input,
              new Date(),
            );

        if (result.kind !== "updated") {
          return definitionMutationError(
            c,
            result.kind,
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: {
            attribute:
              definitionPayload(
                result.definition,
              ),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The custom attribute could not be updated.",
        );
      }
    },
  );

  routes.delete(
    "/attributes/:attributeId",
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

      if (
        !isObject(body)
        || typeof body.version !== "number"
      ) {
        return apiError(
          c,
          400,
          "invalid_request",
          "A valid attribute version is required.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const result =
          await service(c.env.DB)
            .archiveDefinition(
              access.tenant,
              access.role,
              c.req.param(
                "attributeId",
              ),
              body.version,
              new Date(),
            );

        if (result.kind !== "archived") {
          return definitionMutationError(
            c,
            result.kind,
          );
        }

        ensureApiRequestId(c);

        return c.body(null, 204);
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The custom attribute could not be archived.",
        );
      }
    },
  );

  routes.get(
    "/items/:itemId/attributes",
    requireAuthentication,
    requireTenantAccess,
    async (c) => {
      try {
        const access =
          c.get("tenantAccess");

        const result =
          await service(c.env.DB)
            .getItemAttributes(
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
            itemId: result.itemId,
            attributes:
              result.attributes.map(
                itemAttributePayload,
              ),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "Item attributes could not be loaded.",
        );
      }
    },
  );

  routes.put(
    "/items/:itemId/attributes/:attributeId",
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
        parseValueSetInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "A typed attribute value is required.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const attributeService =
          service(c.env.DB);

        const result =
          await attributeService.setItemValue(
            access.tenant,
            access.role,
            c.req.param("itemId"),
            c.req.param(
              "attributeId",
            ),
            input,
            new Date(),
          );

        if (result.kind !== "saved") {
          return valueMutationError(
            c,
            result,
          );
        }

        const definition =
          await new AttributeRepository(
            c.env.DB,
          ).findDefinitionForTenant(
            access.tenant,
            c.req.param(
              "attributeId",
            ),
          );

        if (!definition) {
          return apiError(
            c,
            500,
            "internal_error",
            "The saved attribute could not be reloaded.",
          );
        }

        ensureApiRequestId(c);

        return c.json({
          data: {
            value: valuePayload(
              definition,
              result.value,
            ),
          },
        });
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The attribute value could not be saved.",
        );
      }
    },
  );

  routes.delete(
    "/items/:itemId/attributes/:attributeId",
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
        parseValueDeleteInput(body);

      if (!input) {
        return apiError(
          c,
          400,
          "invalid_request",
          "A valid attribute value version is required.",
        );
      }

      try {
        const access =
          c.get("tenantAccess");

        const result =
          await service(c.env.DB)
            .deleteItemValue(
              access.tenant,
              access.role,
              c.req.param("itemId"),
              c.req.param(
                "attributeId",
              ),
              input,
            );

        if (result.kind !== "deleted") {
          return valueMutationError(
            c,
            result,
          );
        }

        ensureApiRequestId(c);

        return c.body(null, 204);
      } catch {
        return apiError(
          c,
          500,
          "internal_error",
          "The attribute value could not be deleted.",
        );
      }
    },
  );

  return routes;
}
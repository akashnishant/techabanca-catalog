import {
  createPublicId,
  hasPublicIdPrefix,
  type OrganizationMemberRole,
  type TenantContext,
} from "@techabanca/domain";
import type {
  AttributeAppliesTo,
  AttributeDataType,
  AttributeDefinitionRecord,
  AttributeRepository,
  CatalogueItemRepository,
  ItemAttributeRecord,
  ItemAttributeValueRecord,
} from "../repositories";

export type AttributeDefinitionCreateInput = {
  code?: string;
  label: string;
  dataType: AttributeDataType;
  appliesTo?: AttributeAppliesTo;
  unitHint?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type AttributeDefinitionUpdateInput = {
  version: number;
  code?: string;
  label?: string;
  dataType?: AttributeDataType;
  appliesTo?: AttributeAppliesTo;
  unitHint?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type AttributeValueSetInput = {
  value: unknown;
  version?: number | null;
  sortOrder?: number;
  isVisible?: boolean;
};

export type AttributeValueDeleteInput = {
  version: number;
};

type DefinitionMutationFailure =
  | { kind: "forbidden" }
  | { kind: "invalid" }
  | { kind: "not_found" }
  | { kind: "system_read_only" }
  | { kind: "code_conflict" }
  | { kind: "version_conflict" }
  | { kind: "definition_in_use_conflict" };

export type DefinitionCreateResult =
  | {
      kind: "created";
      definition: AttributeDefinitionRecord;
    }
  | DefinitionMutationFailure;

export type DefinitionUpdateResult =
  | {
      kind: "updated";
      definition: AttributeDefinitionRecord;
    }
  | DefinitionMutationFailure;

export type DefinitionArchiveResult =
  | { kind: "archived" }
  | DefinitionMutationFailure;

export type ItemAttributesResult =
  | {
      kind: "found";
      itemId: string;
      attributes: ItemAttributeRecord[];
    }
  | { kind: "invalid" }
  | { kind: "not_found" };

export type AttributeValueMutationFailure =
  | { kind: "forbidden" }
  | { kind: "invalid" }
  | { kind: "item_not_found" }
  | { kind: "attribute_not_found" }
  | { kind: "attribute_inactive" }
  | { kind: "attribute_scope_conflict" }
  | { kind: "version_conflict" }
  | { kind: "value_conflict" };

export type AttributeValueSetResult =
  | {
      kind: "saved";
      value: ItemAttributeValueRecord;
    }
  | AttributeValueMutationFailure;

export type AttributeValueDeleteResult =
  | { kind: "deleted" }
  | AttributeValueMutationFailure;

function canMutate(
  role: OrganizationMemberRole,
): boolean {
  return role === "owner"
    || role === "admin";
}

function normalizeAttributeCode(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function validAttributeCode(
  value: string,
): boolean {
  return value.length >= 1
    && value.length <= 80
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validDataType(
  value: string,
): value is AttributeDataType {
  return value === "text"
    || value === "number"
    || value === "boolean"
    || value === "date"
    || value === "url";
}

function validAppliesTo(
  value: string,
): value is AttributeAppliesTo {
  return value === "product"
    || value === "service"
    || value === "both";
}

function validVersion(
  value: number,
): boolean {
  return Number.isInteger(value)
    && value >= 1;
}

function validSortOrder(
  value: number,
): boolean {
  return Number.isInteger(value)
    && value >= 0
    && value <= 1_000_000;
}

function cleanLabel(
  value: string,
): string | null {
  const normalized =
    value.trim().replace(/\s+/g, " ");

  if (
    normalized.length < 1
    || normalized.length > 120
  ) {
    return null;
  }

  return normalized;
}

function cleanUnitHint(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized =
    value.trim().replace(/\s+/g, " ");

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > 40) {
    throw new Error("invalid_unit_hint");
  }

  return normalized;
}

function isoTimestamp(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error("invalid_date");
  }

  return now.toISOString();
}

function validDateOnly(
  value: string,
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] =
    value.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

type NormalizedValue = {
  valueText: string;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: string | null;
  valueUrl: string | null;
};

function normalizeTypedValue(
  dataType: AttributeDataType,
  value: unknown,
): NormalizedValue | null {
  if (dataType === "text") {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();

    if (
      normalized.length < 1
      || normalized.length > 4_000
    ) {
      return null;
    }

    return {
      valueText: normalized,
      valueNumber: null,
      valueBoolean: null,
      valueDate: null,
      valueUrl: null,
    };
  }

  if (dataType === "number") {
    if (
      typeof value !== "number"
      || !Number.isFinite(value)
    ) {
      return null;
    }

    const normalized =
      Object.is(value, -0) ? 0 : value;

    return {
      valueText: String(normalized),
      valueNumber: normalized,
      valueBoolean: null,
      valueDate: null,
      valueUrl: null,
    };
  }

  if (dataType === "boolean") {
    if (typeof value !== "boolean") {
      return null;
    }

    return {
      valueText: value ? "true" : "false",
      valueNumber: null,
      valueBoolean: value,
      valueDate: null,
      valueUrl: null,
    };
  }

  if (dataType === "date") {
    if (
      typeof value !== "string"
      || !validDateOnly(value)
    ) {
      return null;
    }

    return {
      valueText: value,
      valueNumber: null,
      valueBoolean: null,
      valueDate: value,
      valueUrl: null,
    };
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.length < 1
    || normalized.length > 2_048
  ) {
    return null;
  }

  try {
    const parsed = new URL(normalized);

    if (
      parsed.protocol !== "http:"
      && parsed.protocol !== "https:"
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    valueText: normalized,
    valueNumber: null,
    valueBoolean: null,
    valueDate: null,
    valueUrl: normalized,
  };
}

function definitionDbConflict(
  error: unknown,
):
  | "code_conflict"
  | "definition_in_use_conflict"
  | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (
    error.message.includes(
      "attribute_definitions.organization_id, attribute_definitions.code",
    )
  ) {
    return "code_conflict";
  }

  if (
    error.message.includes(
      "existing_item_attribute_definition_conflict",
    )
  ) {
    return "definition_in_use_conflict";
  }

  return null;
}

function valueDbConflict(
  error: unknown,
):
  | "value_conflict"
  | "attribute_scope_conflict"
  | "invalid"
  | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (
    error.message.includes(
      "item_attribute_values.item_id, item_attribute_values.attribute_definition_id",
    )
  ) {
    return "value_conflict";
  }

  if (
    error.message.includes(
      "invalid_item_attribute_scope",
    )
  ) {
    return "attribute_scope_conflict";
  }

  if (
    error.message.includes(
      "invalid_item_attribute_value_type",
    )
  ) {
    return "invalid";
  }

  return null;
}

export class AttributeService {
  constructor(
    private readonly repository:
      AttributeRepository,
    private readonly items:
      CatalogueItemRepository,
  ) {}

  async listDefinitions(
    tenant: TenantContext,
    input: {
      appliesTo?: AttributeAppliesTo;
      includeInactiveCustom?: boolean;
    },
  ): Promise<AttributeDefinitionRecord[]> {
    return this.repository.listDefinitions(
      tenant,
      {
        appliesTo:
          input.appliesTo ?? null,
        includeInactiveCustom:
          input.includeInactiveCustom
          ?? false,
      },
    );
  }

  async createDefinition(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    input: AttributeDefinitionCreateInput,
    now: Date,
  ): Promise<DefinitionCreateResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    const label = cleanLabel(input.label);

    if (
      !label
      || !validDataType(input.dataType)
    ) {
      return {
        kind: "invalid",
      };
    }

    const appliesTo =
      input.appliesTo ?? "both";
    const sortOrder =
      input.sortOrder ?? 0;
    const isActive =
      input.isActive ?? true;

    if (
      !validAppliesTo(appliesTo)
      || !validSortOrder(sortOrder)
    ) {
      return {
        kind: "invalid",
      };
    }

    let unitHint: string | null;

    try {
      unitHint =
        cleanUnitHint(input.unitHint)
        ?? null;
    } catch {
      return {
        kind: "invalid",
      };
    }

    const publicId = createPublicId("atr");
    const code = normalizeAttributeCode(
      input.code ?? label,
    );

    if (!validAttributeCode(code)) {
      return {
        kind: "invalid",
      };
    }

    if (
      await this.repository.codeExists(
        tenant,
        code,
      )
    ) {
      return {
        kind: "code_conflict",
      };
    }

    let definition:
      AttributeDefinitionRecord | null;

    try {
      definition =
        await this.repository.createCustomDefinition(
          tenant,
          {
            publicId,
            code,
            label,
            dataType: input.dataType,
            appliesTo,
            unitHint,
            sortOrder,
            isActive,
            now: isoTimestamp(now),
          },
        );
    } catch (error) {
      const conflict =
        definitionDbConflict(error);

      if (conflict) {
        return {
          kind: conflict,
        };
      }

      throw error;
    }

    if (!definition) {
      throw new Error(
        "attribute_definition_create_failed",
      );
    }

    return {
      kind: "created",
      definition,
    };
  }

  async updateDefinition(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    publicId: string,
    input: AttributeDefinitionUpdateInput,
    now: Date,
  ): Promise<DefinitionUpdateResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    if (
      !hasPublicIdPrefix(publicId, "atr")
      || !validVersion(input.version)
    ) {
      return {
        kind: "invalid",
      };
    }

    const existing =
      await this.repository.findDefinitionForTenant(
        tenant,
        publicId,
      );

    if (!existing) {
      return {
        kind: "not_found",
      };
    }

    if (existing.source === "system") {
      return {
        kind: "system_read_only",
      };
    }

    if (existing.version !== input.version) {
      return {
        kind: "version_conflict",
      };
    }

    const hasEditableField =
      input.code !== undefined
      || input.label !== undefined
      || input.dataType !== undefined
      || input.appliesTo !== undefined
      || input.unitHint !== undefined
      || input.sortOrder !== undefined
      || input.isActive !== undefined;

    if (!hasEditableField) {
      return {
        kind: "invalid",
      };
    }

    const label = input.label === undefined
      ? existing.label
      : cleanLabel(input.label);

    if (!label) {
      return {
        kind: "invalid",
      };
    }

    const code = input.code === undefined
      ? existing.code
      : normalizeAttributeCode(input.code);

    const dataType =
      input.dataType ?? existing.dataType;
    const appliesTo =
      input.appliesTo ?? existing.appliesTo;
    const sortOrder =
      input.sortOrder ?? existing.sortOrder;
    const isActive =
      input.isActive ?? existing.isActive;

    if (
      !validAttributeCode(code)
      || !validDataType(dataType)
      || !validAppliesTo(appliesTo)
      || !validSortOrder(sortOrder)
    ) {
      return {
        kind: "invalid",
      };
    }

    let unitHint: string | null;

    try {
      const normalized =
        cleanUnitHint(input.unitHint);

      unitHint = normalized === undefined
        ? existing.unitHint
        : normalized;
    } catch {
      return {
        kind: "invalid",
      };
    }

    if (
      code !== existing.code
      && await this.repository.codeExists(
        tenant,
        code,
        existing.id,
      )
    ) {
      return {
        kind: "code_conflict",
      };
    }

    let updated = false;

    try {
      updated =
        await this.repository.updateCustomDefinition(
          tenant,
          existing.id,
          input.version,
          {
            code,
            label,
            dataType,
            appliesTo,
            unitHint,
            sortOrder,
            isActive,
            now: isoTimestamp(now),
          },
        );
    } catch (error) {
      const conflict =
        definitionDbConflict(error);

      if (conflict) {
        return {
          kind: conflict,
        };
      }

      throw error;
    }

    if (!updated) {
      return {
        kind: "version_conflict",
      };
    }

    const definition =
      await this.repository.findDefinitionForTenant(
        tenant,
        publicId,
      );

    if (!definition) {
      throw new Error(
        "attribute_definition_update_readback_failed",
      );
    }

    return {
      kind: "updated",
      definition,
    };
  }

  async archiveDefinition(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    publicId: string,
    version: number,
    now: Date,
  ): Promise<DefinitionArchiveResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    if (
      !hasPublicIdPrefix(publicId, "atr")
      || !validVersion(version)
    ) {
      return {
        kind: "invalid",
      };
    }

    const existing =
      await this.repository.findDefinitionForTenant(
        tenant,
        publicId,
      );

    if (!existing) {
      return {
        kind: "not_found",
      };
    }

    if (existing.source === "system") {
      return {
        kind: "system_read_only",
      };
    }

    if (existing.version !== version) {
      return {
        kind: "version_conflict",
      };
    }

    if (!existing.isActive) {
      return {
        kind: "archived",
      };
    }

    const archived =
      await this.repository.archiveCustomDefinition(
        tenant,
        existing.id,
        version,
        isoTimestamp(now),
      );

    return archived
      ? {
          kind: "archived",
        }
      : {
          kind: "version_conflict",
        };
  }

  async getItemAttributes(
    tenant: TenantContext,
    itemPublicId: string,
  ): Promise<ItemAttributesResult> {
    if (
      !hasPublicIdPrefix(
        itemPublicId,
        "itm",
      )
    ) {
      return {
        kind: "invalid",
      };
    }

    const item =
      await this.items.findByPublicId(
        tenant,
        itemPublicId,
      );

    if (!item) {
      return {
        kind: "not_found",
      };
    }

    const attributes =
      await this.repository.listForItem(
        tenant,
        item.id,
        item.itemType,
      );

    return {
      kind: "found",
      itemId: item.publicId,
      attributes,
    };
  }

  async setItemValue(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    itemPublicId: string,
    attributePublicId: string,
    input: AttributeValueSetInput,
    now: Date,
  ): Promise<AttributeValueSetResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    if (
      !hasPublicIdPrefix(
        itemPublicId,
        "itm",
      )
    ) {
      return {
        kind: "invalid",
      };
    }

    if (
      !hasPublicIdPrefix(
        attributePublicId,
        "atr",
      )
    ) {
      return {
        kind: "invalid",
      };
    }

    const item =
      await this.items.findByPublicId(
        tenant,
        itemPublicId,
      );

    if (!item) {
      return {
        kind: "item_not_found",
      };
    }

    const definition =
      await this.repository.findDefinitionForTenant(
        tenant,
        attributePublicId,
      );

    if (!definition) {
      return {
        kind: "attribute_not_found",
      };
    }

    if (!definition.isActive) {
      return {
        kind: "attribute_inactive",
      };
    }

    if (
      definition.appliesTo !== "both"
      && definition.appliesTo
        !== item.itemType
    ) {
      return {
        kind: "attribute_scope_conflict",
      };
    }

    const normalizedValue =
      normalizeTypedValue(
        definition.dataType,
        input.value,
      );

    if (!normalizedValue) {
      return {
        kind: "invalid",
      };
    }

    const existing =
      await this.repository.findValue(
        tenant,
        item.id,
        definition.id,
      );

    let sortOrder: number;
    let isVisible: boolean;

    if (existing) {
      if (
        input.version === undefined
        || input.version === null
        || !validVersion(input.version)
        || input.version !== existing.version
      ) {
        return {
          kind: "version_conflict",
        };
      }

      sortOrder =
        input.sortOrder
        ?? existing.sortOrder;
      isVisible =
        input.isVisible
        ?? existing.isVisible;
    } else {
      if (
        input.version !== undefined
        && input.version !== null
      ) {
        return {
          kind: "version_conflict",
        };
      }

      sortOrder =
        input.sortOrder
        ?? definition.suggestedSortOrder
        ?? definition.sortOrder;

      isVisible =
        input.isVisible ?? true;
    }

    if (!validSortOrder(sortOrder)) {
      return {
        kind: "invalid",
      };
    }

    if (existing) {
      let updated = false;

      try {
        updated =
          await this.repository.updateValue(
            tenant,
            {
              itemId: item.id,
              definitionId:
                definition.id,
              expectedVersion:
                existing.version,
              ...normalizedValue,
              sortOrder,
              isVisible,
              now: isoTimestamp(now),
            },
          );
      } catch (error) {
        const conflict =
          valueDbConflict(error);

        if (conflict) {
          return {
            kind: conflict,
          };
        }

        throw error;
      }

      if (!updated) {
        return {
          kind: "version_conflict",
        };
      }
    } else {
      try {
        const created =
          await this.repository.createValue(
            tenant,
            {
              itemId: item.id,
              definitionId:
                definition.id,
              ...normalizedValue,
              sortOrder,
              isVisible,
              now: isoTimestamp(now),
            },
          );

        if (!created) {
          throw new Error(
            "attribute_value_create_failed",
          );
        }

        return {
          kind: "saved",
          value: created,
        };
      } catch (error) {
        const conflict =
          valueDbConflict(error);

        if (conflict) {
          return {
            kind: conflict,
          };
        }

        throw error;
      }
    }

    const value =
      await this.repository.findValue(
        tenant,
        item.id,
        definition.id,
      );

    if (!value) {
      throw new Error(
        "attribute_value_update_readback_failed",
      );
    }

    return {
      kind: "saved",
      value,
    };
  }

  async deleteItemValue(
    tenant: TenantContext,
    role: OrganizationMemberRole,
    itemPublicId: string,
    attributePublicId: string,
    input: AttributeValueDeleteInput,
  ): Promise<AttributeValueDeleteResult> {
    if (!canMutate(role)) {
      return {
        kind: "forbidden",
      };
    }

    if (
      !hasPublicIdPrefix(
        itemPublicId,
        "itm",
      )
      || !hasPublicIdPrefix(
        attributePublicId,
        "atr",
      )
      || !validVersion(input.version)
    ) {
      return {
        kind: "invalid",
      };
    }

    const item =
      await this.items.findByPublicId(
        tenant,
        itemPublicId,
      );

    if (!item) {
      return {
        kind: "item_not_found",
      };
    }

    const definition =
      await this.repository.findDefinitionForTenant(
        tenant,
        attributePublicId,
      );

    if (!definition) {
      return {
        kind: "attribute_not_found",
      };
    }

    const existing =
      await this.repository.findValue(
        tenant,
        item.id,
        definition.id,
      );

    if (!existing) {
      return {
        kind: "attribute_not_found",
      };
    }

    if (
      existing.version !== input.version
    ) {
      return {
        kind: "version_conflict",
      };
    }

    const deleted =
      await this.repository.deleteValue(
        tenant,
        item.id,
        definition.id,
        input.version,
      );

    return deleted
      ? {
          kind: "deleted",
        }
      : {
          kind: "version_conflict",
        };
  }
}
import type { TenantContext } from "@techabanca/domain";

export type AttributeDataType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "url";

export type AttributeAppliesTo =
  | "product"
  | "service"
  | "both";

export type AttributeDefinitionRecord = {
  id: number;
  publicId: string;
  organizationId: number | null;
  source: "system" | "custom";
  code: string;
  label: string;
  dataType: AttributeDataType;
  appliesTo: AttributeAppliesTo;
  unitHint: string | null;
  sortOrder: number;
  isActive: boolean;
  version: number;
  isSuggested: boolean;
  isRequired: boolean;
  suggestedSortOrder: number | null;
};

export type ItemAttributeValueRecord = {
  itemId: number;
  attributeDefinitionId: number;
  valueText: string;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueDate: string | null;
  valueUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
  version: number;
};

export type ItemAttributeRecord = {
  definition: AttributeDefinitionRecord;
  value: ItemAttributeValueRecord | null;
};

type DefinitionRow = {
  id: number;
  public_id: string;
  organization_id: number | null;
  code: string;
  label: string;
  data_type: AttributeDataType;
  applies_to: AttributeAppliesTo;
  unit_hint: string | null;
  sort_order: number;
  is_active: number;
  version: number;
  suggested_attribute_id: number | null;
  suggested_sort_order: number | null;
  is_required: number | null;
};

type ItemAttributeRow = DefinitionRow & {
  value_item_id: number | null;
  value_attribute_definition_id: number | null;
  value_text: string | null;
  value_number: number | null;
  value_boolean: number | null;
  value_date: string | null;
  value_url: string | null;
  value_sort_order: number | null;
  value_is_visible: number | null;
  value_version: number | null;
};

function mapDefinition(
  row: DefinitionRow,
): AttributeDefinitionRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    organizationId: row.organization_id,
    source:
      row.organization_id === null
        ? "system"
        : "custom",
    code: row.code,
    label: row.label,
    dataType: row.data_type,
    appliesTo: row.applies_to,
    unitHint: row.unit_hint,
    sortOrder: row.sort_order,
    isActive: row.is_active === 1,
    version: row.version,
    isSuggested:
      row.suggested_attribute_id !== null,
    isRequired: row.is_required === 1,
    suggestedSortOrder:
      row.suggested_sort_order,
  };
}

function mapValue(
  row: ItemAttributeRow,
): ItemAttributeValueRecord | null {
  if (
    row.value_item_id === null
    || row.value_attribute_definition_id === null
    || row.value_text === null
    || row.value_sort_order === null
    || row.value_is_visible === null
    || row.value_version === null
  ) {
    return null;
  }

  return {
    itemId: row.value_item_id,
    attributeDefinitionId:
      row.value_attribute_definition_id,
    valueText: row.value_text,
    valueNumber: row.value_number,
    valueBoolean:
      row.value_boolean === null
        ? null
        : row.value_boolean === 1,
    valueDate: row.value_date,
    valueUrl: row.value_url,
    sortOrder: row.value_sort_order,
    isVisible:
      row.value_is_visible === 1,
    version: row.value_version,
  };
}

const DEFINITION_SELECT = `
  ad.id,
  ad.public_id,
  ad.organization_id,
  ad.code,
  ad.label,
  ad.data_type,
  ad.applies_to,
  ad.unit_hint,
  ad.sort_order,
  ad.is_active,
  ad.version,
  bta.attribute_definition_id AS suggested_attribute_id,
  bta.sort_order AS suggested_sort_order,
  bta.is_required
`;

export class AttributeRepository {
  constructor(private readonly db: D1Database) {}

  async listDefinitions(
    tenant: TenantContext,
    filters: {
      appliesTo: AttributeAppliesTo | null;
      includeInactiveCustom: boolean;
    },
  ): Promise<AttributeDefinitionRecord[]> {
    const where = [
      `(ad.organization_id IS NULL
        OR ad.organization_id = ?)`,
      `(ad.is_active = 1
        OR (
          ? = 1
          AND ad.organization_id = ?
        ))`,
    ];

    const bindings: Array<
      string | number
    > = [
      tenant.organizationId,
      filters.includeInactiveCustom ? 1 : 0,
      tenant.organizationId,
    ];

    if (filters.appliesTo !== null) {
      where.push(
        `(ad.applies_to = 'both'
          OR ad.applies_to = ?)`,
      );
      bindings.push(filters.appliesTo);
    }

    const rows = await this.db
      .prepare(
        `SELECT ${DEFINITION_SELECT}
         FROM attribute_definitions ad
         INNER JOIN organizations o
           ON o.id = ?
         LEFT JOIN business_type_attributes bta
           ON bta.business_type_id = o.business_type_id
          AND bta.attribute_definition_id = ad.id
         WHERE ${where.join("\n           AND ")}
         ORDER BY
           CASE
             WHEN bta.attribute_definition_id IS NOT NULL THEN 0
             WHEN ad.organization_id IS NOT NULL THEN 1
             ELSE 2
           END,
           COALESCE(bta.sort_order, ad.sort_order),
           ad.sort_order,
           ad.label COLLATE NOCASE,
           ad.id`,
      )
      .bind(
        tenant.organizationId,
        ...bindings,
      )
      .all<DefinitionRow>();

    return rows.results.map(mapDefinition);
  }

  async findDefinitionForTenant(
    tenant: TenantContext,
    publicId: string,
  ): Promise<AttributeDefinitionRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT ${DEFINITION_SELECT}
         FROM attribute_definitions ad
         INNER JOIN organizations o
           ON o.id = ?
         LEFT JOIN business_type_attributes bta
           ON bta.business_type_id = o.business_type_id
          AND bta.attribute_definition_id = ad.id
         WHERE ad.public_id = ?
           AND (
             ad.organization_id IS NULL
             OR ad.organization_id = ?
           )
         LIMIT 1`,
      )
      .bind(
        tenant.organizationId,
        publicId,
        tenant.organizationId,
      )
      .first<DefinitionRow>();

    return row ? mapDefinition(row) : null;
  }

  async codeExists(
    tenant: TenantContext,
    code: string,
    excludeDefinitionId?: number,
  ): Promise<boolean> {
    const row = excludeDefinitionId === undefined
      ? await this.db
          .prepare(
            `SELECT id
             FROM attribute_definitions
             WHERE code = ?
               AND (
                 organization_id IS NULL
                 OR organization_id = ?
               )
             LIMIT 1`,
          )
          .bind(
            code,
            tenant.organizationId,
          )
          .first<{ id: number }>()
      : await this.db
          .prepare(
            `SELECT id
             FROM attribute_definitions
             WHERE code = ?
               AND id <> ?
               AND (
                 organization_id IS NULL
                 OR organization_id = ?
               )
             LIMIT 1`,
          )
          .bind(
            code,
            excludeDefinitionId,
            tenant.organizationId,
          )
          .first<{ id: number }>();

    return row !== null;
  }

  async createCustomDefinition(
    tenant: TenantContext,
    input: {
      publicId: string;
      code: string;
      label: string;
      dataType: AttributeDataType;
      appliesTo: AttributeAppliesTo;
      unitHint: string | null;
      sortOrder: number;
      isActive: boolean;
      now: string;
    },
  ): Promise<AttributeDefinitionRecord | null> {
    await this.db
      .prepare(
        `INSERT INTO attribute_definitions (
           public_id,
           organization_id,
           code,
           label,
           data_type,
           applies_to,
           unit_hint,
           sort_order,
           is_active,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.publicId,
        tenant.organizationId,
        input.code,
        input.label,
        input.dataType,
        input.appliesTo,
        input.unitHint,
        input.sortOrder,
        input.isActive ? 1 : 0,
        input.now,
        input.now,
      )
      .run();

    return this.findDefinitionForTenant(
      tenant,
      input.publicId,
    );
  }

  async updateCustomDefinition(
    tenant: TenantContext,
    definitionId: number,
    expectedVersion: number,
    input: {
      code: string;
      label: string;
      dataType: AttributeDataType;
      appliesTo: AttributeAppliesTo;
      unitHint: string | null;
      sortOrder: number;
      isActive: boolean;
      now: string;
    },
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE attribute_definitions
         SET
           code = ?,
           label = ?,
           data_type = ?,
           applies_to = ?,
           unit_hint = ?,
           sort_order = ?,
           is_active = ?,
           version = version + 1,
           updated_at = ?
         WHERE id = ?
           AND organization_id = ?
           AND version = ?`,
      )
      .bind(
        input.code,
        input.label,
        input.dataType,
        input.appliesTo,
        input.unitHint,
        input.sortOrder,
        input.isActive ? 1 : 0,
        input.now,
        definitionId,
        tenant.organizationId,
        expectedVersion,
      )
      .run();

    return result.meta.changes >= 1;
  }

  async archiveCustomDefinition(
    tenant: TenantContext,
    definitionId: number,
    expectedVersion: number,
    now: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE attribute_definitions
         SET
           is_active = 0,
           version = version + 1,
           updated_at = ?
         WHERE id = ?
           AND organization_id = ?
           AND version = ?
           AND is_active = 1`,
      )
      .bind(
        now,
        definitionId,
        tenant.organizationId,
        expectedVersion,
      )
      .run();

    return result.meta.changes >= 1;
  }

  async listForItem(
    tenant: TenantContext,
    itemId: number,
    itemType: "product" | "service",
  ): Promise<ItemAttributeRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT
           ${DEFINITION_SELECT},
           v.item_id AS value_item_id,
           v.attribute_definition_id AS value_attribute_definition_id,
           v.value_text,
           v.value_number,
           v.value_boolean,
           v.value_date,
           v.value_url,
           v.sort_order AS value_sort_order,
           v.is_visible AS value_is_visible,
           v.version AS value_version
         FROM attribute_definitions ad
         INNER JOIN organizations o
           ON o.id = ?
         LEFT JOIN business_type_attributes bta
           ON bta.business_type_id = o.business_type_id
          AND bta.attribute_definition_id = ad.id
         LEFT JOIN item_attribute_values v
           ON v.attribute_definition_id = ad.id
          AND v.item_id = ?
         WHERE (
             ad.organization_id IS NULL
             OR ad.organization_id = ?
           )
           AND (
             v.item_id IS NOT NULL
             OR (
               ad.is_active = 1
               AND (
                 ad.applies_to = 'both'
                 OR ad.applies_to = ?
               )
               AND (
                 ad.organization_id = ?
                 OR bta.attribute_definition_id IS NOT NULL
               )
             )
           )
         ORDER BY
           CASE
             WHEN v.item_id IS NOT NULL THEN 0
             WHEN bta.attribute_definition_id IS NOT NULL THEN 1
             ELSE 2
           END,
           COALESCE(
             v.sort_order,
             bta.sort_order,
             ad.sort_order
           ),
           ad.sort_order,
           ad.label COLLATE NOCASE,
           ad.id`,
      )
      .bind(
        tenant.organizationId,
        itemId,
        tenant.organizationId,
        itemType,
        tenant.organizationId,
      )
      .all<ItemAttributeRow>();

    return rows.results.map((row) => ({
      definition: mapDefinition(row),
      value: mapValue(row),
    }));
  }

  async findValue(
    tenant: TenantContext,
    itemId: number,
    definitionId: number,
  ): Promise<ItemAttributeValueRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           v.item_id,
           v.attribute_definition_id,
           v.value_text,
           v.value_number,
           v.value_boolean,
           v.value_date,
           v.value_url,
           v.sort_order,
           v.is_visible,
           v.version
         FROM item_attribute_values v
         INNER JOIN catalogue_items i
           ON i.id = v.item_id
         INNER JOIN catalogues c
           ON c.id = i.catalogue_id
         WHERE c.organization_id = ?
           AND c.deleted_at IS NULL
           AND i.deleted_at IS NULL
           AND v.item_id = ?
           AND v.attribute_definition_id = ?
         LIMIT 1`,
      )
      .bind(
        tenant.organizationId,
        itemId,
        definitionId,
      )
      .first<{
        item_id: number;
        attribute_definition_id: number;
        value_text: string;
        value_number: number | null;
        value_boolean: number | null;
        value_date: string | null;
        value_url: string | null;
        sort_order: number;
        is_visible: number;
        version: number;
      }>();

    if (!row) {
      return null;
    }

    return {
      itemId: row.item_id,
      attributeDefinitionId:
        row.attribute_definition_id,
      valueText: row.value_text,
      valueNumber: row.value_number,
      valueBoolean:
        row.value_boolean === null
          ? null
          : row.value_boolean === 1,
      valueDate: row.value_date,
      valueUrl: row.value_url,
      sortOrder: row.sort_order,
      isVisible: row.is_visible === 1,
      version: row.version,
    };
  }

  async createValue(
    tenant: TenantContext,
    input: {
      itemId: number;
      definitionId: number;
      valueText: string;
      valueNumber: number | null;
      valueBoolean: boolean | null;
      valueDate: string | null;
      valueUrl: string | null;
      sortOrder: number;
      isVisible: boolean;
      now: string;
    },
  ): Promise<ItemAttributeValueRecord | null> {
    await this.db
      .prepare(
        `INSERT INTO item_attribute_values (
           item_id,
           attribute_definition_id,
           value_text,
           value_number,
           value_boolean,
           value_date,
           value_url,
           sort_order,
           is_visible,
           created_at,
           updated_at
         )
         SELECT
           i.id,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?
         FROM catalogue_items i
         INNER JOIN catalogues c
           ON c.id = i.catalogue_id
         WHERE i.id = ?
           AND i.deleted_at IS NULL
           AND c.deleted_at IS NULL
           AND c.organization_id = ?`,
      )
      .bind(
        input.definitionId,
        input.valueText,
        input.valueNumber,
        input.valueBoolean === null
          ? null
          : input.valueBoolean
            ? 1
            : 0,
        input.valueDate,
        input.valueUrl,
        input.sortOrder,
        input.isVisible ? 1 : 0,
        input.now,
        input.now,
        input.itemId,
        tenant.organizationId,
      )
      .run();

    return this.findValue(
      tenant,
      input.itemId,
      input.definitionId,
    );
  }

  async updateValue(
    tenant: TenantContext,
    input: {
      itemId: number;
      definitionId: number;
      expectedVersion: number;
      valueText: string;
      valueNumber: number | null;
      valueBoolean: boolean | null;
      valueDate: string | null;
      valueUrl: string | null;
      sortOrder: number;
      isVisible: boolean;
      now: string;
    },
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE item_attribute_values
         SET
           value_text = ?,
           value_number = ?,
           value_boolean = ?,
           value_date = ?,
           value_url = ?,
           sort_order = ?,
           is_visible = ?,
           version = version + 1,
           updated_at = ?
         WHERE item_id = ?
           AND attribute_definition_id = ?
           AND version = ?
           AND item_id IN (
             SELECT i.id
             FROM catalogue_items i
             INNER JOIN catalogues c
               ON c.id = i.catalogue_id
             WHERE c.organization_id = ?
               AND c.deleted_at IS NULL
               AND i.deleted_at IS NULL
           )`,
      )
      .bind(
        input.valueText,
        input.valueNumber,
        input.valueBoolean === null
          ? null
          : input.valueBoolean
            ? 1
            : 0,
        input.valueDate,
        input.valueUrl,
        input.sortOrder,
        input.isVisible ? 1 : 0,
        input.now,
        input.itemId,
        input.definitionId,
        input.expectedVersion,
        tenant.organizationId,
      )
      .run();

    return result.meta.changes >= 1;
  }

  async deleteValue(
    tenant: TenantContext,
    itemId: number,
    definitionId: number,
    expectedVersion: number,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `DELETE FROM item_attribute_values
         WHERE item_id = ?
           AND attribute_definition_id = ?
           AND version = ?
           AND item_id IN (
             SELECT i.id
             FROM catalogue_items i
             INNER JOIN catalogues c
               ON c.id = i.catalogue_id
             WHERE c.organization_id = ?
               AND c.deleted_at IS NULL
               AND i.deleted_at IS NULL
           )`,
      )
      .bind(
        itemId,
        definitionId,
        expectedVersion,
        tenant.organizationId,
      )
      .run();

    return result.meta.changes >= 1;
  }
}
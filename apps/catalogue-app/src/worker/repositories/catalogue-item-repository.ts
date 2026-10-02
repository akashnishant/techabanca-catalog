import type { TenantContext } from "@techabanca/domain";

export type CatalogueItemType =
  | "product"
  | "service";

export type CatalogueItemStatus =
  | "draft"
  | "published"
  | "hidden";

export type AuthoringItemCatalogueRecord = {
  id: number;
  publicId: string;
  mode: "products" | "services" | "both";
};

export type CatalogueItemRecord = {
  id: number;
  publicId: string;
  catalogueId: number;
  cataloguePublicId: string;
  categoryId: number | null;
  categoryPublicId: string | null;
  itemType: CatalogueItemType;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  priceMinorUnits: number | null;
  currencyCode: string | null;
  showPrice: boolean;
  status: CatalogueItemStatus;
  isFeatured: boolean;
  sortOrder: number;
  version: number;
};

export type CatalogueItemListFilters = {
  search: string | null;
  status: CatalogueItemStatus | null;
  itemType: CatalogueItemType | null;
  categoryId: number | null | undefined;
  limit: number;
  after: {
    sortOrder: number;
    name: string;
    id: number;
  } | null;
};

type CatalogueItemRow = {
  id: number;
  public_id: string;
  catalogue_id: number;
  catalogue_public_id: string;
  category_id: number | null;
  category_public_id: string | null;
  item_type: CatalogueItemType;
  name: string;
  slug: string;
  sku: string | null;
  short_description: string | null;
  long_description: string | null;
  price_minor_units: number | null;
  currency_code: string | null;
  show_price: number;
  status: CatalogueItemStatus;
  is_featured: number;
  sort_order: number;
  version: number;
};

function mapItem(
  row: CatalogueItemRow,
): CatalogueItemRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    catalogueId: row.catalogue_id,
    cataloguePublicId:
      row.catalogue_public_id,
    categoryId: row.category_id,
    categoryPublicId:
      row.category_public_id,
    itemType: row.item_type,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    shortDescription:
      row.short_description,
    longDescription:
      row.long_description,
    priceMinorUnits:
      row.price_minor_units,
    currencyCode:
      row.currency_code,
    showPrice: row.show_price === 1,
    status: row.status,
    isFeatured:
      row.is_featured === 1,
    sortOrder: row.sort_order,
    version: row.version,
  };
}

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

export class CatalogueItemRepository {
  constructor(private readonly db: D1Database) {}

  async findCatalogueForTenant(
    tenant: TenantContext,
  ): Promise<AuthoringItemCatalogueRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, public_id, mode
         FROM catalogues
         WHERE organization_id = ?
           AND deleted_at IS NULL
         ORDER BY id ASC
         LIMIT 1`,
      )
      .bind(tenant.organizationId)
      .first<{
        id: number;
        public_id: string;
        mode: "products" | "services" | "both";
      }>();

    return row
      ? {
          id: row.id,
          publicId: row.public_id,
          mode: row.mode,
        }
      : null;
  }

  async findByPublicId(
    tenant: TenantContext,
    itemPublicId: string,
  ): Promise<CatalogueItemRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           i.id,
           i.public_id,
           i.catalogue_id,
           c.public_id AS catalogue_public_id,
           i.category_id,
           category.public_id AS category_public_id,
           i.item_type,
           i.name,
           i.slug,
           i.sku,
           i.short_description,
           i.long_description,
           i.price_minor_units,
           i.currency_code,
           i.show_price,
           i.status,
           i.is_featured,
           i.sort_order,
           i.version
         FROM catalogue_items i
         INNER JOIN catalogues c
           ON c.id = i.catalogue_id
         LEFT JOIN categories category
           ON category.id = i.category_id
          AND category.deleted_at IS NULL
         WHERE c.organization_id = ?
           AND i.public_id = ?
           AND i.deleted_at IS NULL
           AND c.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(
        tenant.organizationId,
        itemPublicId,
      )
      .first<CatalogueItemRow>();

    return row ? mapItem(row) : null;
  }

  async list(
    tenant: TenantContext,
    catalogueId: number,
    filters: CatalogueItemListFilters,
  ): Promise<CatalogueItemRecord[]> {
    const where = [
      "c.organization_id = ?",
      "c.id = ?",
      "c.deleted_at IS NULL",
      "i.deleted_at IS NULL",
    ];

    const bindings: Array<string | number> = [
      tenant.organizationId,
      catalogueId,
    ];

    if (filters.search !== null) {
      const pattern =
        `%${escapeLike(filters.search.toLowerCase())}%`;

      where.push(
        `(lower(i.name) LIKE ? ESCAPE '\\'
          OR lower(COALESCE(i.sku, '')) LIKE ? ESCAPE '\\'
          OR lower(COALESCE(i.short_description, '')) LIKE ? ESCAPE '\\'
          OR lower(COALESCE(i.long_description, '')) LIKE ? ESCAPE '\\')`,
      );

      bindings.push(
        pattern,
        pattern,
        pattern,
        pattern,
      );
    }

    if (filters.status !== null) {
      where.push("i.status = ?");
      bindings.push(filters.status);
    }

    if (filters.itemType !== null) {
      where.push("i.item_type = ?");
      bindings.push(filters.itemType);
    }

    if (filters.categoryId !== undefined) {
      if (filters.categoryId === null) {
        where.push("i.category_id IS NULL");
      } else {
        where.push("i.category_id = ?");
        bindings.push(filters.categoryId);
      }
    }

    if (filters.after !== null) {
      where.push(
        `(i.sort_order > ?
          OR (
            i.sort_order = ?
            AND i.name COLLATE NOCASE > ?
          )
          OR (
            i.sort_order = ?
            AND i.name COLLATE NOCASE = ?
            AND i.id > ?
          ))`,
      );

      bindings.push(
        filters.after.sortOrder,
        filters.after.sortOrder,
        filters.after.name,
        filters.after.sortOrder,
        filters.after.name,
        filters.after.id,
      );
    }

    bindings.push(filters.limit);

    const rows = await this.db
      .prepare(
        `SELECT
           i.id,
           i.public_id,
           i.catalogue_id,
           c.public_id AS catalogue_public_id,
           i.category_id,
           category.public_id AS category_public_id,
           i.item_type,
           i.name,
           i.slug,
           i.sku,
           i.short_description,
           i.long_description,
           i.price_minor_units,
           i.currency_code,
           i.show_price,
           i.status,
           i.is_featured,
           i.sort_order,
           i.version
         FROM catalogue_items i
         INNER JOIN catalogues c
           ON c.id = i.catalogue_id
         LEFT JOIN categories category
           ON category.id = i.category_id
          AND category.deleted_at IS NULL
         WHERE ${where.join("\n           AND ")}
         ORDER BY
           i.sort_order ASC,
           i.name COLLATE NOCASE ASC,
           i.id ASC
         LIMIT ?`,
      )
      .bind(...bindings)
      .all<CatalogueItemRow>();

    return rows.results.map(mapItem);
  }

  async slugExists(
    tenant: TenantContext,
    catalogueId: number,
    slug: string,
    excludeItemId?: number,
  ): Promise<boolean> {
    const row = excludeItemId === undefined
      ? await this.db
          .prepare(
            `SELECT i.id
             FROM catalogue_items i
             INNER JOIN catalogues c
               ON c.id = i.catalogue_id
             WHERE c.organization_id = ?
               AND c.id = ?
               AND c.deleted_at IS NULL
               AND i.slug = ?
               AND i.deleted_at IS NULL
             LIMIT 1`,
          )
          .bind(
            tenant.organizationId,
            catalogueId,
            slug,
          )
          .first<{ id: number }>()
      : await this.db
          .prepare(
            `SELECT i.id
             FROM catalogue_items i
             INNER JOIN catalogues c
               ON c.id = i.catalogue_id
             WHERE c.organization_id = ?
               AND c.id = ?
               AND c.deleted_at IS NULL
               AND i.slug = ?
               AND i.id <> ?
               AND i.deleted_at IS NULL
             LIMIT 1`,
          )
          .bind(
            tenant.organizationId,
            catalogueId,
            slug,
            excludeItemId,
          )
          .first<{ id: number }>();

    return row !== null;
  }

  async skuExists(
    tenant: TenantContext,
    catalogueId: number,
    sku: string,
    excludeItemId?: number,
  ): Promise<boolean> {
    const row = excludeItemId === undefined
      ? await this.db
          .prepare(
            `SELECT i.id
             FROM catalogue_items i
             INNER JOIN catalogues c
               ON c.id = i.catalogue_id
             WHERE c.organization_id = ?
               AND c.id = ?
               AND c.deleted_at IS NULL
               AND i.sku = ?
               AND i.deleted_at IS NULL
             LIMIT 1`,
          )
          .bind(
            tenant.organizationId,
            catalogueId,
            sku,
          )
          .first<{ id: number }>()
      : await this.db
          .prepare(
            `SELECT i.id
             FROM catalogue_items i
             INNER JOIN catalogues c
               ON c.id = i.catalogue_id
             WHERE c.organization_id = ?
               AND c.id = ?
               AND c.deleted_at IS NULL
               AND i.sku = ?
               AND i.id <> ?
               AND i.deleted_at IS NULL
             LIMIT 1`,
          )
          .bind(
            tenant.organizationId,
            catalogueId,
            sku,
            excludeItemId,
          )
          .first<{ id: number }>();

    return row !== null;
  }

  async create(
    tenant: TenantContext,
    input: {
      publicId: string;
      catalogueId: number;
      categoryId: number | null;
      itemType: CatalogueItemType;
      name: string;
      slug: string;
      sku: string | null;
      shortDescription: string | null;
      longDescription: string | null;
      priceMinorUnits: number | null;
      currencyCode: string | null;
      showPrice: boolean;
      status: CatalogueItemStatus;
      isFeatured: boolean;
      sortOrder: number;
      now: string;
    },
  ): Promise<CatalogueItemRecord | null> {
    await this.db
      .prepare(
        `INSERT INTO catalogue_items (
           public_id,
           catalogue_id,
           category_id,
           item_type,
           name,
           slug,
           sku,
           short_description,
           long_description,
           price_minor_units,
           currency_code,
           show_price,
           status,
           is_featured,
           sort_order,
           created_at,
           updated_at
         )
         SELECT
           ?,
           c.id,
           ?,
           ?,
           ?,
           ?,
           ?,
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
         FROM catalogues c
         WHERE c.id = ?
           AND c.organization_id = ?
           AND c.deleted_at IS NULL`,
      )
      .bind(
        input.publicId,
        input.categoryId,
        input.itemType,
        input.name,
        input.slug,
        input.sku,
        input.shortDescription,
        input.longDescription,
        input.priceMinorUnits,
        input.currencyCode,
        input.showPrice ? 1 : 0,
        input.status,
        input.isFeatured ? 1 : 0,
        input.sortOrder,
        input.now,
        input.now,
        input.catalogueId,
        tenant.organizationId,
      )
      .run();

    return this.findByPublicId(
      tenant,
      input.publicId,
    );
  }

  async update(
    tenant: TenantContext,
    itemId: number,
    expectedVersion: number,
    input: {
      categoryId: number | null;
      itemType: CatalogueItemType;
      name: string;
      slug: string;
      sku: string | null;
      shortDescription: string | null;
      longDescription: string | null;
      priceMinorUnits: number | null;
      currencyCode: string | null;
      showPrice: boolean;
      status: CatalogueItemStatus;
      isFeatured: boolean;
      sortOrder: number;
      now: string;
    },
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE catalogue_items
         SET
           category_id = ?,
           item_type = ?,
           name = ?,
           slug = ?,
           sku = ?,
           short_description = ?,
           long_description = ?,
           price_minor_units = ?,
           currency_code = ?,
           show_price = ?,
           status = ?,
           is_featured = ?,
           sort_order = ?,
           version = version + 1,
           updated_at = ?
         WHERE id = ?
           AND version = ?
           AND deleted_at IS NULL
           AND catalogue_id IN (
             SELECT id
             FROM catalogues
             WHERE organization_id = ?
               AND deleted_at IS NULL
           )`,
      )
      .bind(
        input.categoryId,
        input.itemType,
        input.name,
        input.slug,
        input.sku,
        input.shortDescription,
        input.longDescription,
        input.priceMinorUnits,
        input.currencyCode,
        input.showPrice ? 1 : 0,
        input.status,
        input.isFeatured ? 1 : 0,
        input.sortOrder,
        input.now,
        itemId,
        expectedVersion,
        tenant.organizationId,
      )
      .run();

    return result.meta.changes >= 1;
  }

  async softDelete(
    tenant: TenantContext,
    itemId: number,
    expectedVersion: number,
    now: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE catalogue_items
         SET
           deleted_at = ?,
           updated_at = ?,
           version = version + 1
         WHERE id = ?
           AND version = ?
           AND deleted_at IS NULL
           AND catalogue_id IN (
             SELECT id
             FROM catalogues
             WHERE organization_id = ?
               AND deleted_at IS NULL
           )`,
      )
      .bind(
        now,
        now,
        itemId,
        expectedVersion,
        tenant.organizationId,
      )
      .run();

    return result.meta.changes >= 1;
  }
}
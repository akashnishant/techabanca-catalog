import type { TenantContext } from "@techabanca/domain";

export type AuthoringCatalogueRecord = {
  id: number;
  publicId: string;
};

export type CategoryRecord = {
  id: number;
  publicId: string;
  catalogueId: number;
  cataloguePublicId: string;
  parentId: number | null;
  parentPublicId: string | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isVisible: boolean;
  version: number;
};

type CategoryRow = {
  id: number;
  public_id: string;
  catalogue_id: number;
  catalogue_public_id: string;
  parent_id: number | null;
  parent_public_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_visible: number;
  version: number;
};

function mapCategory(row: CategoryRow): CategoryRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    catalogueId: row.catalogue_id,
    cataloguePublicId: row.catalogue_public_id,
    parentId: row.parent_id,
    parentPublicId: row.parent_public_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    isVisible: row.is_visible === 1,
    version: row.version,
  };
}

export class CategoryRepository {
  constructor(private readonly db: D1Database) {}

  async findCatalogueForTenant(
    tenant: TenantContext,
  ): Promise<AuthoringCatalogueRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT id, public_id
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
      }>();

    return row
      ? {
          id: row.id,
          publicId: row.public_id,
        }
      : null;
  }

  async list(
    tenant: TenantContext,
    catalogueId: number,
  ): Promise<CategoryRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT
           c.id,
           c.public_id,
           c.catalogue_id,
           catalogue.public_id AS catalogue_public_id,
           c.parent_id,
           parent.public_id AS parent_public_id,
           c.name,
           c.slug,
           c.description,
           c.sort_order,
           c.is_visible,
           c.version
         FROM categories c
         INNER JOIN catalogues catalogue
           ON catalogue.id = c.catalogue_id
         LEFT JOIN categories parent
           ON parent.id = c.parent_id
          AND parent.deleted_at IS NULL
         WHERE catalogue.organization_id = ?
           AND catalogue.id = ?
           AND catalogue.deleted_at IS NULL
           AND c.deleted_at IS NULL
         ORDER BY
           CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
           c.sort_order ASC,
           c.name COLLATE NOCASE ASC,
           c.id ASC`,
      )
      .bind(tenant.organizationId, catalogueId)
      .all<CategoryRow>();

    return rows.results.map(mapCategory);
  }

  async findByPublicId(
    tenant: TenantContext,
    categoryPublicId: string,
  ): Promise<CategoryRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT
           c.id,
           c.public_id,
           c.catalogue_id,
           catalogue.public_id AS catalogue_public_id,
           c.parent_id,
           parent.public_id AS parent_public_id,
           c.name,
           c.slug,
           c.description,
           c.sort_order,
           c.is_visible,
           c.version
         FROM categories c
         INNER JOIN catalogues catalogue
           ON catalogue.id = c.catalogue_id
         LEFT JOIN categories parent
           ON parent.id = c.parent_id
          AND parent.deleted_at IS NULL
         WHERE catalogue.organization_id = ?
           AND catalogue.deleted_at IS NULL
           AND c.public_id = ?
           AND c.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tenant.organizationId, categoryPublicId)
      .first<CategoryRow>();

    return row ? mapCategory(row) : null;
  }

  async slugExists(
    tenant: TenantContext,
    catalogueId: number,
    slug: string,
    excludeCategoryId?: number,
  ): Promise<boolean> {
    const row = excludeCategoryId === undefined
      ? await this.db
          .prepare(
            `SELECT c.id
             FROM categories c
             INNER JOIN catalogues catalogue
               ON catalogue.id = c.catalogue_id
             WHERE catalogue.organization_id = ?
               AND catalogue.id = ?
               AND catalogue.deleted_at IS NULL
               AND c.slug = ?
               AND c.deleted_at IS NULL
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
            `SELECT c.id
             FROM categories c
             INNER JOIN catalogues catalogue
               ON catalogue.id = c.catalogue_id
             WHERE catalogue.organization_id = ?
               AND catalogue.id = ?
               AND catalogue.deleted_at IS NULL
               AND c.slug = ?
               AND c.id <> ?
               AND c.deleted_at IS NULL
             LIMIT 1`,
          )
          .bind(
            tenant.organizationId,
            catalogueId,
            slug,
            excludeCategoryId,
          )
          .first<{ id: number }>();

    return row !== null;
  }

  async hasActiveChildren(
    tenant: TenantContext,
    categoryId: number,
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT child.id
         FROM categories child
         INNER JOIN categories parent
           ON parent.id = child.parent_id
         INNER JOIN catalogues catalogue
           ON catalogue.id = parent.catalogue_id
         WHERE catalogue.organization_id = ?
           AND catalogue.deleted_at IS NULL
           AND parent.id = ?
           AND parent.deleted_at IS NULL
           AND child.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tenant.organizationId, categoryId)
      .first<{ id: number }>();

    return row !== null;
  }

  async create(
    tenant: TenantContext,
    input: {
      publicId: string;
      catalogueId: number;
      parentId: number | null;
      name: string;
      slug: string;
      description: string | null;
      sortOrder: number;
      isVisible: boolean;
      now: string;
    },
  ): Promise<CategoryRecord | null> {
    await this.db
      .prepare(
        `INSERT INTO categories (
           public_id,
           catalogue_id,
           parent_id,
           name,
           slug,
           description,
           sort_order,
           is_visible,
           created_at,
           updated_at
         )
         SELECT
           ?,
           catalogue.id,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?
         FROM catalogues catalogue
         WHERE catalogue.id = ?
           AND catalogue.organization_id = ?
           AND catalogue.deleted_at IS NULL`,
      )
      .bind(
        input.publicId,
        input.parentId,
        input.name,
        input.slug,
        input.description,
        input.sortOrder,
        input.isVisible ? 1 : 0,
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
    categoryId: number,
    expectedVersion: number,
    input: {
      parentId: number | null;
      name: string;
      slug: string;
      description: string | null;
      sortOrder: number;
      isVisible: boolean;
      now: string;
    },
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE categories
         SET
           parent_id = ?,
           name = ?,
           slug = ?,
           description = ?,
           sort_order = ?,
           is_visible = ?,
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
        input.parentId,
        input.name,
        input.slug,
        input.description,
        input.sortOrder,
        input.isVisible ? 1 : 0,
        input.now,
        categoryId,
        expectedVersion,
        tenant.organizationId,
      )
      .run();

    return (result.meta.changes ?? 0) > 0;
  }

  async softDelete(
    tenant: TenantContext,
    categoryId: number,
    expectedVersion: number,
    now: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE categories
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
        categoryId,
        expectedVersion,
        tenant.organizationId,
      )
      .run();

    return result.meta.changes >= 1;
  }
}
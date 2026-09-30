import type { TenantContext } from "@techabanca/domain";

export type CatalogueItemRecord = {
  id: number;
  publicId: string;
  catalogueId: number;
  categoryId: number | null;
  itemType: "product" | "service";
  name: string;
  slug: string;
  sku: string | null;
  priceMinorUnits: number | null;
  currencyCode: string | null;
  showPrice: boolean;
  status: "draft" | "published" | "hidden";
  isFeatured: boolean;
  version: number;
};

type CatalogueItemRow = {
  id: number;
  public_id: string;
  catalogue_id: number;
  category_id: number | null;
  item_type: "product" | "service";
  name: string;
  slug: string;
  sku: string | null;
  price_minor_units: number | null;
  currency_code: string | null;
  show_price: number;
  status: "draft" | "published" | "hidden";
  is_featured: number;
  version: number;
};

export class CatalogueItemRepository {
  constructor(private readonly db: D1Database) {}

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
           i.category_id,
           i.item_type,
           i.name,
           i.slug,
           i.sku,
           i.price_minor_units,
           i.currency_code,
           i.show_price,
           i.status,
           i.is_featured,
           i.version
         FROM catalogue_items i
         INNER JOIN catalogues c
           ON c.id = i.catalogue_id
         WHERE c.organization_id = ?
           AND i.public_id = ?
           AND i.deleted_at IS NULL
           AND c.deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tenant.organizationId, itemPublicId)
      .first<CatalogueItemRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      publicId: row.public_id,
      catalogueId: row.catalogue_id,
      categoryId: row.category_id,
      itemType: row.item_type,
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      priceMinorUnits: row.price_minor_units,
      currencyCode: row.currency_code,
      showPrice: row.show_price === 1,
      status: row.status,
      isFeatured: row.is_featured === 1,
      version: row.version,
    };
  }
}

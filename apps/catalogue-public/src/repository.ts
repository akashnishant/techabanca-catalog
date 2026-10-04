import type { Attribute, Category, Detail, Document, Filters, Image, Item, ItemPage, Media, Site } from "./model";

const itemSelect = "SELECT i.*, (SELECT m.asset_public_id FROM published_item_images m WHERE m.publication_id = i.publication_id AND m.item_public_id = i.item_public_id AND m.mime_type IN ('image/png', 'image/jpeg', 'image/webp') ORDER BY m.is_primary DESC, m.sort_order, m.asset_public_id LIMIT 1) AS cover_asset_public_id FROM published_items i";
export class PublicRepository {
  constructor(private readonly db: D1Database) {}
  async site(slug: string): Promise<Site | null> {
    return this.db.prepare(
      "SELECT pc.*, p.public_id AS publication_public_id, p.revision_number FROM public_catalogue_routes r "
      + "JOIN catalogue_publications p ON p.id = r.publication_id JOIN published_catalogues pc ON pc.publication_id = p.id "
      + "WHERE r.slug = ? AND r.status = 'active' AND p.state = 'active' AND pc.slug = r.slug "
      + "AND pc.catalogue_public_id = r.catalogue_public_id AND p.catalogue_public_id = r.catalogue_public_id "
      + "AND NOT EXISTS (SELECT 1 FROM reserved_slugs rs WHERE rs.slug = r.slug) LIMIT 1",
    ).bind(slug).first<Site>();
  }
  async categories(site: Site): Promise<Category[]> {
    return (await this.db.prepare("SELECT * FROM published_categories WHERE publication_id = ? ORDER BY sort_order, name, category_public_id")
      .bind(site.publication_id).all<Category>()).results;
  }
  async items(site: Site, filters: Filters, categoryId: string | null = null, pageSize = 24): Promise<ItemPage> {
    const conditions = ["i.publication_id = ?"];
    const bindings: Array<string | number> = [site.publication_id];
    if (filters.query) {
      const query = "%" + filters.query.replace(/[\\%_]/g, match => "\\" + match) + "%";
      conditions.push("(i.name LIKE ? ESCAPE '\\' OR COALESCE(i.sku, '') LIKE ? ESCAPE '\\' OR COALESCE(i.short_description, '') LIKE ? ESCAPE '\\')");
      bindings.push(query, query, query);
    }
    if (filters.type !== "all") { conditions.push("i.item_type = ?"); bindings.push(filters.type); }
    if (categoryId) {
      conditions.push("(i.category_public_id = ? OR i.category_public_id IN (SELECT category_public_id FROM published_categories WHERE publication_id = ? AND parent_category_public_id = ?))");
      bindings.push(categoryId, site.publication_id, categoryId);
    }
    if (filters.featured) conditions.push("i.is_featured = 1");
    const where = " WHERE " + conditions.join(" AND ");
    const results = await this.db.batch([
      this.db.prepare("SELECT count(*) AS total FROM published_items i" + where).bind(...bindings),
      this.db.prepare(itemSelect + where + " ORDER BY i.sort_order, i.name, i.item_public_id LIMIT ? OFFSET ?")
        .bind(...bindings, pageSize, (filters.page - 1) * pageSize),
    ]);
    return { total: (results[0].results[0] as { total: number }).total, items: results[1].results as Item[], page: filters.page, pageSize };
  }
  async detail(site: Site, slug: string): Promise<Detail | null> {
    const item = await this.db.prepare(itemSelect + " WHERE i.publication_id = ? AND i.slug = ?")
      .bind(site.publication_id, slug).first<Item>();
    if (!item) return null;
    const results = await this.db.batch([
      this.db.prepare("SELECT attribute_code, label, value_text, unit_hint, sort_order FROM published_item_attributes WHERE publication_id = ? AND item_public_id = ? ORDER BY sort_order, attribute_code")
        .bind(site.publication_id, item.item_public_id),
      this.db.prepare("SELECT asset_public_id, mime_type, alt_text, is_primary, sort_order FROM published_item_images WHERE publication_id = ? AND item_public_id = ? AND mime_type IN ('image/png', 'image/jpeg', 'image/webp') ORDER BY is_primary DESC, sort_order, asset_public_id")
        .bind(site.publication_id, item.item_public_id),
      this.db.prepare("SELECT asset_public_id, mime_type, label, sort_order FROM published_item_documents WHERE publication_id = ? AND item_public_id = ? AND mime_type = 'application/pdf' ORDER BY sort_order, asset_public_id")
        .bind(site.publication_id, item.item_public_id),
    ]);
    return { item, attributes: results[0].results as Attribute[], images: results[1].results as Image[], documents: results[2].results as Document[] };
  }
  async media(site: Site, assetId: string): Promise<Media | null> {
    return this.db.prepare(
      "SELECT logo_object_key AS object_key, NULL AS mime_type, 'image' AS kind, NULL AS label FROM published_catalogues WHERE publication_id = ? AND logo_asset_public_id = ? AND logo_object_key IS NOT NULL "
      + "UNION ALL SELECT hero_object_key, NULL, 'image', NULL FROM published_catalogues WHERE publication_id = ? AND hero_asset_public_id = ? AND hero_object_key IS NOT NULL "
      + "UNION ALL SELECT object_key, mime_type, 'image', NULL FROM published_item_images WHERE publication_id = ? AND asset_public_id = ? "
      + "UNION ALL SELECT object_key, mime_type, 'document', label FROM published_item_documents WHERE publication_id = ? AND asset_public_id = ? LIMIT 1",
    ).bind(site.publication_id, assetId, site.publication_id, assetId, site.publication_id, assetId, site.publication_id, assetId).first<Media>();
  }
}

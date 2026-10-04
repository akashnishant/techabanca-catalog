import type {
  ItemMedia, ReadyAssetSummary, TenantContext, WebsiteMedia,
} from "@techabanca/domain";

type AssetRow = {
  asset_public_id: string; asset_kind: "image" | "document"; original_filename: string;
  mime_type: string; byte_size: number; asset_version: number;
};
type ImageRow = AssetRow & { alt_text: string | null; sort_order: number; is_primary: number };
type DocumentRow = AssetRow & { label: string | null; sort_order: number; is_visible: number };
const assetColumns = "a.public_id AS asset_public_id, a.asset_kind, a.original_filename, a.mime_type, a.byte_size, a.version AS asset_version";
function summary(row: AssetRow): ReadyAssetSummary {
  return { id: row.asset_public_id, assetKind: row.asset_kind, originalFilename: row.original_filename,
    mimeType: row.mime_type, byteSize: row.byte_size, version: row.asset_version };
}
export class MediaRepository {
  constructor(private readonly db: D1Database) {}

  async item(tenant: TenantContext, id: string) {
    return this.db.prepare(
      "SELECT i.id, i.media_version FROM catalogue_items i JOIN catalogues c ON c.id = i.catalogue_id "
      + "WHERE c.organization_id = ? AND i.public_id = ? AND i.deleted_at IS NULL AND c.deleted_at IS NULL",
    ).bind(tenant.organizationId, id).first<{ id: number; media_version: number }>();
  }
  async getItem(tenant: TenantContext, publicId: string): Promise<ItemMedia | null> {
    // The reads share a batch, so the revision and both collections form one view.
    const scoped = "SELECT i.id FROM catalogue_items i JOIN catalogues c ON c.id = i.catalogue_id "
      + "WHERE c.organization_id = ? AND i.public_id = ? AND i.deleted_at IS NULL AND c.deleted_at IS NULL";
    const results = await this.db.batch([
      this.db.prepare("SELECT i.media_version FROM catalogue_items i WHERE i.id IN (" + scoped + ")")
        .bind(tenant.organizationId, publicId),
      this.db.prepare("SELECT " + assetColumns + ", m.alt_text, m.sort_order, m.is_primary "
        + "FROM item_images m JOIN assets a ON a.id = m.asset_id WHERE m.item_id IN (" + scoped + ") "
        + "AND a.status = 'ready' AND a.deleted_at IS NULL ORDER BY m.sort_order, m.id")
        .bind(tenant.organizationId, publicId),
      this.db.prepare("SELECT " + assetColumns + ", m.label, m.sort_order, m.is_visible "
        + "FROM item_documents m JOIN assets a ON a.id = m.asset_id WHERE m.item_id IN (" + scoped + ") "
        + "AND a.status = 'ready' AND a.deleted_at IS NULL ORDER BY m.sort_order, m.id")
        .bind(tenant.organizationId, publicId),
    ]);
    const item = results[0].results[0] as { media_version: number } | undefined;
    if (!item) return null;
    return { itemId: publicId, version: item.media_version,
      images: (results[1].results as ImageRow[]).map(row => ({
        assetId: row.asset_public_id, asset: summary(row), altText: row.alt_text,
        sortOrder: row.sort_order, isPrimary: row.is_primary === 1,
      })),
      documents: (results[2].results as DocumentRow[]).map(row => ({
        assetId: row.asset_public_id, asset: summary(row), label: row.label,
        sortOrder: row.sort_order, isVisible: row.is_visible === 1,
      })),
    };
  }
  async replaceItem(tenant: TenantContext, itemId: number, version: number,
    images: Array<{ assetId: number; altText: string | null; isPrimary: boolean }>,
    documents: Array<{ assetId: number; label: string | null; isVisible: boolean }>) {
    const token = crypto.randomUUID();
    const now = new Date().toISOString();
    const guard = "SELECT i.id FROM catalogue_items i JOIN catalogues c ON c.id = i.catalogue_id "
      + "WHERE i.id = ? AND i.media_write_token = ? AND c.organization_id = ? "
      + "AND i.deleted_at IS NULL AND c.deleted_at IS NULL";
    const statements = [
      this.db.prepare("UPDATE catalogue_items SET media_version = media_version + 1, media_write_token = ?, updated_at = ? "
        + "WHERE id = ? AND media_version = ? AND deleted_at IS NULL AND catalogue_id IN "
        + "(SELECT id FROM catalogues WHERE organization_id = ? AND deleted_at IS NULL)")
        .bind(token, now, itemId, version, tenant.organizationId),
      this.db.prepare("DELETE FROM item_images WHERE item_id IN (" + guard + ")").bind(itemId, token, tenant.organizationId),
      this.db.prepare("DELETE FROM item_documents WHERE item_id IN (" + guard + ")").bind(itemId, token, tenant.organizationId),
    ];
    images.forEach((image, order) => statements.push(this.db.prepare(
      "INSERT INTO item_images (item_id, asset_id, alt_text, sort_order, is_primary, created_at) "
      + "SELECT i.id, ?, ?, ?, ?, ? FROM catalogue_items i WHERE i.id IN (" + guard + ")",
    ).bind(image.assetId, image.altText, order, Number(image.isPrimary), now, itemId, token, tenant.organizationId)));
    documents.forEach((document, order) => statements.push(this.db.prepare(
      "INSERT INTO item_documents (item_id, asset_id, label, sort_order, is_visible, created_at) "
      + "SELECT i.id, ?, ?, ?, ?, ? FROM catalogue_items i WHERE i.id IN (" + guard + ")",
    ).bind(document.assetId, document.label, order, Number(document.isVisible), now, itemId, token, tenant.organizationId)));
    const result = await this.db.batch(statements);
    return result[0].meta.changes === 1;
  }
  async readyAssets(tenant: TenantContext, kind: "image" | "document", after: string | null) {
    const result = await this.db.prepare("SELECT " + assetColumns + " FROM assets a "
      + "WHERE a.organization_id = ? AND a.asset_kind = ? AND a.status = 'ready' AND a.deleted_at IS NULL "
      + "AND a.public_id > ? ORDER BY a.public_id LIMIT 25")
      .bind(tenant.organizationId, kind, after ?? "").all<AssetRow>();
    const assets = result.results.slice(0, 24).map(summary);
    return { assets, nextCursor: result.results.length > 24 ? assets.at(-1)!.id : null };
  }
  async getWebsite(tenant: TenantContext): Promise<WebsiteMedia | null> {
    const row = await this.db.prepare(
      "SELECT s.version, c.public_id, s.logo_asset_id, s.hero_asset_id FROM catalogue_website_settings s "
      + "JOIN catalogues c ON c.id = s.catalogue_id WHERE c.organization_id = ? AND c.deleted_at IS NULL",
    ).bind(tenant.organizationId).first<{ version: number; public_id: string; logo_asset_id: number | null; hero_asset_id: number | null }>();
    if (!row) return null;
    const assets = await this.db.prepare("SELECT id, " + assetColumns + " FROM assets a "
      + "WHERE a.organization_id = ? AND a.status = 'ready' AND a.deleted_at IS NULL AND a.id IN (?, ?)")
      .bind(tenant.organizationId, row.logo_asset_id, row.hero_asset_id).all<AssetRow & { id: number }>();
    const logo = assets.results.find(asset => asset.id === row.logo_asset_id);
    const hero = assets.results.find(asset => asset.id === row.hero_asset_id);
    return { catalogueId: row.public_id, version: row.version, logo: logo ? summary(logo) : null, hero: hero ? summary(hero) : null };
  }
  async replaceWebsite(tenant: TenantContext, version: number, logo: number | null, hero: number | null) {
    const result = await this.db.prepare(
      "UPDATE catalogue_website_settings SET logo_asset_id = ?, hero_asset_id = ?, version = version + 1, updated_at = ? "
      + "WHERE version = ? AND catalogue_id IN (SELECT id FROM catalogues WHERE organization_id = ? AND deleted_at IS NULL)",
    ).bind(logo, hero, new Date().toISOString(), version, tenant.organizationId).run();
    return result.meta.changes === 1;
  }
}

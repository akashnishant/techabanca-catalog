import type { TenantContext } from "@techabanca/domain";
import { publicationActorSql, publicationPolicySql } from "../services/publication-policy";

export type SourceHeader = {
 id: number; catalogue_public_id: string; organization_id: number; name: string; slug: string;
 mode: "products" | "services" | "both"; status: string; version: number; authoring_revision: number;
 business_name: string | null; about_text: string | null; contact_email: string | null;
 contact_phone: string | null; whatsapp_number: string | null; address_text: string | null;
 theme_code: string | null; theme_active: number | null; logo_asset_id: number | null; hero_asset_id: number | null;
 hero_title: string | null; hero_subtitle: string | null; hero_cta_label: string | null; hero_cta_target: string;
 show_featured_items: number; show_categories: number; show_about: number; show_contact: number;
 show_whatsapp: number; show_phone: number; show_email: number; seo_title: string | null; seo_description: string | null;
 base_publication_id: number | null; route_status: string | null; business_type_active: number | null;
};
export type PublicationRecord = {
 id: number; public_id: string; catalogue_id: number; catalogue_public_id: string; revision_number: number;
 state: "building" | "active" | "retired" | "failed"; source_authoring_revision: number | null;
 base_publication_id: number | null; sealed_at: string | null; preview_expires_at: string | null;
 preview_revoked_at: string | null; created_at: string; activated_at: string | null;
};
export type SourceAsset = {
 id: number; public_id: string; organization_id: number; asset_kind: string; expected_kind: string;
 object_key: string; mime_type: string; byte_size: number; status: string; deleted_at: string | null;
 verified_at: string | null; checksum_sha256: string | null; etag: string | null;
};
export type PublicationSource = {
 header: SourceHeader; counts: { eligible: number; draft: number; hidden: number; excluded: number };
 assets: SourceAsset[]; invalidPrimary: Array<{ name: string }>; missingRequired: Array<{ name: string; label: string }>;
};
const catalogue = "(SELECT id FROM catalogues WHERE organization_id = ? AND deleted_at IS NULL AND status <> 'archived' ORDER BY id LIMIT 1)";
const headerSql = `SELECT c.id, c.public_id AS catalogue_public_id, c.organization_id, c.name, c.slug,
 c.mode, c.status, c.version, c.authoring_revision, profile.legal_or_display_name AS business_name,
 profile.about_text, profile.email AS contact_email, profile.phone AS contact_phone, profile.whatsapp_number,
 NULLIF(trim(COALESCE(profile.address_line_1 || ', ', '') || COALESCE(profile.address_line_2 || ', ', '')
   || COALESCE(profile.city || ', ', '') || COALESCE(profile.state_region || ', ', '') || COALESCE(profile.postal_code, ''), ', '), '') AS address_text,
 w.theme_code, theme.is_active AS theme_active, w.logo_asset_id, w.hero_asset_id,
 w.hero_title, w.hero_subtitle, w.hero_cta_label, w.hero_cta_target,
 w.show_featured_items, w.show_categories, w.show_about, w.show_contact,
 w.show_whatsapp, w.show_phone, w.show_email, w.seo_title, w.seo_description,
 route.publication_id AS base_publication_id, route.status AS route_status, business_type.is_active AS business_type_active
 FROM catalogues c JOIN organizations o ON o.id = c.organization_id
 LEFT JOIN business_types business_type ON business_type.id = o.business_type_id
 LEFT JOIN business_profiles profile ON profile.organization_id = c.organization_id
 LEFT JOIN catalogue_website_settings w ON w.catalogue_id = c.id
 LEFT JOIN theme_presets theme ON theme.code = w.theme_code
 LEFT JOIN public_catalogue_routes route ON route.catalogue_public_id = c.public_id
 WHERE c.organization_id = ? AND c.deleted_at IS NULL AND c.status <> 'archived'
   AND o.status = 'active' AND o.deleted_at IS NULL ORDER BY c.id LIMIT 1`;

export class PublicationRepository {
 constructor(private readonly db: D1Database) {}
 async source(tenant: TenantContext): Promise<PublicationSource | null> {
  const org = tenant.organizationId;
  const results = await this.db.batch([
   this.db.prepare(headerSql).bind(org),
   this.db.prepare(`SELECT
    (SELECT count(*) FROM publication_eligible_items WHERE catalogue_id = ${catalogue}) AS eligible,
    sum(status = 'draft') AS draft, sum(status = 'hidden') AS hidden,
    sum(status = 'published') - (SELECT count(*) FROM publication_eligible_items WHERE catalogue_id = ${catalogue}) AS excluded
    FROM catalogue_items WHERE catalogue_id = ${catalogue} AND deleted_at IS NULL`).bind(org, org, org),
   this.db.prepare(`SELECT a.*, reference.expected_kind FROM (
    SELECT logo_asset_id AS asset_id, 'image' AS expected_kind FROM catalogue_website_settings WHERE catalogue_id = ${catalogue} AND logo_asset_id IS NOT NULL
    UNION SELECT hero_asset_id, 'image' FROM catalogue_website_settings WHERE catalogue_id = ${catalogue} AND hero_asset_id IS NOT NULL
    UNION SELECT m.asset_id, 'image' FROM item_images m JOIN publication_eligible_items i ON i.id = m.item_id WHERE i.catalogue_id = ${catalogue}
    UNION SELECT m.asset_id, 'document' FROM item_documents m JOIN publication_eligible_items i ON i.id = m.item_id WHERE i.catalogue_id = ${catalogue} AND m.is_visible = 1
    ) reference LEFT JOIN assets a ON a.id = reference.asset_id ORDER BY reference.asset_id`).bind(org, org, org, org),
   this.db.prepare(`SELECT i.name FROM publication_eligible_items i JOIN item_images m ON m.item_id = i.id
    WHERE i.catalogue_id = ${catalogue} GROUP BY i.id HAVING sum(m.is_primary) <> 1 LIMIT 20`).bind(org),
   this.db.prepare(`SELECT i.name, a.label FROM publication_eligible_items i JOIN catalogues c ON c.id = i.catalogue_id
    JOIN organizations o ON o.id = c.organization_id
    JOIN business_type_attributes required ON required.business_type_id = o.business_type_id AND required.is_required = 1
    JOIN attribute_definitions a ON a.id = required.attribute_definition_id AND a.is_active = 1 AND (a.applies_to = 'both' OR a.applies_to = i.item_type)
    WHERE i.catalogue_id = ${catalogue} AND NOT EXISTS (SELECT 1 FROM item_attribute_values value WHERE value.item_id = i.id AND value.attribute_definition_id = a.id)
    LIMIT 20`).bind(org),
  ]);
  const header = results[0].results[0] as SourceHeader | undefined;
  if (!header) return null;
  const counts = results[1].results[0] as PublicationSource["counts"];
  return { header, counts: { eligible: counts.eligible, draft: counts.draft || 0, hidden: counts.hidden || 0, excluded: counts.excluded || 0 },
    assets: results[2].results as SourceAsset[], invalidPrimary: results[3].results as Array<{ name: string }>,
    missingRequired: results[4].results as Array<{ name: string; label: string }> };
 }
 async history(tenant: TenantContext): Promise<PublicationRecord[]> {
  return (await this.db.prepare(`SELECT p.* FROM catalogue_publications p JOIN catalogues c ON c.id = p.catalogue_id
   WHERE c.organization_id = ? AND c.deleted_at IS NULL ORDER BY p.revision_number DESC LIMIT 20`).bind(tenant.organizationId).all<PublicationRecord>()).results;
 }
 async find(tenant: TenantContext, publicId: string): Promise<PublicationRecord | null> {
  return this.db.prepare(`SELECT p.* FROM catalogue_publications p JOIN catalogues c ON c.id = p.catalogue_id
   WHERE c.organization_id = ? AND c.deleted_at IS NULL AND p.public_id = ?`).bind(tenant.organizationId, publicId).first<PublicationRecord>();
 }
 private audit(org: number, actor: number, action: string, id: string, now: string) {
  return this.db.prepare(`INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, entity_type, entity_public_id, created_at)
   VALUES (?, ?, 'user', ?, 'publication', ?, ?)`).bind(org, actor, action, id, now);
 }
 async build(tenant: TenantContext, source: PublicationSource, actor: number, id: string, now: string, expires: string, allowUnsubscribed: boolean): Promise<PublicationRecord> {
  const c = source.header;
  const pub = "(SELECT id FROM catalogue_publications WHERE public_id = ?)";
  const columns = ["name", "mode", "theme_code", "business_name", "about_text", "contact_email", "contact_phone", "whatsapp_number", "address_text",
   "hero_title", "hero_subtitle", "hero_cta_label", "hero_cta_target", "show_featured_items", "show_categories", "show_about", "show_contact", "show_whatsapp", "show_phone", "show_email", "seo_title", "seo_description"] as const;
  const publicHeader = { ...c,
   about_text: c.show_about === 1 ? c.about_text : null,
   contact_email: c.show_contact === 1 && c.show_email === 1 ? c.contact_email : null,
   contact_phone: c.show_contact === 1 && c.show_phone === 1 ? c.contact_phone : null,
   whatsapp_number: c.show_contact === 1 && c.show_whatsapp === 1 ? c.whatsapp_number : null,
   address_text: c.show_contact === 1 ? c.address_text : null };
  const values = columns.map(column => publicHeader[column]);
  const logo = source.assets.find(a => a.id === c.logo_asset_id), hero = source.assets.find(a => a.id === c.hero_asset_id);
  await this.db.batch([
   // The guarded INSERT either creates this exact source revision or fails the entire batch.
   this.db.prepare(`INSERT INTO catalogue_publications (public_id, catalogue_id, catalogue_public_id, revision_number,
    state, source_catalogue_version, source_authoring_revision, base_publication_id, created_at, preview_expires_at)
    SELECT ?, c.id, c.public_id, COALESCE((SELECT max(revision_number) FROM catalogue_publications WHERE catalogue_id = c.id), 0) + 1,
      'building', c.version, ?, ?, ?, ? FROM catalogues c
    WHERE c.id = ? AND c.organization_id = ? AND ${publicationActorSql} AND ${publicationPolicySql}`)
    .bind(id, c.authoring_revision, c.base_publication_id, now, expires, c.id, tenant.organizationId, actor, now, now, allowUnsubscribed ? 1 : 0),
   this.db.prepare(`INSERT INTO published_catalogues (publication_id, catalogue_public_id, slug, ${columns.join(", ")},
     logo_asset_public_id, logo_object_key, hero_asset_public_id, hero_object_key, published_at)
    VALUES (${pub}, ?, ?, ${columns.map(() => "?").join(", ")}, ?, ?, ?, ?, ?)`)
    .bind(id, c.catalogue_public_id, c.slug, ...values, logo?.public_id ?? null, logo?.object_key ?? null, hero?.public_id ?? null, hero?.object_key ?? null, now),
   this.db.prepare(`INSERT INTO published_categories (publication_id, category_public_id, parent_category_public_id, name, slug, description, sort_order)
    SELECT ${pub}, category.public_id, parent.public_id, category.name, category.slug, category.description, category.sort_order
    FROM publication_visible_categories category LEFT JOIN publication_visible_categories parent ON parent.id = category.parent_id
    WHERE category.catalogue_id = ? AND ? = 1`).bind(id, c.id, c.show_categories),
   this.db.prepare(`INSERT INTO published_items (publication_id, item_public_id, category_public_id, item_type, name, slug, sku,
    short_description, long_description, price_minor_units, currency_code, show_price, is_featured, sort_order)
    SELECT ${pub}, i.public_id, CASE WHEN ? = 1 THEN category.public_id ELSE NULL END, i.item_type, i.name, i.slug, i.sku, i.short_description, i.long_description,
     CASE WHEN i.show_price = 1 THEN i.price_minor_units ELSE NULL END,
     CASE WHEN i.show_price = 1 THEN i.currency_code ELSE NULL END, i.show_price, i.is_featured, i.sort_order
    FROM publication_eligible_items i LEFT JOIN publication_visible_categories category ON category.id = i.category_id WHERE i.catalogue_id = ?`).bind(id, c.show_categories, c.id),
   this.db.prepare(`INSERT INTO published_item_attributes (publication_id, item_public_id, attribute_code, label, value_text, unit_hint, sort_order)
    SELECT ${pub}, i.public_id, a.code, a.label, value.value_text, a.unit_hint, value.sort_order
    FROM item_attribute_values value JOIN publication_eligible_items i ON i.id = value.item_id
    JOIN attribute_definitions a ON a.id = value.attribute_definition_id
    WHERE i.catalogue_id = ? AND value.is_visible = 1 AND a.is_active = 1
      AND (a.organization_id IS NULL OR a.organization_id = ?) AND (a.applies_to = 'both' OR a.applies_to = i.item_type)`).bind(id, c.id, tenant.organizationId),
   this.db.prepare(`INSERT INTO published_item_images (publication_id, item_public_id, asset_public_id, object_key, mime_type, alt_text, is_primary, sort_order)
    SELECT ${pub}, i.public_id, a.public_id, a.object_key, a.mime_type, m.alt_text, m.is_primary, m.sort_order
    FROM item_images m JOIN publication_eligible_items i ON i.id = m.item_id JOIN assets a ON a.id = m.asset_id WHERE i.catalogue_id = ?`).bind(id, c.id),
   this.db.prepare(`INSERT INTO published_item_documents (publication_id, item_public_id, asset_public_id, object_key, mime_type, label, sort_order)
    SELECT ${pub}, i.public_id, a.public_id, a.object_key, a.mime_type, m.label, m.sort_order
    FROM item_documents m JOIN publication_eligible_items i ON i.id = m.item_id JOIN assets a ON a.id = m.asset_id
    WHERE i.catalogue_id = ? AND m.is_visible = 1`).bind(id, c.id),
   this.db.prepare("UPDATE catalogue_publications SET sealed_at = ? WHERE public_id = ?").bind(now, id),
   this.db.prepare(`UPDATE catalogue_publications SET state = 'failed', failed_at = ?, preview_revoked_at = ?
    WHERE catalogue_id = ? AND state = 'building' AND public_id <> ? AND sealed_at IS NOT NULL`).bind(now, now, c.id, id),
   this.audit(tenant.organizationId, actor, "publication.prepared", id, now),
  ]);
  const record = await this.find(tenant, id);
  if (!record || !record.sealed_at) throw new Error("publication_build_failed");
  if (record.state !== "building" || record.preview_revoked_at) throw new Error("publication_source_changed");
  return record;
 }
 async activate(tenant: TenantContext, record: PublicationRecord, actor: number, revision: number, now: string, allowUnsubscribed: boolean): Promise<boolean> {
  const token = crypto.randomUUID();
  const guard = "EXISTS (SELECT 1 FROM catalogues c WHERE c.id = ? AND c.publication_write_token = ?)";
  const results = await this.db.batch([
   this.db.prepare(`UPDATE catalogues AS c SET publication_write_token = ?
    WHERE c.id = ? AND c.organization_id = ? AND c.authoring_revision = ?
     AND c.status IN ('draft', 'published') AND c.deleted_at IS NULL
     AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = c.organization_id AND o.status = 'active' AND o.deleted_at IS NULL)
     AND EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = ? AND p.state = 'building' AND p.sealed_at IS NOT NULL
       AND p.preview_revoked_at IS NULL AND p.preview_expires_at > ? AND p.source_authoring_revision = c.authoring_revision
       AND COALESCE(p.base_publication_id, 0) = COALESCE((SELECT publication_id FROM public_catalogue_routes WHERE catalogue_public_id = c.public_id), 0))
     AND NOT EXISTS (SELECT 1 FROM public_catalogue_routes r WHERE r.catalogue_public_id = c.public_id AND r.status = 'suspended')
     AND ${publicationActorSql} AND ${publicationPolicySql}`)
    .bind(token, record.catalogue_id, tenant.organizationId, revision, record.id, now, actor, now, now, allowUnsubscribed ? 1 : 0),
   this.db.prepare(`UPDATE catalogue_publications SET state = 'retired', retired_at = ?
    WHERE catalogue_id = ? AND state = 'active' AND ${guard}`).bind(now, record.catalogue_id, record.catalogue_id, token),
   this.db.prepare(`UPDATE catalogue_publications SET state = 'active', activated_at = ?, preview_revoked_at = ?
    WHERE id = ? AND state = 'building' AND ${guard}`).bind(now, now, record.id, record.catalogue_id, token),
   this.db.prepare(`INSERT INTO public_catalogue_routes (slug, catalogue_public_id, publication_id, status, updated_at)
    SELECT pc.slug, pc.catalogue_public_id, pc.publication_id, 'active', ? FROM published_catalogues pc
    WHERE pc.publication_id = ? AND ${guard}
    ON CONFLICT(catalogue_public_id) DO UPDATE SET slug = excluded.slug, publication_id = excluded.publication_id, updated_at = excluded.updated_at`)
    .bind(now, record.id, record.catalogue_id, token),
   this.db.prepare(`UPDATE catalogues SET status = 'published', published_revision = ?, published_at = ?, updated_at = ?, version = version + 1
    WHERE id = ? AND publication_write_token = ?`).bind(record.revision_number, now, now, record.catalogue_id, token),
   this.db.prepare(`INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, entity_type, entity_public_id, created_at)
    SELECT ?, ?, 'user', 'publication.activated', 'publication', ?, ? WHERE ${guard}`)
    .bind(tenant.organizationId, actor, record.public_id, now, record.catalogue_id, token),
  ]);
  return (results[0].meta.changes ?? 0) > 0;
 }
 async discard(tenant: TenantContext, record: PublicationRecord, actor: number, now: string): Promise<boolean> {
  const results = await this.db.batch([
   this.db.prepare(`UPDATE catalogue_publications SET state = 'failed', failed_at = ?, preview_revoked_at = ?
    WHERE id = ? AND state = 'building' AND EXISTS (
     SELECT 1 FROM catalogues c WHERE c.id = catalogue_publications.catalogue_id AND c.organization_id = ? AND ${publicationActorSql}
    )`).bind(now, now, record.id, tenant.organizationId, actor),
   this.db.prepare(`INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, entity_type, entity_public_id, created_at)
    SELECT ?, ?, 'user', 'publication.discarded', 'publication', ?, ?
    WHERE changes() = 1 AND EXISTS (SELECT 1 FROM catalogue_publications WHERE id = ? AND failed_at = ?)`)
    .bind(tenant.organizationId, actor, record.public_id, now, record.id, now),
  ]);
  return (results[0].meta.changes ?? 0) > 0;
 }
 async active(tenant: TenantContext): Promise<PublicationRecord | null> {
  return this.db.prepare(`SELECT p.* FROM public_catalogue_routes r JOIN catalogue_publications p ON p.id = r.publication_id
   JOIN catalogues c ON c.id = p.catalogue_id WHERE c.organization_id = ? AND c.deleted_at IS NULL AND p.state = 'active'`)
   .bind(tenant.organizationId).first<PublicationRecord>();
 }
 async unpublish(tenant: TenantContext, record: PublicationRecord, actor: number, revision: number, now: string): Promise<boolean> {
  const token = crypto.randomUUID(), guard = "EXISTS (SELECT 1 FROM catalogues WHERE id = ? AND publication_write_token = ?)";
  const results = await this.db.batch([
   this.db.prepare(`UPDATE catalogues AS c SET publication_write_token = ?
    WHERE c.id = ? AND c.organization_id = ? AND c.authoring_revision = ? AND c.status = 'published' AND c.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM public_catalogue_routes WHERE catalogue_public_id = c.public_id AND publication_id = ? AND status = 'active')
      AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = c.organization_id AND o.status = 'active' AND o.deleted_at IS NULL)
      AND ${publicationActorSql}`).bind(token, record.catalogue_id, tenant.organizationId, revision, record.id, actor),
   this.db.prepare(`DELETE FROM public_catalogue_routes WHERE publication_id = ? AND ${guard}`).bind(record.id, record.catalogue_id, token),
   this.db.prepare(`UPDATE catalogue_publications SET state = 'retired', retired_at = ? WHERE id = ? AND state = 'active' AND ${guard}`).bind(now, record.id, record.catalogue_id, token),
   this.db.prepare(`UPDATE catalogue_publications SET state = 'failed', failed_at = ?, preview_revoked_at = ?
     WHERE catalogue_id = ? AND state = 'building' AND ${guard}`).bind(now, now, record.catalogue_id, record.catalogue_id, token),
   this.db.prepare(`UPDATE catalogues SET status = 'draft', published_revision = NULL, published_at = NULL, updated_at = ?, version = version + 1
    WHERE id = ? AND publication_write_token = ?`).bind(now, record.catalogue_id, token),
   this.db.prepare(`INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, entity_type, entity_public_id, created_at)
    SELECT ?, ?, 'user', 'publication.unpublished', 'publication', ?, ? WHERE ${guard}`)
    .bind(tenant.organizationId, actor, record.public_id, now, record.catalogue_id, token),
  ]);
  return (results[0].meta.changes ?? 0) > 0;
 }
}

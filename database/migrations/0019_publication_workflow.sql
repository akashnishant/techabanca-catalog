-- M7: sealed publication candidates and optimistic source revisions.
-- Existing M6 snapshots remain valid. New candidates are sealed before sharing.
ALTER TABLE catalogues ADD COLUMN authoring_revision INTEGER NOT NULL DEFAULT 1 CHECK (authoring_revision > 0);
ALTER TABLE catalogues ADD COLUMN publication_write_token TEXT;
ALTER TABLE catalogue_publications ADD COLUMN source_authoring_revision INTEGER;
ALTER TABLE catalogue_publications ADD COLUMN base_publication_id INTEGER;
ALTER TABLE catalogue_publications ADD COLUMN sealed_at TEXT;
ALTER TABLE catalogue_publications ADD COLUMN preview_expires_at TEXT;
ALTER TABLE catalogue_publications ADD COLUMN preview_revoked_at TEXT;

CREATE VIEW publication_visible_categories AS
SELECT c.* FROM categories c LEFT JOIN categories parent ON parent.id = c.parent_id
WHERE c.deleted_at IS NULL AND c.is_visible = 1
  AND (c.parent_id IS NULL OR (parent.deleted_at IS NULL AND parent.is_visible = 1));

CREATE VIEW publication_eligible_items AS
SELECT i.* FROM catalogue_items i
WHERE i.deleted_at IS NULL AND i.status = 'published'
  AND (i.category_id IS NULL OR EXISTS (
    SELECT 1 FROM publication_visible_categories category
    WHERE category.id = i.category_id AND category.catalogue_id = i.catalogue_id
  ));

CREATE TRIGGER publication_source_guard BEFORE INSERT ON catalogue_publications
WHEN NEW.source_authoring_revision IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM catalogues c JOIN organizations o ON o.id = c.organization_id
  WHERE c.id = NEW.catalogue_id AND c.authoring_revision = NEW.source_authoring_revision
    AND c.deleted_at IS NULL AND c.status IN ('draft', 'published')
    AND o.deleted_at IS NULL AND o.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public_catalogue_routes r WHERE r.catalogue_public_id = c.public_id AND r.status = 'suspended')
)
BEGIN SELECT RAISE(ABORT, 'publication_source_changed'); END;

CREATE TRIGGER publication_seal_is_final BEFORE UPDATE ON catalogue_publications
WHEN OLD.sealed_at IS NOT NULL AND (
 NEW.public_id IS NOT OLD.public_id OR NEW.catalogue_id IS NOT OLD.catalogue_id
 OR NEW.catalogue_public_id IS NOT OLD.catalogue_public_id
 OR NEW.revision_number IS NOT OLD.revision_number
 OR NEW.source_catalogue_version IS NOT OLD.source_catalogue_version
 OR NEW.source_authoring_revision IS NOT OLD.source_authoring_revision
 OR NEW.base_publication_id IS NOT OLD.base_publication_id
 OR NEW.sealed_at IS NOT OLD.sealed_at OR NEW.created_at IS NOT OLD.created_at
 OR NEW.preview_expires_at IS NOT OLD.preview_expires_at
 OR (OLD.preview_revoked_at IS NOT NULL AND NEW.preview_revoked_at IS NOT OLD.preview_revoked_at)
)
BEGIN SELECT RAISE(ABORT, 'publication_seal_is_final'); END;

CREATE TRIGGER published_catalogues_sealed_insert BEFORE INSERT ON published_catalogues
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = NEW.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_catalogues_sealed_update BEFORE UPDATE ON published_catalogues
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE (p.id = OLD.publication_id OR p.id = NEW.publication_id) AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_catalogues_sealed_delete BEFORE DELETE ON published_catalogues
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = OLD.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_categories_sealed_insert BEFORE INSERT ON published_categories
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = NEW.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_categories_sealed_update BEFORE UPDATE ON published_categories
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE (p.id = OLD.publication_id OR p.id = NEW.publication_id) AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_categories_sealed_delete BEFORE DELETE ON published_categories
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = OLD.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_items_sealed_insert BEFORE INSERT ON published_items
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = NEW.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_items_sealed_update BEFORE UPDATE ON published_items
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE (p.id = OLD.publication_id OR p.id = NEW.publication_id) AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_items_sealed_delete BEFORE DELETE ON published_items
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = OLD.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_attributes_sealed_insert BEFORE INSERT ON published_item_attributes
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = NEW.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_attributes_sealed_update BEFORE UPDATE ON published_item_attributes
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE (p.id = OLD.publication_id OR p.id = NEW.publication_id) AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_attributes_sealed_delete BEFORE DELETE ON published_item_attributes
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = OLD.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_images_sealed_insert BEFORE INSERT ON published_item_images
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = NEW.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_images_sealed_update BEFORE UPDATE ON published_item_images
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE (p.id = OLD.publication_id OR p.id = NEW.publication_id) AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_images_sealed_delete BEFORE DELETE ON published_item_images
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = OLD.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_documents_sealed_insert BEFORE INSERT ON published_item_documents
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = NEW.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_documents_sealed_update BEFORE UPDATE ON published_item_documents
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE (p.id = OLD.publication_id OR p.id = NEW.publication_id) AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER published_item_documents_sealed_delete BEFORE DELETE ON published_item_documents
WHEN EXISTS (SELECT 1 FROM catalogue_publications p WHERE p.id = OLD.publication_id AND p.sealed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'published_snapshot_is_sealed'); END;

CREATE TRIGGER catalogue_items_publication_revision_insert AFTER INSERT ON catalogue_items
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = NEW.catalogue_id; END;

CREATE TRIGGER catalogue_items_publication_revision_update AFTER UPDATE ON catalogue_items
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = OLD.catalogue_id OR id = NEW.catalogue_id; END;

CREATE TRIGGER catalogue_items_publication_revision_delete AFTER DELETE ON catalogue_items
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = OLD.catalogue_id; END;

CREATE TRIGGER categories_publication_revision_insert AFTER INSERT ON categories
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = NEW.catalogue_id; END;

CREATE TRIGGER categories_publication_revision_update AFTER UPDATE ON categories
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = OLD.catalogue_id OR id = NEW.catalogue_id; END;

CREATE TRIGGER categories_publication_revision_delete AFTER DELETE ON categories
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = OLD.catalogue_id; END;

CREATE TRIGGER catalogue_website_settings_publication_revision_insert AFTER INSERT ON catalogue_website_settings
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = NEW.catalogue_id; END;

CREATE TRIGGER catalogue_website_settings_publication_revision_update AFTER UPDATE ON catalogue_website_settings
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = OLD.catalogue_id OR id = NEW.catalogue_id; END;

CREATE TRIGGER catalogue_website_settings_publication_revision_delete AFTER DELETE ON catalogue_website_settings
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = OLD.catalogue_id; END;

CREATE TRIGGER item_images_publication_revision_insert AFTER INSERT ON item_images
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = NEW.item_id); END;

CREATE TRIGGER item_images_publication_revision_update AFTER UPDATE ON item_images
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = OLD.item_id) OR id = (SELECT catalogue_id FROM catalogue_items WHERE id = NEW.item_id); END;

CREATE TRIGGER item_images_publication_revision_delete AFTER DELETE ON item_images
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = OLD.item_id); END;

CREATE TRIGGER item_documents_publication_revision_insert AFTER INSERT ON item_documents
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = NEW.item_id); END;

CREATE TRIGGER item_documents_publication_revision_update AFTER UPDATE ON item_documents
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = OLD.item_id) OR id = (SELECT catalogue_id FROM catalogue_items WHERE id = NEW.item_id); END;

CREATE TRIGGER item_documents_publication_revision_delete AFTER DELETE ON item_documents
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = OLD.item_id); END;

CREATE TRIGGER item_attribute_values_publication_revision_insert AFTER INSERT ON item_attribute_values
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = NEW.item_id); END;

CREATE TRIGGER item_attribute_values_publication_revision_update AFTER UPDATE ON item_attribute_values
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = OLD.item_id) OR id = (SELECT catalogue_id FROM catalogue_items WHERE id = NEW.item_id); END;

CREATE TRIGGER item_attribute_values_publication_revision_delete AFTER DELETE ON item_attribute_values
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = (SELECT catalogue_id FROM catalogue_items WHERE id = OLD.item_id); END;

CREATE TRIGGER business_profiles_publication_revision_insert AFTER INSERT ON business_profiles
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE organization_id = NEW.organization_id); END;

CREATE TRIGGER business_profiles_publication_revision_update AFTER UPDATE ON business_profiles
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE organization_id = OLD.organization_id) OR id IN (SELECT id FROM catalogues WHERE organization_id = NEW.organization_id); END;

CREATE TRIGGER business_profiles_publication_revision_delete AFTER DELETE ON business_profiles
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE organization_id = OLD.organization_id); END;

CREATE TRIGGER assets_publication_revision_insert AFTER INSERT ON assets
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE organization_id = NEW.organization_id); END;

CREATE TRIGGER assets_publication_revision_update AFTER UPDATE ON assets
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE organization_id = OLD.organization_id) OR id IN (SELECT id FROM catalogues WHERE organization_id = NEW.organization_id); END;

CREATE TRIGGER assets_publication_revision_delete AFTER DELETE ON assets
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE organization_id = OLD.organization_id); END;

CREATE TRIGGER attribute_definitions_publication_revision_insert AFTER INSERT ON attribute_definitions
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE NEW.organization_id IS NULL OR organization_id = NEW.organization_id); END;

CREATE TRIGGER attribute_definitions_publication_revision_update AFTER UPDATE ON attribute_definitions
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE OLD.organization_id IS NULL OR organization_id = OLD.organization_id) OR id IN (SELECT id FROM catalogues WHERE NEW.organization_id IS NULL OR organization_id = NEW.organization_id); END;

CREATE TRIGGER attribute_definitions_publication_revision_delete AFTER DELETE ON attribute_definitions
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id IN (SELECT id FROM catalogues WHERE OLD.organization_id IS NULL OR organization_id = OLD.organization_id); END;

CREATE TRIGGER catalogues_publication_revision AFTER UPDATE OF name, slug, mode, deleted_at ON catalogues
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE id = NEW.id; END;

CREATE TRIGGER organizations_publication_revision AFTER UPDATE ON organizations
BEGIN
 UPDATE catalogues SET authoring_revision = authoring_revision + 1 WHERE organization_id = NEW.id;
 UPDATE catalogue_publications SET preview_revoked_at = COALESCE(preview_revoked_at, CURRENT_TIMESTAMP)
 WHERE state = 'building' AND catalogue_id IN (SELECT id FROM catalogues WHERE organization_id = NEW.id)
   AND (NEW.status <> 'active' OR NEW.deleted_at IS NOT NULL);
 UPDATE public_catalogue_routes SET status = 'suspended', updated_at = CURRENT_TIMESTAMP
 WHERE catalogue_public_id IN (SELECT public_id FROM catalogues WHERE organization_id = NEW.id)
   AND (NEW.status <> 'active' OR NEW.deleted_at IS NOT NULL);
END;

CREATE TRIGGER theme_presets_publication_revision AFTER UPDATE ON theme_presets
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1
 WHERE id IN (SELECT catalogue_id FROM catalogue_website_settings WHERE theme_code = NEW.code); END;

-- Removing a source upload must not orphan any sealed/public snapshot's bytes.
CREATE TRIGGER assets_preserve_snapshot_readiness BEFORE UPDATE OF status, deleted_at, object_key ON assets
WHEN (NEW.status <> 'ready' OR NEW.deleted_at IS NOT NULL OR NEW.object_key IS NOT OLD.object_key) AND (
 EXISTS (SELECT 1 FROM published_catalogues WHERE logo_asset_public_id = OLD.public_id OR hero_asset_public_id = OLD.public_id)
 OR EXISTS (SELECT 1 FROM published_item_images WHERE asset_public_id = OLD.public_id)
 OR EXISTS (SELECT 1 FROM published_item_documents WHERE asset_public_id = OLD.public_id)
)
BEGIN SELECT RAISE(ABORT, 'asset_in_use'); END;

-- Required fields and business-type availability are part of the reviewed source.
CREATE TRIGGER business_type_attributes_publication_revision_insert AFTER INSERT ON business_type_attributes
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1
 WHERE organization_id IN (SELECT id FROM organizations WHERE business_type_id = NEW.business_type_id); END;
CREATE TRIGGER business_type_attributes_publication_revision_update AFTER UPDATE ON business_type_attributes
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1
 WHERE organization_id IN (SELECT id FROM organizations WHERE business_type_id = OLD.business_type_id OR business_type_id = NEW.business_type_id); END;
CREATE TRIGGER business_type_attributes_publication_revision_delete AFTER DELETE ON business_type_attributes
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1
 WHERE organization_id IN (SELECT id FROM organizations WHERE business_type_id = OLD.business_type_id); END;
CREATE TRIGGER business_types_publication_revision AFTER UPDATE ON business_types
BEGIN UPDATE catalogues SET authoring_revision = authoring_revision + 1
 WHERE organization_id IN (SELECT id FROM organizations WHERE business_type_id = NEW.id); END;

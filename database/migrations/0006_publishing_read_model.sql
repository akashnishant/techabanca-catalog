-- Techabanca Catalogue
-- Migration 0006: published revision / public read-model foundation
--
-- Editable catalogue tables remain the authoring source of truth.
-- Customer-facing rendering must use only the immutable published snapshot
-- selected by public_catalogue_routes.

CREATE TABLE catalogue_publications (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    catalogue_id INTEGER NOT NULL,
    catalogue_public_id TEXT NOT NULL,
    revision_number INTEGER NOT NULL
        CHECK (revision_number > 0),
    state TEXT NOT NULL DEFAULT 'building'
        CHECK (state IN ('building', 'active', 'retired', 'failed')),
    source_catalogue_version INTEGER NOT NULL
        CHECK (source_catalogue_version > 0),
    created_at TEXT NOT NULL,
    activated_at TEXT,
    retired_at TEXT,
    failed_at TEXT,
    CHECK (
        (state <> 'active' OR activated_at IS NOT NULL)
        AND (state <> 'retired' OR retired_at IS NOT NULL)
        AND (state <> 'failed' OR failed_at IS NOT NULL)
    ),
    UNIQUE (catalogue_id, revision_number),
    UNIQUE (catalogue_public_id, revision_number),
    FOREIGN KEY (catalogue_id) REFERENCES catalogues(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_catalogue_publications_one_active
    ON catalogue_publications(catalogue_id)
    WHERE state = 'active';

CREATE INDEX idx_catalogue_publications_catalogue_state
    ON catalogue_publications(catalogue_id, state, revision_number);

CREATE TRIGGER catalogue_publications_validate_catalogue_insert
BEFORE INSERT ON catalogue_publications
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogues c
    WHERE c.id = NEW.catalogue_id
      AND c.public_id = NEW.catalogue_public_id
      AND c.deleted_at IS NULL
)
BEGIN
    SELECT RAISE(ABORT, 'publication_catalogue_mismatch');
END;

CREATE TRIGGER catalogue_publications_validate_state_transition
BEFORE UPDATE OF state ON catalogue_publications
FOR EACH ROW
WHEN NOT (
    (OLD.state = 'building' AND NEW.state IN ('building', 'active', 'failed'))
    OR
    (OLD.state = 'active' AND NEW.state IN ('active', 'retired'))
    OR
    (OLD.state = 'retired' AND NEW.state = 'retired')
    OR
    (OLD.state = 'failed' AND NEW.state = 'failed')
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_publication_state_transition');
END;

CREATE TABLE published_catalogues (
    publication_id INTEGER PRIMARY KEY,
    catalogue_public_id TEXT NOT NULL,
    slug TEXT NOT NULL COLLATE NOCASE
        CHECK (
            length(slug) BETWEEN 3 AND 63
            AND slug = lower(slug)
            AND slug NOT GLOB '*[^a-z0-9-]*'
            AND slug NOT LIKE '-%'
            AND slug NOT LIKE '%-'
            AND slug NOT LIKE '%--%'
        ),
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 1 AND 160),
    mode TEXT NOT NULL
        CHECK (mode IN ('products', 'services', 'both')),
    theme_code TEXT NOT NULL
        CHECK (length(trim(theme_code)) BETWEEN 2 AND 40),
    business_name TEXT NOT NULL
        CHECK (length(trim(business_name)) BETWEEN 1 AND 160),
    about_text TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    whatsapp_number TEXT,
    address_text TEXT,
    logo_asset_public_id TEXT,
    logo_object_key TEXT,
    hero_asset_public_id TEXT,
    hero_object_key TEXT,
    hero_title TEXT,
    hero_subtitle TEXT,
    hero_cta_label TEXT,
    hero_cta_target TEXT NOT NULL DEFAULT 'catalogue'
        CHECK (hero_cta_target IN ('catalogue', 'contact', 'whatsapp')),
    show_featured_items INTEGER NOT NULL DEFAULT 1
        CHECK (show_featured_items IN (0, 1)),
    show_categories INTEGER NOT NULL DEFAULT 1
        CHECK (show_categories IN (0, 1)),
    show_about INTEGER NOT NULL DEFAULT 1
        CHECK (show_about IN (0, 1)),
    show_contact INTEGER NOT NULL DEFAULT 1
        CHECK (show_contact IN (0, 1)),
    show_whatsapp INTEGER NOT NULL DEFAULT 1
        CHECK (show_whatsapp IN (0, 1)),
    show_phone INTEGER NOT NULL DEFAULT 1
        CHECK (show_phone IN (0, 1)),
    show_email INTEGER NOT NULL DEFAULT 1
        CHECK (show_email IN (0, 1)),
    seo_title TEXT,
    seo_description TEXT,
    published_at TEXT NOT NULL,
    FOREIGN KEY (publication_id) REFERENCES catalogue_publications(id) ON DELETE CASCADE
);

CREATE INDEX idx_published_catalogues_slug
    ON published_catalogues(slug);

CREATE TABLE published_categories (
    publication_id INTEGER NOT NULL,
    category_public_id TEXT NOT NULL,
    parent_category_public_id TEXT,
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 1 AND 120),
    slug TEXT NOT NULL COLLATE NOCASE,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    PRIMARY KEY (publication_id, category_public_id),
    UNIQUE (publication_id, slug),
    FOREIGN KEY (publication_id) REFERENCES catalogue_publications(id) ON DELETE CASCADE
);

CREATE INDEX idx_published_categories_sort
    ON published_categories(publication_id, parent_category_public_id, sort_order);

CREATE TABLE published_items (
    publication_id INTEGER NOT NULL,
    item_public_id TEXT NOT NULL,
    category_public_id TEXT,
    item_type TEXT NOT NULL
        CHECK (item_type IN ('product', 'service')),
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 1 AND 180),
    slug TEXT NOT NULL COLLATE NOCASE,
    sku TEXT,
    short_description TEXT,
    long_description TEXT,
    price_minor_units INTEGER
        CHECK (price_minor_units IS NULL OR price_minor_units >= 0),
    currency_code TEXT,
    show_price INTEGER NOT NULL DEFAULT 0
        CHECK (show_price IN (0, 1)),
    is_featured INTEGER NOT NULL DEFAULT 0
        CHECK (is_featured IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    PRIMARY KEY (publication_id, item_public_id),
    UNIQUE (publication_id, slug),
    FOREIGN KEY (publication_id) REFERENCES catalogue_publications(id) ON DELETE CASCADE,
    CHECK (
        (price_minor_units IS NULL AND currency_code IS NULL)
        OR
        (price_minor_units IS NOT NULL AND currency_code IS NOT NULL)
    ),
    CHECK (show_price = 0 OR price_minor_units IS NOT NULL)
);

CREATE INDEX idx_published_items_category_sort
    ON published_items(publication_id, category_public_id, sort_order);

CREATE INDEX idx_published_items_featured
    ON published_items(publication_id, is_featured, sort_order);

CREATE TABLE published_item_attributes (
    publication_id INTEGER NOT NULL,
    item_public_id TEXT NOT NULL,
    attribute_code TEXT NOT NULL,
    label TEXT NOT NULL,
    value_text TEXT NOT NULL,
    unit_hint TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    PRIMARY KEY (publication_id, item_public_id, attribute_code),
    FOREIGN KEY (
        publication_id,
        item_public_id
    ) REFERENCES published_items(
        publication_id,
        item_public_id
    ) ON DELETE CASCADE
);

CREATE INDEX idx_published_item_attributes_sort
    ON published_item_attributes(publication_id, item_public_id, sort_order);

CREATE TABLE published_item_images (
    publication_id INTEGER NOT NULL,
    item_public_id TEXT NOT NULL,
    asset_public_id TEXT NOT NULL,
    object_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    alt_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_primary INTEGER NOT NULL DEFAULT 0
        CHECK (is_primary IN (0, 1)),
    PRIMARY KEY (publication_id, item_public_id, asset_public_id),
    FOREIGN KEY (
        publication_id,
        item_public_id
    ) REFERENCES published_items(
        publication_id,
        item_public_id
    ) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_published_item_images_one_primary
    ON published_item_images(publication_id, item_public_id)
    WHERE is_primary = 1;

CREATE INDEX idx_published_item_images_sort
    ON published_item_images(publication_id, item_public_id, sort_order);

CREATE TABLE published_item_documents (
    publication_id INTEGER NOT NULL,
    item_public_id TEXT NOT NULL,
    asset_public_id TEXT NOT NULL,
    object_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    PRIMARY KEY (publication_id, item_public_id, asset_public_id),
    FOREIGN KEY (
        publication_id,
        item_public_id
    ) REFERENCES published_items(
        publication_id,
        item_public_id
    ) ON DELETE CASCADE
);

CREATE INDEX idx_published_item_documents_sort
    ON published_item_documents(publication_id, item_public_id, sort_order);

CREATE TABLE public_catalogue_routes (
    slug TEXT NOT NULL COLLATE NOCASE PRIMARY KEY,
    catalogue_public_id TEXT NOT NULL UNIQUE,
    publication_id INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended')),
    updated_at TEXT NOT NULL,
    FOREIGN KEY (publication_id) REFERENCES catalogue_publications(id) ON DELETE RESTRICT
);

CREATE TRIGGER public_catalogue_routes_validate_insert
BEFORE INSERT ON public_catalogue_routes
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    INNER JOIN published_catalogues pc
        ON pc.publication_id = p.id
    WHERE p.id = NEW.publication_id
      AND p.catalogue_public_id = NEW.catalogue_public_id
      AND p.state = 'active'
      AND pc.slug = NEW.slug COLLATE NOCASE
      AND pc.catalogue_public_id = NEW.catalogue_public_id
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_public_catalogue_route');
END;

CREATE TRIGGER public_catalogue_routes_validate_update
BEFORE UPDATE OF slug, catalogue_public_id, publication_id ON public_catalogue_routes
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    INNER JOIN published_catalogues pc
        ON pc.publication_id = p.id
    WHERE p.id = NEW.publication_id
      AND p.catalogue_public_id = NEW.catalogue_public_id
      AND p.state = 'active'
      AND pc.slug = NEW.slug COLLATE NOCASE
      AND pc.catalogue_public_id = NEW.catalogue_public_id
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_public_catalogue_route');
END;

CREATE TRIGGER catalogue_publications_require_snapshot_before_activation
BEFORE UPDATE OF state ON catalogue_publications
FOR EACH ROW
WHEN NEW.state = 'active'
     AND OLD.state <> 'active'
     AND NOT EXISTS (
        SELECT 1
        FROM published_catalogues pc
        WHERE pc.publication_id = NEW.id
          AND pc.catalogue_public_id = NEW.catalogue_public_id
     )
BEGIN
    SELECT RAISE(ABORT, 'publication_snapshot_missing');
END;

-- Published snapshot rows are mutable only while their publication is building.

CREATE TRIGGER published_catalogues_freeze_update
BEFORE UPDATE ON published_catalogues
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_catalogues_freeze_delete
BEFORE DELETE ON published_catalogues
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_categories_freeze_update
BEFORE UPDATE ON published_categories
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_categories_freeze_delete
BEFORE DELETE ON published_categories
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_items_freeze_update
BEFORE UPDATE ON published_items
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_items_freeze_delete
BEFORE DELETE ON published_items
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_attributes_freeze_update
BEFORE UPDATE ON published_item_attributes
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_attributes_freeze_delete
BEFORE DELETE ON published_item_attributes
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_images_freeze_update
BEFORE UPDATE ON published_item_images
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_images_freeze_delete
BEFORE DELETE ON published_item_images
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_documents_freeze_update
BEFORE UPDATE ON published_item_documents
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_documents_freeze_delete
BEFORE DELETE ON published_item_documents
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = OLD.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

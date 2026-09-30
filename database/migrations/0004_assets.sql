-- Techabanca Catalogue
-- Migration 0004: asset metadata foundation
--
-- R2 objects are represented here by tenant-owned metadata rows.
-- Upload transport/bucket creation is intentionally handled in a later milestone.
-- Only READY assets may be attached to catalogue items.

CREATE TABLE assets (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    organization_id INTEGER NOT NULL,
    asset_kind TEXT NOT NULL
        CHECK (asset_kind IN ('image', 'document')),
    object_key TEXT NOT NULL UNIQUE
        CHECK (length(trim(object_key)) BETWEEN 1 AND 1024),
    original_filename TEXT NOT NULL
        CHECK (length(trim(original_filename)) BETWEEN 1 AND 255),
    mime_type TEXT NOT NULL
        CHECK (length(trim(mime_type)) BETWEEN 1 AND 150),
    byte_size INTEGER
        CHECK (byte_size IS NULL OR byte_size >= 0),
    checksum_sha256 TEXT
        CHECK (
            checksum_sha256 IS NULL
            OR (
                length(checksum_sha256) = 64
                AND checksum_sha256 = lower(checksum_sha256)
                AND checksum_sha256 NOT GLOB '*[^0-9a-f]*'
            )
        ),
    etag TEXT,
    width_px INTEGER
        CHECK (width_px IS NULL OR width_px > 0),
    height_px INTEGER
        CHECK (height_px IS NULL OR height_px > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
    created_by_user_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ready_at TEXT,
    deleted_at TEXT,
    CHECK (
        (width_px IS NULL AND height_px IS NULL)
        OR
        (width_px IS NOT NULL AND height_px IS NOT NULL)
    ),
    CHECK (
        status <> 'ready'
        OR (byte_size IS NOT NULL AND ready_at IS NOT NULL)
    ),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_assets_organization_status
    ON assets(organization_id, status);

CREATE INDEX idx_assets_organization_kind_status
    ON assets(organization_id, asset_kind, status);

CREATE TABLE item_images (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL,
    asset_id INTEGER NOT NULL,
    alt_text TEXT
        CHECK (alt_text IS NULL OR length(trim(alt_text)) <= 300),
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_primary INTEGER NOT NULL DEFAULT 0
        CHECK (is_primary IN (0, 1)),
    created_at TEXT NOT NULL,
    UNIQUE (item_id, asset_id),
    FOREIGN KEY (item_id) REFERENCES catalogue_items(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_item_images_one_primary
    ON item_images(item_id)
    WHERE is_primary = 1;

CREATE INDEX idx_item_images_item_sort
    ON item_images(item_id, sort_order);

CREATE TABLE item_documents (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL,
    asset_id INTEGER NOT NULL,
    label TEXT
        CHECK (label IS NULL OR length(trim(label)) BETWEEN 1 AND 160),
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_visible INTEGER NOT NULL DEFAULT 1
        CHECK (is_visible IN (0, 1)),
    created_at TEXT NOT NULL,
    UNIQUE (item_id, asset_id),
    FOREIGN KEY (item_id) REFERENCES catalogue_items(id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_item_documents_item_sort
    ON item_documents(item_id, sort_order);

CREATE TRIGGER item_images_validate_asset_insert
BEFORE INSERT ON item_images
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_items i
    INNER JOIN catalogues c
        ON c.id = i.catalogue_id
    INNER JOIN assets a
        ON a.id = NEW.asset_id
    WHERE i.id = NEW.item_id
      AND i.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND a.organization_id = c.organization_id
      AND a.asset_kind = 'image'
      AND a.status = 'ready'
      AND a.deleted_at IS NULL
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_item_image_asset');
END;

CREATE TRIGGER item_images_validate_asset_update
BEFORE UPDATE OF item_id, asset_id ON item_images
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_items i
    INNER JOIN catalogues c
        ON c.id = i.catalogue_id
    INNER JOIN assets a
        ON a.id = NEW.asset_id
    WHERE i.id = NEW.item_id
      AND i.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND a.organization_id = c.organization_id
      AND a.asset_kind = 'image'
      AND a.status = 'ready'
      AND a.deleted_at IS NULL
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_item_image_asset');
END;

CREATE TRIGGER item_documents_validate_asset_insert
BEFORE INSERT ON item_documents
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_items i
    INNER JOIN catalogues c
        ON c.id = i.catalogue_id
    INNER JOIN assets a
        ON a.id = NEW.asset_id
    WHERE i.id = NEW.item_id
      AND i.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND a.organization_id = c.organization_id
      AND a.asset_kind = 'document'
      AND a.status = 'ready'
      AND a.deleted_at IS NULL
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_item_document_asset');
END;

CREATE TRIGGER item_documents_validate_asset_update
BEFORE UPDATE OF item_id, asset_id ON item_documents
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_items i
    INNER JOIN catalogues c
        ON c.id = i.catalogue_id
    INNER JOIN assets a
        ON a.id = NEW.asset_id
    WHERE i.id = NEW.item_id
      AND i.deleted_at IS NULL
      AND c.deleted_at IS NULL
      AND a.organization_id = c.organization_id
      AND a.asset_kind = 'document'
      AND a.status = 'ready'
      AND a.deleted_at IS NULL
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_item_document_asset');
END;

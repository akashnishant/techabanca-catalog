-- Techabanca Catalogue
-- Migration 0002: catalogue foundation
--
-- Adds system business types, organisation business-type linkage,
-- global catalogue slugs, reserved Techabanca hostnames, catalogues,
-- and one-level catalogue categories.

CREATE TABLE business_types (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE
        CHECK (
            length(code) BETWEEN 2 AND 64
            AND code = lower(code)
            AND code NOT GLOB '*[^a-z0-9-]*'
            AND code NOT LIKE '-%'
            AND code NOT LIKE '%-'
            AND code NOT LIKE '%--%'
        ),
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 2 AND 100),
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO business_types (
    id,
    code,
    name,
    sort_order,
    is_active,
    created_at,
    updated_at
) VALUES
    (1,  'manufacturer',          'Manufacturer',              10, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (2,  'wholesale-distribution','Wholesale / Distribution', 20, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (3,  'retailer',              'Retailer',                  30, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (4,  'industrial',            'Industrial',                40, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (5,  'food-restaurant',       'Food / Restaurant',         50, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (6,  'fashion-apparel',       'Fashion / Apparel',         60, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (7,  'electronics',           'Electronics',               70, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (8,  'furniture-home',        'Furniture / Home',          80, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (9,  'automotive',            'Automotive',                90, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (10, 'beauty-wellness',       'Beauty / Wellness',        100, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (11, 'professional-services', 'Professional Services',    110, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (12, 'other',                 'Other',                    120, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z');

ALTER TABLE organizations
    ADD COLUMN business_type_id INTEGER
    REFERENCES business_types(id);

CREATE INDEX idx_organizations_business_type_id
    ON organizations(business_type_id);

CREATE TABLE reserved_slugs (
    slug TEXT NOT NULL COLLATE NOCASE PRIMARY KEY
        CHECK (
            length(slug) BETWEEN 2 AND 63
            AND slug = lower(slug)
            AND slug NOT GLOB '*[^a-z0-9-]*'
            AND slug NOT LIKE '-%'
            AND slug NOT LIKE '%-'
            AND slug NOT LIKE '%--%'
        ),
    reason TEXT NOT NULL
        CHECK (length(trim(reason)) > 0),
    created_at TEXT NOT NULL
);

INSERT INTO reserved_slugs (slug, reason, created_at) VALUES
    ('www',          'Techabanca platform hostname', '2026-09-30T00:00:00.000Z'),
    ('techabanca',   'Techabanca brand',             '2026-09-30T00:00:00.000Z'),
    ('billing',      'Techabanca Billing',           '2026-09-30T00:00:00.000Z'),
    ('billing-api',  'Techabanca Billing API',       '2026-09-30T00:00:00.000Z'),
    ('catalogue',    'Catalogue management app',     '2026-09-30T00:00:00.000Z'),
    ('catalog',      'Catalogue alias protection',   '2026-09-30T00:00:00.000Z'),
    ('api',          'Platform API protection',      '2026-09-30T00:00:00.000Z'),
    ('admin',        'Administration protection',    '2026-09-30T00:00:00.000Z'),
    ('support',      'Support hostname protection',  '2026-09-30T00:00:00.000Z'),
    ('help',         'Help hostname protection',     '2026-09-30T00:00:00.000Z'),
    ('legal',        'Legal hostname protection',    '2026-09-30T00:00:00.000Z'),
    ('privacy',      'Privacy hostname protection',  '2026-09-30T00:00:00.000Z'),
    ('security',     'Security hostname protection', '2026-09-30T00:00:00.000Z'),
    ('mail',         'Mail hostname protection',     '2026-09-30T00:00:00.000Z'),
    ('status',       'Status hostname protection',   '2026-09-30T00:00:00.000Z'),
    ('assets',       'Asset hostname protection',    '2026-09-30T00:00:00.000Z'),
    ('static',       'Static hostname protection',   '2026-09-30T00:00:00.000Z');

CREATE TABLE catalogues (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    organization_id INTEGER NOT NULL,
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 1 AND 160),
    slug TEXT NOT NULL COLLATE NOCASE UNIQUE
        CHECK (
            length(slug) BETWEEN 3 AND 63
            AND slug = lower(slug)
            AND slug NOT GLOB '*[^a-z0-9-]*'
            AND slug NOT LIKE '-%'
            AND slug NOT LIKE '%-'
            AND slug NOT LIKE '%--%'
        ),
    mode TEXT NOT NULL DEFAULT 'products'
        CHECK (mode IN ('products', 'services', 'both')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'suspended', 'archived')),
    published_revision INTEGER
        CHECK (published_revision IS NULL OR published_revision > 0),
    published_at TEXT,
    version INTEGER NOT NULL DEFAULT 1
        CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_catalogues_organization_status
    ON catalogues(organization_id, status);

CREATE INDEX idx_catalogues_status
    ON catalogues(status);

CREATE TRIGGER catalogues_reject_reserved_slug_insert
BEFORE INSERT ON catalogues
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM reserved_slugs
    WHERE slug = NEW.slug COLLATE NOCASE
)
BEGIN
    SELECT RAISE(ABORT, 'reserved_catalogue_slug');
END;

CREATE TRIGGER catalogues_reject_reserved_slug_update
BEFORE UPDATE OF slug ON catalogues
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM reserved_slugs
    WHERE slug = NEW.slug COLLATE NOCASE
)
BEGIN
    SELECT RAISE(ABORT, 'reserved_catalogue_slug');
END;

CREATE TRIGGER reserved_slugs_reject_active_catalogue_insert
BEFORE INSERT ON reserved_slugs
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM catalogues
    WHERE slug = NEW.slug COLLATE NOCASE
      AND deleted_at IS NULL
)
BEGIN
    SELECT RAISE(ABORT, 'slug_already_claimed_by_catalogue');
END;

CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    catalogue_id INTEGER NOT NULL,
    parent_id INTEGER,
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 1 AND 120),
    slug TEXT NOT NULL COLLATE NOCASE
        CHECK (
            length(slug) BETWEEN 1 AND 80
            AND slug = lower(slug)
            AND slug NOT GLOB '*[^a-z0-9-]*'
            AND slug NOT LIKE '-%'
            AND slug NOT LIKE '%-'
            AND slug NOT LIKE '%--%'
        ),
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_visible INTEGER NOT NULL DEFAULT 1
        CHECK (is_visible IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1
        CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (catalogue_id) REFERENCES catalogues(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_categories_catalogue_slug_active
    ON categories(catalogue_id, slug)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_categories_catalogue_parent_sort
    ON categories(catalogue_id, parent_id, sort_order);

CREATE TRIGGER categories_validate_parent_insert
BEFORE INSERT ON categories
FOR EACH ROW
WHEN NEW.parent_id IS NOT NULL
     AND NOT EXISTS (
        SELECT 1
        FROM categories parent
        WHERE parent.id = NEW.parent_id
          AND parent.catalogue_id = NEW.catalogue_id
          AND parent.parent_id IS NULL
          AND parent.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_category_parent');
END;

CREATE TRIGGER categories_validate_parent_update
BEFORE UPDATE OF parent_id, catalogue_id ON categories
FOR EACH ROW
WHEN NEW.parent_id IS NOT NULL
     AND NOT EXISTS (
        SELECT 1
        FROM categories parent
        WHERE parent.id = NEW.parent_id
          AND parent.catalogue_id = NEW.catalogue_id
          AND parent.parent_id IS NULL
          AND parent.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_category_parent');
END;

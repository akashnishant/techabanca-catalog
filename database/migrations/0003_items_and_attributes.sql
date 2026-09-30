-- Techabanca Catalogue
-- Migration 0003: catalogue items and attribute foundation
--
-- Adds product/service entries, catalogue-safe category references,
-- system and custom attributes, business-type presets, and item values.

CREATE TABLE attribute_definitions (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    organization_id INTEGER,
    code TEXT NOT NULL COLLATE NOCASE
        CHECK (
            length(code) BETWEEN 1 AND 80
            AND code = lower(code)
            AND code NOT GLOB '*[^a-z0-9-]*'
            AND code NOT LIKE '-%'
            AND code NOT LIKE '%-'
            AND code NOT LIKE '%--%'
        ),
    label TEXT NOT NULL
        CHECK (length(trim(label)) BETWEEN 1 AND 120),
    data_type TEXT NOT NULL DEFAULT 'text'
        CHECK (data_type IN ('text', 'number', 'boolean', 'date', 'url')),
    applies_to TEXT NOT NULL DEFAULT 'both'
        CHECK (applies_to IN ('product', 'service', 'both')),
    unit_hint TEXT
        CHECK (unit_hint IS NULL OR length(trim(unit_hint)) BETWEEN 1 AND 40),
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_attribute_definitions_system_code
    ON attribute_definitions(code)
    WHERE organization_id IS NULL;

CREATE UNIQUE INDEX uq_attribute_definitions_org_code
    ON attribute_definitions(organization_id, code)
    WHERE organization_id IS NOT NULL;

CREATE INDEX idx_attribute_definitions_org_active
    ON attribute_definitions(organization_id, is_active, sort_order);

CREATE TABLE business_type_attributes (
    business_type_id INTEGER NOT NULL,
    attribute_definition_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_required INTEGER NOT NULL DEFAULT 0
        CHECK (is_required IN (0, 1)),
    created_at TEXT NOT NULL,
    PRIMARY KEY (business_type_id, attribute_definition_id),
    FOREIGN KEY (business_type_id) REFERENCES business_types(id) ON DELETE CASCADE,
    FOREIGN KEY (attribute_definition_id) REFERENCES attribute_definitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_business_type_attributes_sort
    ON business_type_attributes(business_type_id, sort_order);

CREATE TRIGGER business_type_attributes_require_system_definition_insert
BEFORE INSERT ON business_type_attributes
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM attribute_definitions ad
    WHERE ad.id = NEW.attribute_definition_id
      AND ad.organization_id IS NULL
      AND ad.is_active = 1
)
BEGIN
    SELECT RAISE(ABORT, 'business_type_attribute_must_be_system');
END;

CREATE TRIGGER business_type_attributes_require_system_definition_update
BEFORE UPDATE OF attribute_definition_id ON business_type_attributes
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM attribute_definitions ad
    WHERE ad.id = NEW.attribute_definition_id
      AND ad.organization_id IS NULL
      AND ad.is_active = 1
)
BEGIN
    SELECT RAISE(ABORT, 'business_type_attribute_must_be_system');
END;

INSERT INTO attribute_definitions (
    id,
    public_id,
    organization_id,
    code,
    label,
    data_type,
    applies_to,
    unit_hint,
    sort_order,
    is_active,
    created_at,
    updated_at
) VALUES
    (1,  'atr_00000000000000000000000000000001', NULL, 'brand',                  'Brand',                  'text',   'product', NULL,  10, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (2,  'atr_00000000000000000000000000000002', NULL, 'model',                  'Model',                  'text',   'product', NULL,  20, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (3,  'atr_00000000000000000000000000000003', NULL, 'material',               'Material',               'text',   'product', NULL,  30, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (4,  'atr_00000000000000000000000000000004', NULL, 'size',                   'Size',                   'text',   'product', NULL,  40, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (5,  'atr_00000000000000000000000000000005', NULL, 'color',                  'Color',                  'text',   'product', NULL,  50, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (6,  'atr_00000000000000000000000000000006', NULL, 'capacity',               'Capacity',               'number', 'product', NULL,  60, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (7,  'atr_00000000000000000000000000000007', NULL, 'power',                  'Power',                  'number', 'product', NULL,  70, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (8,  'atr_00000000000000000000000000000008', NULL, 'grade',                  'Grade',                  'text',   'product', NULL,  80, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (9,  'atr_00000000000000000000000000000009', NULL, 'purity',                 'Purity',                 'number', 'product', '%',   90, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (10, 'atr_00000000000000000000000000000010', NULL, 'cas-number',             'CAS Number',             'text',   'product', NULL, 100, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (11, 'atr_00000000000000000000000000000011', NULL, 'pack-size',              'Pack Size',              'text',   'product', NULL, 110, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (12, 'atr_00000000000000000000000000000012', NULL, 'warranty',               'Warranty',               'text',   'product', NULL, 120, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (13, 'atr_00000000000000000000000000000013', NULL, 'duration',               'Duration',               'text',   'service', NULL, 130, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (14, 'atr_00000000000000000000000000000014', NULL, 'service-area',           'Service Area',           'text',   'service', NULL, 140, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (15, 'atr_00000000000000000000000000000015', NULL, 'experience',             'Experience',             'text',   'service', NULL, 150, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (16, 'atr_00000000000000000000000000000016', NULL, 'delivery-time',          'Delivery Time',          'text',   'both',    NULL, 160, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (17, 'atr_00000000000000000000000000000017', NULL, 'minimum-order-quantity', 'Minimum Order Quantity', 'number', 'product', NULL, 170, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (18, 'atr_00000000000000000000000000000018', NULL, 'origin-country',         'Country of Origin',      'text',   'product', NULL, 180, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (19, 'atr_00000000000000000000000000000019', NULL, 'ingredients',            'Ingredients',            'text',   'product', NULL, 190, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (20, 'atr_00000000000000000000000000000020', NULL, 'dietary-info',           'Dietary Information',    'text',   'product', NULL, 200, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (21, 'atr_00000000000000000000000000000021', NULL, 'compatibility',          'Compatibility',          'text',   'product', NULL, 210, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z'),
    (22, 'atr_00000000000000000000000000000022', NULL, 'voltage',                'Voltage',                'text',   'product', 'V',  220, 1, '2026-09-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z');

INSERT INTO business_type_attributes (
    business_type_id,
    attribute_definition_id,
    sort_order,
    is_required,
    created_at
) VALUES
    (1, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (1, 2,  20, 0, '2026-09-30T00:00:00.000Z'),
    (1, 3,  30, 0, '2026-09-30T00:00:00.000Z'),
    (1, 6,  40, 0, '2026-09-30T00:00:00.000Z'),
    (1, 7,  50, 0, '2026-09-30T00:00:00.000Z'),
    (1, 8,  60, 0, '2026-09-30T00:00:00.000Z'),
    (1, 17, 70, 0, '2026-09-30T00:00:00.000Z'),
    (1, 18, 80, 0, '2026-09-30T00:00:00.000Z'),

    (2, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (2, 11, 20, 0, '2026-09-30T00:00:00.000Z'),
    (2, 17, 30, 0, '2026-09-30T00:00:00.000Z'),
    (2, 18, 40, 0, '2026-09-30T00:00:00.000Z'),

    (3, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (3, 4,  20, 0, '2026-09-30T00:00:00.000Z'),
    (3, 5,  30, 0, '2026-09-30T00:00:00.000Z'),
    (3, 12, 40, 0, '2026-09-30T00:00:00.000Z'),

    (4, 2,  10, 0, '2026-09-30T00:00:00.000Z'),
    (4, 6,  20, 0, '2026-09-30T00:00:00.000Z'),
    (4, 7,  30, 0, '2026-09-30T00:00:00.000Z'),
    (4, 8,  40, 0, '2026-09-30T00:00:00.000Z'),
    (4, 22, 50, 0, '2026-09-30T00:00:00.000Z'),

    (5, 11, 10, 0, '2026-09-30T00:00:00.000Z'),
    (5, 19, 20, 0, '2026-09-30T00:00:00.000Z'),
    (5, 20, 30, 0, '2026-09-30T00:00:00.000Z'),

    (6, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (6, 3,  20, 0, '2026-09-30T00:00:00.000Z'),
    (6, 4,  30, 0, '2026-09-30T00:00:00.000Z'),
    (6, 5,  40, 0, '2026-09-30T00:00:00.000Z'),

    (7, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (7, 2,  20, 0, '2026-09-30T00:00:00.000Z'),
    (7, 7,  30, 0, '2026-09-30T00:00:00.000Z'),
    (7, 12, 40, 0, '2026-09-30T00:00:00.000Z'),
    (7, 21, 50, 0, '2026-09-30T00:00:00.000Z'),
    (7, 22, 60, 0, '2026-09-30T00:00:00.000Z'),

    (8, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (8, 3,  20, 0, '2026-09-30T00:00:00.000Z'),
    (8, 4,  30, 0, '2026-09-30T00:00:00.000Z'),
    (8, 5,  40, 0, '2026-09-30T00:00:00.000Z'),

    (9, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (9, 2,  20, 0, '2026-09-30T00:00:00.000Z'),
    (9, 12, 30, 0, '2026-09-30T00:00:00.000Z'),
    (9, 21, 40, 0, '2026-09-30T00:00:00.000Z'),

    (10, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (10, 11, 20, 0, '2026-09-30T00:00:00.000Z'),
    (10, 19, 30, 0, '2026-09-30T00:00:00.000Z'),

    (11, 13, 10, 0, '2026-09-30T00:00:00.000Z'),
    (11, 14, 20, 0, '2026-09-30T00:00:00.000Z'),
    (11, 15, 30, 0, '2026-09-30T00:00:00.000Z'),
    (11, 16, 40, 0, '2026-09-30T00:00:00.000Z'),

    (12, 1,  10, 0, '2026-09-30T00:00:00.000Z'),
    (12, 3,  20, 0, '2026-09-30T00:00:00.000Z'),
    (12, 13, 30, 0, '2026-09-30T00:00:00.000Z'),
    (12, 14, 40, 0, '2026-09-30T00:00:00.000Z');

CREATE TABLE catalogue_items (
    id INTEGER PRIMARY KEY,
    public_id TEXT NOT NULL UNIQUE,
    catalogue_id INTEGER NOT NULL,
    category_id INTEGER,
    item_type TEXT NOT NULL
        CHECK (item_type IN ('product', 'service')),
    name TEXT NOT NULL
        CHECK (length(trim(name)) BETWEEN 1 AND 180),
    slug TEXT NOT NULL COLLATE NOCASE
        CHECK (
            length(slug) BETWEEN 1 AND 80
            AND slug = lower(slug)
            AND slug NOT GLOB '*[^a-z0-9-]*'
            AND slug NOT LIKE '-%'
            AND slug NOT LIKE '%-'
            AND slug NOT LIKE '%--%'
        ),
    sku TEXT COLLATE NOCASE
        CHECK (sku IS NULL OR length(trim(sku)) BETWEEN 1 AND 100),
    short_description TEXT,
    long_description TEXT,
    price_minor_units INTEGER
        CHECK (price_minor_units IS NULL OR price_minor_units >= 0),
    currency_code TEXT
        CHECK (
            currency_code IS NULL
            OR (
                length(currency_code) = 3
                AND currency_code = upper(currency_code)
            )
        ),
    show_price INTEGER NOT NULL DEFAULT 0
        CHECK (show_price IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'hidden')),
    is_featured INTEGER NOT NULL DEFAULT 0
        CHECK (is_featured IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    version INTEGER NOT NULL DEFAULT 1
        CHECK (version >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK (
        (price_minor_units IS NULL AND currency_code IS NULL)
        OR
        (price_minor_units IS NOT NULL AND currency_code IS NOT NULL)
    ),
    CHECK (show_price = 0 OR price_minor_units IS NOT NULL),
    FOREIGN KEY (catalogue_id) REFERENCES catalogues(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_catalogue_items_catalogue_slug_active
    ON catalogue_items(catalogue_id, slug)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_catalogue_items_catalogue_sku_active
    ON catalogue_items(catalogue_id, sku)
    WHERE sku IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_catalogue_items_catalogue_status_sort
    ON catalogue_items(catalogue_id, status, sort_order);

CREATE INDEX idx_catalogue_items_category_status
    ON catalogue_items(category_id, status);

CREATE TRIGGER catalogue_items_validate_mode_insert
BEFORE INSERT ON catalogue_items
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM catalogues c
    WHERE c.id = NEW.catalogue_id
      AND (
          (c.mode = 'products' AND NEW.item_type <> 'product')
          OR
          (c.mode = 'services' AND NEW.item_type <> 'service')
      )
)
BEGIN
    SELECT RAISE(ABORT, 'item_type_not_allowed_by_catalogue_mode');
END;

CREATE TRIGGER catalogue_items_validate_mode_update
BEFORE UPDATE OF catalogue_id, item_type ON catalogue_items
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM catalogues c
    WHERE c.id = NEW.catalogue_id
      AND (
          (c.mode = 'products' AND NEW.item_type <> 'product')
          OR
          (c.mode = 'services' AND NEW.item_type <> 'service')
      )
)
BEGIN
    SELECT RAISE(ABORT, 'item_type_not_allowed_by_catalogue_mode');
END;

CREATE TRIGGER catalogue_items_validate_category_insert
BEFORE INSERT ON catalogue_items
FOR EACH ROW
WHEN NEW.category_id IS NOT NULL
     AND NOT EXISTS (
        SELECT 1
        FROM categories c
        WHERE c.id = NEW.category_id
          AND c.catalogue_id = NEW.catalogue_id
          AND c.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'item_category_must_belong_to_catalogue');
END;

CREATE TRIGGER catalogue_items_validate_category_update
BEFORE UPDATE OF catalogue_id, category_id ON catalogue_items
FOR EACH ROW
WHEN NEW.category_id IS NOT NULL
     AND NOT EXISTS (
        SELECT 1
        FROM categories c
        WHERE c.id = NEW.category_id
          AND c.catalogue_id = NEW.catalogue_id
          AND c.deleted_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'item_category_must_belong_to_catalogue');
END;

CREATE TABLE item_attribute_values (
    item_id INTEGER NOT NULL,
    attribute_definition_id INTEGER NOT NULL,
    value_text TEXT NOT NULL
        CHECK (length(trim(value_text)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0
        CHECK (sort_order >= 0),
    is_visible INTEGER NOT NULL DEFAULT 1
        CHECK (is_visible IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (item_id, attribute_definition_id),
    FOREIGN KEY (item_id) REFERENCES catalogue_items(id) ON DELETE CASCADE,
    FOREIGN KEY (attribute_definition_id) REFERENCES attribute_definitions(id) ON DELETE CASCADE
);

CREATE INDEX idx_item_attribute_values_item_sort
    ON item_attribute_values(item_id, sort_order);

CREATE TRIGGER item_attribute_values_validate_scope_insert
BEFORE INSERT ON item_attribute_values
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_items i
    INNER JOIN catalogues c
        ON c.id = i.catalogue_id
    INNER JOIN attribute_definitions ad
        ON ad.id = NEW.attribute_definition_id
    WHERE i.id = NEW.item_id
      AND i.deleted_at IS NULL
      AND ad.is_active = 1
      AND (
          ad.organization_id IS NULL
          OR ad.organization_id = c.organization_id
      )
      AND (
          ad.applies_to = 'both'
          OR ad.applies_to = i.item_type
      )
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_item_attribute_scope');
END;

CREATE TRIGGER item_attribute_values_validate_scope_update
BEFORE UPDATE OF item_id, attribute_definition_id ON item_attribute_values
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_items i
    INNER JOIN catalogues c
        ON c.id = i.catalogue_id
    INNER JOIN attribute_definitions ad
        ON ad.id = NEW.attribute_definition_id
    WHERE i.id = NEW.item_id
      AND i.deleted_at IS NULL
      AND ad.is_active = 1
      AND (
          ad.organization_id IS NULL
          OR ad.organization_id = c.organization_id
      )
      AND (
          ad.applies_to = 'both'
          OR ad.applies_to = i.item_type
      )
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_item_attribute_scope');
END;

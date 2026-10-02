-- Techabanca Catalogue
-- Migration 0013: authoring integrity
--
-- Adds safety around category soft deletion, typed item-attribute values,
-- reverse-scope invariants, and stricter currency-code format validation.
-- Existing migrations remain immutable.

-- Keep active authoring rows from pointing at a category after that category
-- is soft deleted. Children become roots; directly assigned items become
-- uncategorized. Both changes advance optimistic versions.
CREATE TRIGGER categories_soft_delete_detach_active_children
AFTER UPDATE OF deleted_at ON categories
FOR EACH ROW
WHEN OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL
BEGIN
    UPDATE categories
    SET parent_id = NULL,
        version = version + 1,
        updated_at = NEW.updated_at
    WHERE parent_id = NEW.id
      AND deleted_at IS NULL;
END;

CREATE TRIGGER categories_soft_delete_detach_active_items
AFTER UPDATE OF deleted_at ON categories
FOR EACH ROW
WHEN OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL
BEGIN
    UPDATE catalogue_items
    SET category_id = NULL,
        version = version + 1,
        updated_at = NEW.updated_at
    WHERE category_id = NEW.id
      AND deleted_at IS NULL;
END;

-- Preserve value_text as the canonical/rendering representation used by the
-- current published read model, while adding typed storage for authoring.
ALTER TABLE item_attribute_values
ADD COLUMN value_number REAL;

ALTER TABLE item_attribute_values
ADD COLUMN value_boolean INTEGER
    CHECK (value_boolean IS NULL OR value_boolean IN (0, 1));

ALTER TABLE item_attribute_values
ADD COLUMN value_date TEXT;

ALTER TABLE item_attribute_values
ADD COLUMN value_url TEXT;

-- Backfill any pre-existing values. Migration validation below will reject
-- incompatible legacy boolean/date/url data instead of silently accepting it.
UPDATE item_attribute_values
SET value_number = CAST(value_text AS REAL)
WHERE attribute_definition_id IN (
    SELECT id
    FROM attribute_definitions
    WHERE data_type = 'number'
);

UPDATE item_attribute_values
SET value_boolean = CASE lower(trim(value_text))
    WHEN 'true' THEN 1
    WHEN '1' THEN 1
    WHEN 'false' THEN 0
    WHEN '0' THEN 0
    ELSE NULL
END
WHERE attribute_definition_id IN (
    SELECT id
    FROM attribute_definitions
    WHERE data_type = 'boolean'
);

UPDATE item_attribute_values
SET value_date = trim(value_text)
WHERE attribute_definition_id IN (
    SELECT id
    FROM attribute_definitions
    WHERE data_type = 'date'
);

UPDATE item_attribute_values
SET value_url = trim(value_text)
WHERE attribute_definition_id IN (
    SELECT id
    FROM attribute_definitions
    WHERE data_type = 'url'
);

CREATE TRIGGER item_attribute_values_validate_typed_insert
BEFORE INSERT ON item_attribute_values
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM attribute_definitions ad
    WHERE ad.id = NEW.attribute_definition_id
      AND (
          (
              ad.data_type = 'text'
              AND NEW.value_number IS NULL
              AND NEW.value_boolean IS NULL
              AND NEW.value_date IS NULL
              AND NEW.value_url IS NULL
          )
          OR
          (
              ad.data_type = 'number'
              AND NEW.value_number IS NOT NULL
              AND NEW.value_boolean IS NULL
              AND NEW.value_date IS NULL
              AND NEW.value_url IS NULL
          )
          OR
          (
              ad.data_type = 'boolean'
              AND NEW.value_number IS NULL
              AND NEW.value_boolean IS NOT NULL
              AND NEW.value_date IS NULL
              AND NEW.value_url IS NULL
              AND (
                  (NEW.value_boolean = 1 AND lower(trim(NEW.value_text)) IN ('true', '1'))
                  OR
                  (NEW.value_boolean = 0 AND lower(trim(NEW.value_text)) IN ('false', '0'))
              )
          )
          OR
          (
              ad.data_type = 'date'
              AND NEW.value_number IS NULL
              AND NEW.value_boolean IS NULL
              AND NEW.value_date IS NOT NULL
              AND NEW.value_url IS NULL
              AND NEW.value_text = NEW.value_date
              AND length(NEW.value_date) = 10
              AND NEW.value_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
              AND strftime('%Y-%m-%d', NEW.value_date) = NEW.value_date
          )
          OR
          (
              ad.data_type = 'url'
              AND NEW.value_number IS NULL
              AND NEW.value_boolean IS NULL
              AND NEW.value_date IS NULL
              AND NEW.value_url IS NOT NULL
              AND NEW.value_text = NEW.value_url
              AND NEW.value_url = trim(NEW.value_url)
              AND (
                  lower(NEW.value_url) LIKE 'https://%'
                  OR lower(NEW.value_url) LIKE 'http://%'
              )
          )
      )
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_item_attribute_value_type');
END;

CREATE TRIGGER item_attribute_values_validate_typed_update
BEFORE UPDATE ON item_attribute_values
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM attribute_definitions ad
    WHERE ad.id = NEW.attribute_definition_id
      AND (
          (
              ad.data_type = 'text'
              AND NEW.value_number IS NULL
              AND NEW.value_boolean IS NULL
              AND NEW.value_date IS NULL
              AND NEW.value_url IS NULL
          )
          OR
          (
              ad.data_type = 'number'
              AND NEW.value_number IS NOT NULL
              AND NEW.value_boolean IS NULL
              AND NEW.value_date IS NULL
              AND NEW.value_url IS NULL
          )
          OR
          (
              ad.data_type = 'boolean'
              AND NEW.value_number IS NULL
              AND NEW.value_boolean IS NOT NULL
              AND NEW.value_date IS NULL
              AND NEW.value_url IS NULL
              AND (
                  (NEW.value_boolean = 1 AND lower(trim(NEW.value_text)) IN ('true', '1'))
                  OR
                  (NEW.value_boolean = 0 AND lower(trim(NEW.value_text)) IN ('false', '0'))
              )
          )
          OR
          (
              ad.data_type = 'date'
              AND NEW.value_number IS NULL
              AND NEW.value_boolean IS NULL
              AND NEW.value_date IS NOT NULL
              AND NEW.value_url IS NULL
              AND NEW.value_text = NEW.value_date
              AND length(NEW.value_date) = 10
              AND NEW.value_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
              AND strftime('%Y-%m-%d', NEW.value_date) = NEW.value_date
          )
          OR
          (
              ad.data_type = 'url'
              AND NEW.value_number IS NULL
              AND NEW.value_boolean IS NULL
              AND NEW.value_date IS NULL
              AND NEW.value_url IS NOT NULL
              AND NEW.value_text = NEW.value_url
              AND NEW.value_url = trim(NEW.value_url)
              AND (
                  lower(NEW.value_url) LIKE 'https://%'
                  OR lower(NEW.value_url) LIKE 'http://%'
              )
          )
      )
)
BEGIN
    SELECT RAISE(ABORT, 'invalid_item_attribute_value_type');
END;

-- Force validation of backfilled legacy rows during the migration.
UPDATE item_attribute_values
SET updated_at = updated_at;

-- Reverse invariants: changing the item or definition must not make an
-- existing attribute assignment invalid.
CREATE TRIGGER catalogue_items_validate_existing_attribute_scope_update
BEFORE UPDATE OF catalogue_id, item_type ON catalogue_items
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM item_attribute_values v
    INNER JOIN attribute_definitions ad
        ON ad.id = v.attribute_definition_id
    INNER JOIN catalogues target_catalogue
        ON target_catalogue.id = NEW.catalogue_id
    WHERE v.item_id = OLD.id
      AND (
          (
              ad.organization_id IS NOT NULL
              AND ad.organization_id <> target_catalogue.organization_id
          )
          OR
          (
              ad.applies_to <> 'both'
              AND ad.applies_to <> NEW.item_type
          )
      )
)
BEGIN
    SELECT RAISE(ABORT, 'existing_item_attribute_scope_conflict');
END;

CREATE TRIGGER attribute_definitions_validate_existing_values_update
BEFORE UPDATE OF organization_id, applies_to, data_type ON attribute_definitions
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM item_attribute_values v
    INNER JOIN catalogue_items i
        ON i.id = v.item_id
    INNER JOIN catalogues c
        ON c.id = i.catalogue_id
    WHERE v.attribute_definition_id = OLD.id
      AND i.deleted_at IS NULL
      AND (
          (
              NEW.organization_id IS NOT NULL
              AND NEW.organization_id <> c.organization_id
          )
          OR
          (
              NEW.applies_to <> 'both'
              AND NEW.applies_to <> i.item_type
          )
          OR
          NOT (
              (
                  NEW.data_type = 'text'
                  AND v.value_number IS NULL
                  AND v.value_boolean IS NULL
                  AND v.value_date IS NULL
                  AND v.value_url IS NULL
              )
              OR
              (
                  NEW.data_type = 'number'
                  AND v.value_number IS NOT NULL
                  AND v.value_boolean IS NULL
                  AND v.value_date IS NULL
                  AND v.value_url IS NULL
              )
              OR
              (
                  NEW.data_type = 'boolean'
                  AND v.value_number IS NULL
                  AND v.value_boolean IS NOT NULL
                  AND v.value_date IS NULL
                  AND v.value_url IS NULL
              )
              OR
              (
                  NEW.data_type = 'date'
                  AND v.value_number IS NULL
                  AND v.value_boolean IS NULL
                  AND v.value_date IS NOT NULL
                  AND v.value_url IS NULL
              )
              OR
              (
                  NEW.data_type = 'url'
                  AND v.value_number IS NULL
                  AND v.value_boolean IS NULL
                  AND v.value_date IS NULL
                  AND v.value_url IS NOT NULL
              )
          )
      )
)
BEGIN
    SELECT RAISE(ABORT, 'existing_item_attribute_definition_conflict');
END;

CREATE TRIGGER catalogues_validate_existing_attribute_scope_update
BEFORE UPDATE OF organization_id ON catalogues
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM catalogue_items i
    INNER JOIN item_attribute_values v
        ON v.item_id = i.id
    INNER JOIN attribute_definitions ad
        ON ad.id = v.attribute_definition_id
    WHERE i.catalogue_id = OLD.id
      AND i.deleted_at IS NULL
      AND ad.organization_id IS NOT NULL
      AND ad.organization_id <> NEW.organization_id
)
BEGIN
    SELECT RAISE(ABORT, 'existing_catalogue_attribute_scope_conflict');
END;

-- Existing schema checks uppercase/length. These triggers close the remaining
-- gap by requiring exactly three ASCII A-Z characters.
CREATE TRIGGER catalogue_items_validate_currency_insert
BEFORE INSERT ON catalogue_items
FOR EACH ROW
WHEN NEW.currency_code IS NOT NULL
     AND (
         length(NEW.currency_code) <> 3
         OR NEW.currency_code <> upper(NEW.currency_code)
         OR NEW.currency_code GLOB '*[^A-Z]*'
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_currency_code');
END;

CREATE TRIGGER catalogue_items_validate_currency_update
BEFORE UPDATE OF currency_code ON catalogue_items
FOR EACH ROW
WHEN NEW.currency_code IS NOT NULL
     AND (
         length(NEW.currency_code) <> 3
         OR NEW.currency_code <> upper(NEW.currency_code)
         OR NEW.currency_code GLOB '*[^A-Z]*'
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_currency_code');
END;
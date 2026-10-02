-- Techabanca Catalogue
-- Migration 0015: attribute authoring optimistic versions
--
-- Attribute definitions and item values are independently editable authoring
-- resources. Give both resources optimistic versions without changing the
-- existing typed-value, tenant-scope, or publication invariants.

ALTER TABLE attribute_definitions
ADD COLUMN version INTEGER NOT NULL DEFAULT 1
    CHECK (version >= 1);

ALTER TABLE item_attribute_values
ADD COLUMN version INTEGER NOT NULL DEFAULT 1
    CHECK (version >= 1);

CREATE INDEX idx_item_attribute_values_definition
    ON item_attribute_values(attribute_definition_id, item_id);
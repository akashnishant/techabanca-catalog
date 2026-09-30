-- Techabanca Catalogue
-- Migration 0007: harden published snapshot immutability
--
-- Migration 0006 freezes UPDATE and DELETE after a publication leaves
-- the building state. This migration also prevents INSERT, making every
-- published snapshot table writable only while its publication is building.

CREATE TRIGGER published_catalogues_freeze_insert
BEFORE INSERT ON published_catalogues
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = NEW.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_categories_freeze_insert
BEFORE INSERT ON published_categories
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = NEW.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_items_freeze_insert
BEFORE INSERT ON published_items
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = NEW.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_attributes_freeze_insert
BEFORE INSERT ON published_item_attributes
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = NEW.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_images_freeze_insert
BEFORE INSERT ON published_item_images
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = NEW.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

CREATE TRIGGER published_item_documents_freeze_insert
BEFORE INSERT ON published_item_documents
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1
    FROM catalogue_publications p
    WHERE p.id = NEW.publication_id
      AND p.state = 'building'
)
BEGIN
    SELECT RAISE(ABORT, 'published_snapshot_is_immutable');
END;

-- Techabanca Catalogue
-- Migration 0012: reusable catalogue slug lifecycle
--
-- Migration 0002 made catalogues.slug globally UNIQUE while also allowing
-- catalogue soft deletion. That prevents a public slug from being reused
-- after a catalogue is deleted.
--
-- D1 enforces foreign keys during migrations and ON DELETE CASCADE actions
-- remain active even when foreign-key checks are deferred. Rebuilding the
-- parent catalogues table would therefore be unnecessarily destructive/risky.
--
-- Instead, preserve the original public slug in released_slug and move every
-- soft-deleted catalogue into a reserved internal slug namespace. The existing
-- UNIQUE constraint then continues to protect active claims, while the original
-- public slug becomes available for reuse without rebuilding the parent table.

ALTER TABLE catalogues
ADD COLUMN released_slug TEXT COLLATE NOCASE
    CHECK (
        released_slug IS NULL
        OR (
            length(released_slug) BETWEEN 3 AND 63
            AND released_slug = lower(released_slug)
            AND released_slug NOT GLOB '*[^a-z0-9-]*'
            AND released_slug NOT LIKE '-%'
            AND released_slug NOT LIKE '%-'
            AND released_slug NOT LIKE '%--%'
        )
    );

-- Backfill any catalogue that was already soft-deleted before this migration.
-- If an existing active catalogue already occupies the matching internal
-- tombstone value, the existing UNIQUE constraint makes the migration fail
-- safely instead of silently losing data.
UPDATE catalogues
SET
    released_slug = slug,
    slug = 'deleted-' || id
WHERE deleted_at IS NOT NULL;

-- The deleted-* namespace is storage-internal from this migration onward.
CREATE TRIGGER catalogues_reject_internal_slug_insert
BEFORE INSERT ON catalogues
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
     AND NEW.slug LIKE 'deleted-%'
BEGIN
    SELECT RAISE(ABORT, 'reserved_internal_catalogue_slug');
END;

CREATE TRIGGER catalogues_reject_internal_slug_update
BEFORE UPDATE OF slug, deleted_at ON catalogues
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
     AND NEW.slug LIKE 'deleted-%'
BEGIN
    SELECT RAISE(ABORT, 'reserved_internal_catalogue_slug');
END;

-- Normal soft delete: retain the released public slug for history and replace
-- the globally unique slug value with a row-specific internal tombstone.
CREATE TRIGGER catalogues_release_slug_after_soft_delete
AFTER UPDATE OF deleted_at ON catalogues
FOR EACH ROW
WHEN OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL
BEGIN
    UPDATE catalogues
    SET
        released_slug = OLD.slug,
        slug = 'deleted-' || NEW.id
    WHERE id = NEW.id;
END;

-- Defensive coverage for data imports/admin operations that create an already
-- deleted row directly.
CREATE TRIGGER catalogues_release_slug_after_deleted_insert
AFTER INSERT ON catalogues
FOR EACH ROW
WHEN NEW.deleted_at IS NOT NULL
     AND NEW.slug NOT LIKE 'deleted-%'
BEGIN
    UPDATE catalogues
    SET
        released_slug = NEW.slug,
        slug = 'deleted-' || NEW.id
    WHERE id = NEW.id;
END;

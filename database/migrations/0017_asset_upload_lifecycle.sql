-- Techabanca Catalogue
-- Migration 0017: asset upload lifecycle
--
-- Extends the M1 asset metadata foundation with upload intent/completion state.
-- Transport remains milestone-owned: local R2 in M5.1, HTTP upload flow in M5.2.
-- Existing ready fixture rows remain valid; production lifecycle writes use
-- pending -> ready/failed/deleted transitions guarded below.

ALTER TABLE assets
ADD COLUMN expected_byte_size INTEGER
    CHECK (expected_byte_size IS NULL OR expected_byte_size > 0);

ALTER TABLE assets
ADD COLUMN upload_expires_at TEXT;

ALTER TABLE assets
ADD COLUMN failure_code TEXT
    CHECK (
        failure_code IS NULL
        OR length(trim(failure_code)) BETWEEN 1 AND 80
    );

ALTER TABLE assets
ADD COLUMN verified_at TEXT;

ALTER TABLE assets
ADD COLUMN version INTEGER NOT NULL DEFAULT 1
    CHECK (version >= 1);

-- Preserve useful lifecycle metadata for pre-M5 ready rows.
UPDATE assets
SET expected_byte_size = byte_size
WHERE status = 'ready'
  AND byte_size IS NOT NULL
  AND expected_byte_size IS NULL;

UPDATE assets
SET verified_at = COALESCE(ready_at, updated_at)
WHERE status = 'ready'
  AND verified_at IS NULL;

CREATE INDEX idx_assets_pending_expiry
    ON assets(status, upload_expires_at)
    WHERE status = 'pending'
      AND deleted_at IS NULL;

CREATE TRIGGER assets_reject_invalid_status_transition
BEFORE UPDATE OF status ON assets
FOR EACH ROW
WHEN NEW.status <> OLD.status
     AND NOT (
        (OLD.status = 'pending' AND NEW.status IN ('ready', 'failed', 'deleted'))
        OR (OLD.status = 'ready' AND NEW.status = 'deleted')
        OR (OLD.status = 'failed' AND NEW.status = 'deleted')
     )
BEGIN
    SELECT RAISE(ABORT, 'invalid_asset_status_transition');
END;

-- Production completion must only promote a fully verified pending upload.
-- Direct ready INSERTs remain supported for historical fixtures/import paths.
CREATE TRIGGER assets_require_verified_pending_to_ready
BEFORE UPDATE OF status ON assets
FOR EACH ROW
WHEN OLD.status = 'pending'
     AND NEW.status = 'ready'
     AND (
        NEW.expected_byte_size IS NULL
        OR NEW.byte_size IS NULL
        OR NEW.byte_size <> NEW.expected_byte_size
        OR NEW.upload_expires_at IS NULL
        OR NEW.ready_at IS NULL
        OR NEW.verified_at IS NULL
     )
BEGIN
    SELECT RAISE(ABORT, 'asset_not_verified_for_ready');
END;

CREATE TRIGGER assets_require_failure_code_pending_to_failed
BEFORE UPDATE OF status ON assets
FOR EACH ROW
WHEN OLD.status = 'pending'
     AND NEW.status = 'failed'
     AND (
        NEW.failure_code IS NULL
        OR length(trim(NEW.failure_code)) = 0
     )
BEGIN
    SELECT RAISE(ABORT, 'asset_failure_code_required');
END;

CREATE TRIGGER assets_require_deleted_at_on_delete_transition
BEFORE UPDATE OF status ON assets
FOR EACH ROW
WHEN NEW.status = 'deleted'
     AND OLD.status <> 'deleted'
     AND NEW.deleted_at IS NULL
BEGIN
    SELECT RAISE(ABORT, 'asset_deleted_at_required');
END;

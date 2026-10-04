-- M5.3: independent optimistic revision for each item's complete media collection.
-- A unique write token makes every statement in an atomic D1 batch conditional
-- on winning the revision check. A losing request cannot delete a winner's links.
ALTER TABLE catalogue_items ADD COLUMN media_version INTEGER NOT NULL DEFAULT 1 CHECK (media_version >= 1);
ALTER TABLE catalogue_items ADD COLUMN media_write_token TEXT;

-- An attached asset must stay ready. Detaching a link never deletes its R2 object.
CREATE TRIGGER assets_preserve_attached_readiness
BEFORE UPDATE OF status, deleted_at ON assets
FOR EACH ROW
WHEN (NEW.status <> 'ready' OR NEW.deleted_at IS NOT NULL)
 AND (
   EXISTS (SELECT 1 FROM item_images WHERE asset_id = OLD.id)
   OR EXISTS (SELECT 1 FROM item_documents WHERE asset_id = OLD.id)
   OR EXISTS (SELECT 1 FROM catalogue_website_settings WHERE logo_asset_id = OLD.id OR hero_asset_id = OLD.id)
 )
BEGIN
  SELECT RAISE(ABORT, 'asset_in_use');
END;

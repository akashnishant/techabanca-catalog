-- M9: live enquiry capture, concurrency, consent and retention.
ALTER TABLE enquiries ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0);
ALTER TABLE enquiries ADD COLUMN publication_public_id TEXT;
ALTER TABLE enquiries ADD COLUMN published_item_public_id TEXT;
ALTER TABLE enquiries ADD COLUMN published_item_name TEXT;
ALTER TABLE enquiries ADD COLUMN submission_nonce TEXT;
ALTER TABLE enquiries ADD COLUMN consent_at TEXT;
ALTER TABLE enquiries ADD COLUMN consent_version TEXT;
ALTER TABLE enquiries ADD COLUMN expires_at TEXT;
UPDATE enquiries SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+365 days');
CREATE TRIGGER enquiries_set_expiry AFTER INSERT ON enquiries
WHEN NEW.expires_at IS NULL
BEGIN
  UPDATE enquiries SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at, '+365 days') WHERE id = NEW.id;
END;
CREATE UNIQUE INDEX idx_enquiries_submission_nonce ON enquiries(submission_nonce) WHERE submission_nonce IS NOT NULL;
CREATE INDEX idx_enquiries_org_inbox ON enquiries(organization_id, created_at DESC, public_id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_enquiries_expiry ON enquiries(expires_at);
CREATE TABLE enquiry_rate_windows (
  catalogue_id INTEGER NOT NULL REFERENCES catalogues(id) ON DELETE CASCADE,
  client_hash TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts > 0),
  expires_at TEXT NOT NULL,
  PRIMARY KEY(catalogue_id, client_hash, window_start)
);
CREATE INDEX idx_enquiry_rate_expiry ON enquiry_rate_windows(expires_at);

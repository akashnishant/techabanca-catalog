-- Platform authorization is provisioned separately; no initial grants.
CREATE TABLE platform_admins (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('active', 'suspended')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
ALTER TABLE moderation_cases ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
ALTER TABLE moderation_cases ADD COLUMN write_token TEXT;
ALTER TABLE moderation_cases ADD COLUMN source TEXT NOT NULL DEFAULT 'admin' CHECK(source IN ('admin', 'public_report'));
ALTER TABLE moderation_cases ADD COLUMN submission_nonce TEXT CHECK(submission_nonce IS NULL OR (length(submission_nonce) = 32 AND submission_nonce NOT GLOB '*[^a-f0-9]*'));
CREATE UNIQUE INDEX idx_moderation_submission_nonce ON moderation_cases(submission_nonce) WHERE submission_nonce IS NOT NULL;
CREATE INDEX idx_moderation_queue ON moderation_cases(status, opened_at DESC, id DESC);

CREATE TABLE catalogue_moderation_state (
 catalogue_id INTEGER PRIMARY KEY REFERENCES catalogues(id) ON DELETE CASCADE,
 version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
 blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0, 1)),
 previous_status TEXT CHECK(previous_status IS NULL OR previous_status IN ('draft', 'published')),
 case_id INTEGER REFERENCES moderation_cases(id),
 write_token TEXT,
 CHECK(blocked = 0 OR (previous_status IS NOT NULL AND case_id IS NOT NULL))
);
INSERT INTO catalogue_moderation_state(catalogue_id) SELECT id FROM catalogues;
CREATE TRIGGER catalogues_initialize_moderation AFTER INSERT ON catalogues
BEGIN INSERT INTO catalogue_moderation_state(catalogue_id) VALUES(NEW.id); END;

ALTER TABLE reserved_slugs ADD COLUMN platform_managed INTEGER NOT NULL DEFAULT 0 CHECK(platform_managed IN (0, 1));
CREATE TABLE platform_actor_windows (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bucket INTEGER NOT NULL, attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 60),
 expires_at TEXT NOT NULL, PRIMARY KEY(user_id, bucket)
) WITHOUT ROWID;
CREATE TABLE moderation_report_windows (
 catalogue_id INTEGER NOT NULL REFERENCES catalogues(id) ON DELETE CASCADE,
 client_hash TEXT NOT NULL CHECK(client_hash = '*' OR (length(client_hash) = 64 AND client_hash NOT GLOB '*[^a-f0-9]*')),
 bucket INTEGER NOT NULL, attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 31),
 expires_at TEXT NOT NULL, PRIMARY KEY(catalogue_id, client_hash, bucket)
) WITHOUT ROWID;
CREATE INDEX idx_platform_windows_expiry ON platform_actor_windows(expires_at);
CREATE INDEX idx_report_windows_expiry ON moderation_report_windows(expires_at);

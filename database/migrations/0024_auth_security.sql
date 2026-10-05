-- Durable, bounded authentication abuse windows. Identifiers are keyed hashes;
-- raw addresses, account emails, passwords and challenge tokens are never stored.
CREATE TABLE auth_attempt_windows (
  action TEXT NOT NULL CHECK(action IN ('login','register')),
  client_hash TEXT NOT NULL CHECK(length(client_hash)=64 AND client_hash NOT GLOB '*[^0-9a-f]*'),
  bucket INTEGER NOT NULL CHECK(bucket >= 0),
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 21),
  expires_at TEXT NOT NULL,
  PRIMARY KEY(action,client_hash,bucket)
) WITHOUT ROWID;
CREATE INDEX idx_auth_attempt_windows_expiry ON auth_attempt_windows(expires_at);

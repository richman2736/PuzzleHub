-- Better Auth requires a few columns beyond the initial auth tables (0001) and a
-- verification store for magic-link / email flows. These ALTERs are additive so
-- existing rows keep working; new columns are nullable (or defaulted) accordingly.

-- users: email verification flag.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

-- sessions: request fingerprint Better Auth records per session.
ALTER TABLE sessions ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;

-- accounts: credential / OAuth material (nullable for magic-link-only accounts).
ALTER TABLE accounts ADD COLUMN access_token TEXT;
ALTER TABLE accounts ADD COLUMN refresh_token TEXT;
ALTER TABLE accounts ADD COLUMN id_token TEXT;
ALTER TABLE accounts ADD COLUMN access_token_expires_at TEXT;
ALTER TABLE accounts ADD COLUMN refresh_token_expires_at TEXT;
ALTER TABLE accounts ADD COLUMN scope TEXT;
ALTER TABLE accounts ADD COLUMN password TEXT;

-- Better Auth verification store (magic-link tokens, email verification, etc.).
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS verifications_identifier_idx ON verifications (identifier);

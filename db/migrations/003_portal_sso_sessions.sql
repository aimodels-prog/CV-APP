CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email));

CREATE TABLE portal_sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX portal_sessions_user_idx ON portal_sessions (user_id);
CREATE INDEX portal_sessions_expiry_idx ON portal_sessions (expires_at);

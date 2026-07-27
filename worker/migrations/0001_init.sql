-- Beholder D1 schema v1.
-- Users + opaque bearer sessions (hashed) + append-only event log.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One-time codes bridging the OAuth redirect back into the PWA origin.
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Append-only, idempotent by (user_id, id); server_seq orders pulls.
CREATE TABLE IF NOT EXISTS events (
  server_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  at TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_events_user_seq ON events(user_id, server_seq);

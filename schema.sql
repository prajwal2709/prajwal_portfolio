CREATE TABLE IF NOT EXISTS active_visitors (
  visitor_id TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS active_visitors_last_seen_idx
  ON active_visitors(last_seen);

CREATE TABLE IF NOT EXISTS appreciations (
  visitor_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

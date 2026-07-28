CREATE TABLE IF NOT EXISTS message_refresh_snapshots (
  snapshot_key TEXT PRIMARY KEY,
  user_key TEXT NOT NULL,
  domain TEXT NOT NULL,
  meta_account_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  refresh_id TEXT NOT NULL,
  current_payload TEXT NOT NULL,
  previous_payload TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_refresh_scope
  ON message_refresh_snapshots(user_key, domain, meta_account_id, start_date, end_date);

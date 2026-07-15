CREATE TABLE IF NOT EXISTS report_snapshots (
  cache_key TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  meta_account_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  include_assets INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_lookup
  ON report_snapshots(domain, meta_account_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS joinads_daily_cache (
  cache_key TEXT PRIMARY KEY,
  report_name TEXT NOT NULL,
  report_date TEXT NOT NULL,
  payload TEXT NOT NULL,
  finalized_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_joinads_daily_report_date
  ON joinads_daily_cache(report_name, report_date);

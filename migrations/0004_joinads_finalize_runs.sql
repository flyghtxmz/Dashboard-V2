CREATE TABLE IF NOT EXISTS joinads_finalize_runs (
  id TEXT PRIMARY KEY,
  report_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  domains_count INTEGER NOT NULL,
  reports_ok INTEGER NOT NULL,
  reports_failed INTEGER NOT NULL,
  details TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_joinads_finalize_runs_date
  ON joinads_finalize_runs(report_date, finished_at);

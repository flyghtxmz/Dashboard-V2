CREATE TABLE IF NOT EXISTS campaign_creation_runs (
  request_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  actor TEXT,
  campaign_name TEXT NOT NULL,
  status TEXT NOT NULL,
  request_payload TEXT NOT NULL,
  response_payload TEXT,
  campaign_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_creation_runs_account
  ON campaign_creation_runs(account_id, created_at DESC);

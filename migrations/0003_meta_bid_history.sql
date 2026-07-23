CREATE TABLE IF NOT EXISTS meta_bid_history (
  id TEXT PRIMARY KEY,
  changed_at TEXT NOT NULL,
  actor_id TEXT,
  actor_username TEXT,
  actor_role TEXT,
  account_id TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT NOT NULL,
  adset_name TEXT,
  previous_strategy TEXT,
  requested_strategy TEXT,
  confirmed_strategy TEXT,
  previous_amount_brl REAL,
  requested_amount_brl REAL,
  confirmed_amount_brl REAL,
  amount_only INTEGER NOT NULL DEFAULT 0,
  meta_updated_time_before TEXT,
  meta_updated_time_after TEXT,
  source TEXT NOT NULL DEFAULT 'dashboard',
  status TEXT NOT NULL DEFAULT 'confirmed'
);

CREATE INDEX IF NOT EXISTS idx_meta_bid_history_changed_at
  ON meta_bid_history(changed_at);

CREATE INDEX IF NOT EXISTS idx_meta_bid_history_adset
  ON meta_bid_history(adset_id, changed_at);


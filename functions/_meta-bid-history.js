async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS meta_bid_history (
    id TEXT PRIMARY KEY, changed_at TEXT NOT NULL, actor_id TEXT, actor_username TEXT,
    actor_role TEXT, account_id TEXT, campaign_id TEXT, campaign_name TEXT,
    adset_id TEXT NOT NULL, adset_name TEXT, previous_strategy TEXT,
    requested_strategy TEXT, confirmed_strategy TEXT, previous_amount_brl REAL,
    requested_amount_brl REAL, confirmed_amount_brl REAL, amount_only INTEGER NOT NULL DEFAULT 0,
    meta_updated_time_before TEXT, meta_updated_time_after TEXT,
    source TEXT NOT NULL DEFAULT 'dashboard', status TEXT NOT NULL DEFAULT 'confirmed'
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_meta_bid_history_changed_at ON meta_bid_history(changed_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_meta_bid_history_adset ON meta_bid_history(adset_id, changed_at)").run();
}

export async function recordMetaBidHistory(env, entry) {
  const db = env.DASHBOARD_DB || null;
  if (!db) return { saved: false, reason: "DASHBOARD_DB_NOT_CONFIGURED" };
  await ensureSchema(db);
  const id = crypto.randomUUID();
  const changedAt = new Date().toISOString();
  await db.prepare(`INSERT INTO meta_bid_history (
    id, changed_at, actor_id, actor_username, actor_role, account_id,
    campaign_id, campaign_name, adset_id, adset_name,
    previous_strategy, requested_strategy, confirmed_strategy,
    previous_amount_brl, requested_amount_brl, confirmed_amount_brl,
    amount_only, meta_updated_time_before, meta_updated_time_after, source, status
  ) VALUES (
    ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
    ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
  )`).bind(
    id, changedAt, entry.actorId || null, entry.actorUsername || null, entry.actorRole || null,
    entry.accountId || null, entry.campaignId || null, entry.campaignName || null,
    String(entry.adsetId || ""), entry.adsetName || null,
    entry.previousStrategy || null, entry.requestedStrategy || null, entry.confirmedStrategy || null,
    entry.previousAmountBrl ?? null, entry.requestedAmountBrl ?? null, entry.confirmedAmountBrl ?? null,
    entry.amountOnly ? 1 : 0, entry.metaUpdatedTimeBefore || null, entry.metaUpdatedTimeAfter || null,
    entry.source || "dashboard", entry.status || "confirmed"
  ).run();
  return { saved: true, id, changedAt };
}

export async function listMetaBidHistory(env, { startDate, endDate, accountId = "", limit = 5000 }) {
  const db = env.DASHBOARD_DB || null;
  if (!db) return { available: false, rows: [], reason: "DASHBOARD_DB_NOT_CONFIGURED" };
  await ensureSchema(db);
  const startIso = new Date(`${startDate}T00:00:00-03:00`).toISOString();
  const endExclusive = new Date(`${endDate}T00:00:00-03:00`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const safeLimit = Math.min(10000, Math.max(1, Number(limit) || 5000));
  // A Graph API devolve account_id sem o prefixo "act_", enquanto o filtro da UI o usa.
  const normalizedAccountId = String(accountId || "").replace(/^act_/i, "");
  const statement = normalizedAccountId
    ? db.prepare(`SELECT * FROM meta_bid_history
        WHERE changed_at >= ?1 AND changed_at < ?2 AND account_id = ?3
        ORDER BY changed_at ASC LIMIT ?4`).bind(startIso, endExclusive.toISOString(), normalizedAccountId, safeLimit)
    : db.prepare(`SELECT * FROM meta_bid_history
        WHERE changed_at >= ?1 AND changed_at < ?2
        ORDER BY changed_at ASC LIMIT ?3`).bind(startIso, endExclusive.toISOString(), safeLimit);
  const result = await statement.all();
  return { available: true, rows: Array.isArray(result?.results) ? result.results : [] };
}

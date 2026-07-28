import { jsonResponse, readJson } from "../_utils.js";
import { getSession, requireDomainAccess } from "../_auth.js";
import { loadSettings } from "../_settings.js";
import { validateDateRange } from "../_dates.js";

function clean(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

async function hashKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS message_refresh_snapshots (
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
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_message_refresh_scope ON message_refresh_snapshots(user_key, domain, meta_account_id, start_date, end_date)").run();
}

function parseSnapshot(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed?.campaigns && parsed?.totals ? parsed : null;
  } catch (_) {
    return null;
  }
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return jsonResponse(401, { error: "Sessao invalida ou expirada." });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const db = env.DASHBOARD_DB || null;
  if (!db) return jsonResponse(503, { error: "DASHBOARD_DB nao configurado", available: false });

  const body = await readJson(request);
  const domainAccess = requireDomainAccess(session, clean(body?.domain));
  if (!domainAccess.ok) return domainAccess.response;
  const accountId = clean(body?.account_id);
  const startDate = clean(body?.start_date, 10);
  const endDate = clean(body?.end_date, 10);
  const refreshId = clean(body?.refresh_id, 150);
  const variant = clean(body?.variant, 5000);
  const snapshot = body?.snapshot;
  const previousSnapshot = body?.previous_snapshot?.campaigns && body?.previous_snapshot?.totals
    ? body.previous_snapshot
    : null;
  if (!accountId || !startDate || !endDate || !refreshId || !snapshot?.campaigns || !snapshot?.totals) {
    return jsonResponse(400, { error: "Dados obrigatorios ausentes para sincronizar a comparacao." });
  }
  const dateRange = validateDateRange(startDate, endDate, 15);
  if (!dateRange.ok) return jsonResponse(400, { error: dateRange.error });
  if (session.role !== "admin") {
    const settings = await loadSettings(env);
    if (!settings.metaAccountId || String(settings.metaAccountId) !== accountId) {
      return jsonResponse(403, { error: "Conta Meta fora do escopo autorizado." });
    }
  }
  const payload = JSON.stringify(snapshot);
  const previousPayload = previousSnapshot ? JSON.stringify(previousSnapshot) : null;
  if (payload.length + (previousPayload?.length || 0) > 500000) {
    return jsonResponse(413, { error: "Snapshot de comparacao excedeu o limite seguro." });
  }

  await ensureSchema(db);
  const userKey = `${session.role}:${session.id || session.username || session.email || "user"}`;
  const domain = domainAccess.domains[0];
  const snapshotKey = await hashKey([userKey, domain, accountId, startDate, endDate, variant].join("|"));
  const now = new Date().toISOString();
  const row = await db.prepare(`INSERT INTO message_refresh_snapshots
    (snapshot_key, user_key, domain, meta_account_id, start_date, end_date, refresh_id, current_payload, previous_payload, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ON CONFLICT(snapshot_key) DO UPDATE SET
      previous_payload = CASE
        WHEN message_refresh_snapshots.refresh_id = excluded.refresh_id
          THEN COALESCE(message_refresh_snapshots.previous_payload, excluded.previous_payload)
        ELSE message_refresh_snapshots.current_payload
      END,
      current_payload = CASE
        WHEN message_refresh_snapshots.refresh_id = excluded.refresh_id THEN message_refresh_snapshots.current_payload
        ELSE excluded.current_payload
      END,
      refresh_id = CASE
        WHEN message_refresh_snapshots.refresh_id = excluded.refresh_id THEN message_refresh_snapshots.refresh_id
        ELSE excluded.refresh_id
      END,
      updated_at = CASE
        WHEN message_refresh_snapshots.refresh_id = excluded.refresh_id THEN message_refresh_snapshots.updated_at
        ELSE excluded.updated_at
      END
    RETURNING refresh_id, current_payload, previous_payload, updated_at`)
    .bind(snapshotKey, userKey, domain, accountId, startDate, endDate, refreshId, payload, previousPayload, now)
    .first();

  return jsonResponse(200, {
    ok: true,
    refreshId: row?.refresh_id || refreshId,
    current: parseSnapshot(row?.current_payload) || snapshot,
    previous: parseSnapshot(row?.previous_payload),
    updatedAt: row?.updated_at || now,
    storage: "d1",
  });
}

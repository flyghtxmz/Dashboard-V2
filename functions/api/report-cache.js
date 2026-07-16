import { jsonResponse, getQuery, readJson } from "../_utils.js";
import { getSession, requireDomainAccess } from "../_auth.js";

const DEFAULT_FINAL_HOUR = 10;
const LIVE_TTL_MS = 10 * 60 * 1000;

function getDb(env) {
  return env.DASHBOARD_DB || env.DB || null;
}

function getKv(env) {
  return env.DASHBOARD_KV || env.CPA_RULES_KV || null;
}

function clean(value) {
  return String(value || "").trim();
}

function dateInSaoPaulo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function saoPauloHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
}

function previousIsoDay(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function cacheKey({ domain, accountId, startDate, endDate, includeAssets, schema }) {
  return [schema || "v1", domain.toLowerCase(), accountId, startDate, endDate, includeAssets ? "1" : "0"].join("|");
}

function cachePolicy(row, env, now = new Date()) {
  const today = dateInSaoPaulo(now);
  const yesterday = previousIsoDay(today);
  const endDate = row.end_date;
  const fetchedAt = new Date(row.fetched_at);
  const ageMs = Number.isNaN(fetchedAt.getTime()) ? Infinity : now.getTime() - fetchedAt.getTime();
  const finalHour = Math.min(23, Math.max(0, Number(env.REPORT_YESTERDAY_FINAL_HOUR ?? DEFAULT_FINAL_HOUR)));

  if (endDate < yesterday) {
    return { fresh: true, policy: "historical_final", finalHour };
  }
  if (endDate === yesterday) {
    const afterCutoff = saoPauloHour(now) >= finalHour;
    const fetchedToday = dateInSaoPaulo(fetchedAt) === today;
    const fetchedAfterCutoff = fetchedToday && saoPauloHour(fetchedAt) >= finalHour;
    return {
      fresh: afterCutoff && fetchedAfterCutoff,
      policy: afterCutoff ? "yesterday_needs_final_refresh" : "yesterday_provisional",
      finalHour,
    };
  }
  // Periodos que incluem hoje nunca encerram no snapshot: ele serve apenas para pintar a tela
  // rapidamente enquanto as APIs atualizam o dia corrente.
  return { fresh: false, policy: "live_always_refresh", finalHour, ageMs, liveTtlMs: LIVE_TTL_MS };
}

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS report_snapshots (
    cache_key TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    meta_account_id TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    include_assets INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_report_snapshots_lookup ON report_snapshots(domain, meta_account_id, start_date, end_date)").run();
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return jsonResponse(401, { error: "Sessao invalida ou expirada." });
  const db = getDb(env);
  const kv = getKv(env);
  if (!db && !kv) return jsonResponse(503, { error: "DASHBOARD_DB ou DASHBOARD_KV nao configurado", cacheAvailable: false });
  if (db) await ensureSchema(db);

  if (request.method === "GET") {
    const params = getQuery(request);
    const domain = clean(params.get("domain"));
    const access = requireDomainAccess(session, domain);
    if (!access.ok) return access.response;
    const values = {
      domain: access.domains[0],
      accountId: clean(params.get("account_id")),
      startDate: clean(params.get("start_date")),
      endDate: clean(params.get("end_date")),
      includeAssets: params.get("include_assets") === "1",
      schema: clean(params.get("schema")) || "v1",
    };
    if (!values.accountId || !values.startDate || !values.endDate) {
      return jsonResponse(400, { error: "Parametros obrigatorios: account_id, start_date, end_date" });
    }
    const key = cacheKey(values);
    const row = db
      ? await db.prepare("SELECT * FROM report_snapshots WHERE cache_key = ?1").bind(key).first()
      : await kv.get(`report-snapshot:${key}`, "json");
    if (!row) return jsonResponse(200, { hit: false });
    const policy = cachePolicy(row, env);
    let snapshot = null;
    try { snapshot = JSON.parse(row.payload); } catch { snapshot = null; }
    if (!snapshot) return jsonResponse(200, { hit: false, corrupted: true });
    return jsonResponse(200, { hit: true, ...policy, fetchedAt: row.fetched_at, snapshot });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const domain = clean(body?.domain);
    const access = requireDomainAccess(session, domain);
    if (!access.ok) return access.response;
    const values = {
      domain: access.domains[0],
      accountId: clean(body?.account_id),
      startDate: clean(body?.start_date),
      endDate: clean(body?.end_date),
      includeAssets: !!body?.include_assets,
      schema: clean(body?.schema) || "v1",
    };
    if (!values.accountId || !values.startDate || !values.endDate || !body?.snapshot) {
      return jsonResponse(400, { error: "Dados obrigatorios ausentes para salvar o snapshot." });
    }
    const now = new Date().toISOString();
    const payload = JSON.stringify(body.snapshot);
    if (db) {
      await db.prepare(`INSERT INTO report_snapshots
        (cache_key, domain, meta_account_id, start_date, end_date, include_assets, payload, fetched_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
        ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at, updated_at = excluded.updated_at`)
        .bind(cacheKey(values), values.domain, values.accountId, values.startDate, values.endDate, values.includeAssets ? 1 : 0, payload, now)
        .run();
    } else {
      await kv.put(`report-snapshot:${cacheKey(values)}`, JSON.stringify({
        cache_key: cacheKey(values), domain: values.domain, meta_account_id: values.accountId,
        start_date: values.startDate, end_date: values.endDate,
        include_assets: values.includeAssets ? 1 : 0, payload, fetched_at: now, updated_at: now,
      }));
    }
    return jsonResponse(200, { ok: true, savedAt: now, storage: db ? "d1" : "kv" });
  }

  return jsonResponse(405, { error: "Method not allowed" });
}

import { jsonResponse, readJson } from "../_utils.js";
import { getSession } from "../_auth.js";

function storage(env) {
  return { db: env.DASHBOARD_DB || null, kv: env.DASHBOARD_KV || env.CPA_RULES_KV || null };
}

async function purgeKvPrefix(kv, prefix) {
  let cursor;
  let deleted = 0;
  do {
    const page = await kv.list({ prefix, cursor });
    await Promise.all((page.keys || []).map((item) => kv.delete(item.name)));
    deleted += (page.keys || []).length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return deleted;
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return jsonResponse(401, { error: "Sessao invalida ou expirada." });
  if (session.role !== "admin") return jsonResponse(403, { error: "Apenas administradores podem reconstruir caches." });
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const body = await readJson(request);
  const scope = String(body?.scope || "joinads");
  const reportName = String(body?.report_name || "").trim();
  const reportDate = String(body?.report_date || "").trim();
  const { db, kv } = storage(env);
  if (!db && !kv) return jsonResponse(503, { error: "Armazenamento persistente nao configurado." });
  let deleted = 0;

  if (scope === "joinads") {
    if (db) {
      await db.prepare("CREATE TABLE IF NOT EXISTS joinads_daily_cache (cache_key TEXT PRIMARY KEY, report_name TEXT NOT NULL, report_date TEXT NOT NULL, payload TEXT NOT NULL, finalized_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
      let sql = "DELETE FROM joinads_daily_cache";
      const binds = [];
      const where = [];
      if (reportName) { binds.push(reportName); where.push(`report_name = ?${binds.length}`); }
      if (reportDate) { binds.push(reportDate); where.push(`report_date = ?${binds.length}`); }
      if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
      const result = await db.prepare(sql).bind(...binds).run();
      deleted = Number(result?.meta?.changes || 0);
    } else {
      // KV usa chaves hash; a reconstrução remove o namespace diário inteiro.
      deleted = await purgeKvPrefix(kv, "joinads-daily:");
    }
  } else if (scope === "snapshots") {
    if (db) {
      await db.prepare("CREATE TABLE IF NOT EXISTS report_snapshots (cache_key TEXT PRIMARY KEY, domain TEXT NOT NULL, meta_account_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, include_assets INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, fetched_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
      const result = await db.prepare("DELETE FROM report_snapshots").run();
      deleted = Number(result?.meta?.changes || 0);
    } else {
      deleted = await purgeKvPrefix(kv, "report-snapshot:");
    }
  } else {
    return jsonResponse(400, { error: "scope deve ser joinads ou snapshots." });
  }
  return jsonResponse(200, { ok: true, scope, reportName: reportName || null, reportDate: reportDate || null, deleted });
}

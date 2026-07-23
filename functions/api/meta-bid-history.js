import { jsonResponse, getQuery } from "../_utils.js";
import { getSession } from "../_auth.js";
import { validateDateRange } from "../_dates.js";
import { listMetaBidHistory } from "../_meta-bid-history.js";

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return jsonResponse(401, { error: "Sessao invalida ou expirada." });
  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed" });
  const query = getQuery(request);
  const startDate = String(query.get("start_date") || "");
  const endDate = String(query.get("end_date") || "");
  const accountId = String(query.get("account_id") || "").trim();
  const dateRange = validateDateRange(startDate, endDate, 15);
  if (!dateRange.ok) return jsonResponse(400, { error: dateRange.error });
  try {
    const result = await listMetaBidHistory(env, { startDate, endDate, accountId });
    return jsonResponse(200, { code: "success", data: result.rows, available: result.available, reason: result.reason || null });
  } catch (error) {
    return jsonResponse(500, { error: "Erro ao consultar historico de limite de custo", details: error.message });
  }
}


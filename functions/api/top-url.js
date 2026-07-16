import {
  jsonResponse,
  getQuery,
  getJoinadsToken,
  safeJson,
} from "../_utils.js";
import { getSession, requireDomainAccess } from "../_auth.js";
import { fetchJoinadsDailyCached, hasJoinadsDailyStorage } from "../_joinads-cache.js";

const API_BASE = "https://office.joinads.me/api/clients-endpoints";

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse(401, { code: "error", message: "Sessao invalida ou expirada." });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const token = getJoinadsToken(env);
  if (!token) {
    return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado" });
  }

  const params = getQuery(request);
  const start_date = params.get("start_date");
  const end_date = params.get("end_date");
  const sort = params.get("sort");
  const limit = params.get("limit");
  const domains = params.getAll("domain[]");
  const domainAlt = params.getAll("domain");
  const allDomains = domains.length ? domains : domainAlt;
  const access = requireDomainAccess(session, allDomains);
  if (!access.ok) return access.response;

  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (!access.domains.length) missing.push("domain[]");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  try {
    const fetchRange = async (start, end) => {
      const q = new URLSearchParams({ start_date: start, end_date: end });
      access.domains.forEach((domain) => q.append("domain[]", domain));
      if (limit) q.set("limit", limit);
      if (sort) q.set("sort", sort);
      const response = await fetch(`${API_BASE}/top-url?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await safeJson(response);
      if (!response.ok) {
        const error = new Error("Erro JoinAds"); error.status = response.status; error.details = data; throw error;
      }
      return data;
    };
    if (!hasJoinadsDailyStorage(env)) return jsonResponse(200, await fetchRange(start_date, end_date));
    const cached = await fetchJoinadsDailyCached({
      env, reportName: "top-url", startDate: start_date, endDate: end_date,
      identity: { domains: access.domains, limit, sort }, fetchDay: (day) => fetchRange(day, day),
    });
    const byUrl = new Map();
    cached.results.flatMap((result) => result?.data || []).forEach((row) => {
      const key = `${row.domain || row.name || ""}|${row.url || row.URL || ""}`;
      const item = byUrl.get(key) || { ...row, impressions: 0, clicks: 0, revenue: 0, revenue_client: 0 };
      item.impressions += Number(row.impressions || 0);
      item.clicks += Number(row.clicks || 0);
      item.revenue += Number(row.revenue || row.earnings || 0);
      item.revenue_client += Number(row.revenue_client || row.earnings_client || 0);
      byUrl.set(key, item);
    });
    const data = Array.from(byUrl.values()).map((row) => ({
      ...row,
      ctr: row.impressions > 0 ? row.clicks / row.impressions * 100 : 0,
      ecpm: row.impressions > 0 ? row.revenue / row.impressions * 1000 : 0,
      ecpm_client: row.impressions > 0 ? row.revenue_client / row.impressions * 1000 : 0,
    })).sort((a, b) => Number(b[sort] || b.revenue_client || 0) - Number(a[sort] || a.revenue_client || 0));
    return jsonResponse(200, { code: "success", data: limit ? data.slice(0, Number(limit)) : data, cache: cached.diagnostics });
  } catch (error) {
    return jsonResponse(error.status || 500, {
      error: "Erro ao consultar JoinAds",
      details: error.details || error.message,
    });
  }
}

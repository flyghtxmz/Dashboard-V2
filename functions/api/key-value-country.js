import {
  jsonResponse,
  getQuery,
  getJoinadsToken,
  safeJson,
} from "../_utils.js";
import { getSession, requireDomainAccess } from "../_auth.js";
import { fetchJoinadsDailyCached, hasJoinadsDailyStorage, validateJoinadsDomainPayload } from "../_joinads-cache.js";
import { validateDateRange } from "../_dates.js";

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
  const domain = params.get("domain");
  const access = requireDomainAccess(session, domain);
  if (!access.ok) return access.response;
  const report_type = params.get("report_type");
  const custom_key = params.get("custom_key");
  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (!access.domains[0]) missing.push("domain");
  if (!report_type) missing.push("report_type");
  if (!custom_key) missing.push("custom_key");
  if (missing.length) {
    return jsonResponse(400, { error: `Parametros obrigatorios: ${missing.join(", ")}` });
  }
  const dateRange = validateDateRange(start_date, end_date, 15);
  if (!dateRange.ok) return jsonResponse(400, { error: dateRange.error });

  try {
    const fetchRange = async (start, end) => {
      const q = new URLSearchParams({ start_date: start, end_date: end, domain: access.domains[0], report_type, custom_key });
      const response = await fetch(`${API_BASE}/key-value-country?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await safeJson(response);
      if (!response.ok) {
        const error = new Error("Erro JoinAds");
        error.status = response.status;
        error.details = data;
        throw error;
      }
      if (data?.code === "error" || !Array.isArray(data?.data)) {
        const error = new Error("Resposta invalida da JoinAds"); error.status = 502; error.details = data; throw error;
      }
      return data;
    };
    if (!hasJoinadsDailyStorage(env)) {
      return jsonResponse(200, await fetchRange(start_date, end_date));
    }
    const cached = await fetchJoinadsDailyCached({
      env,
      reportName: "key-value-country",
      startDate: start_date,
      endDate: end_date,
      identity: { domain: access.domains[0], report_type, custom_key },
      fetchDay: (day) => fetchRange(day, day),
      validatePayload: (payload) => validateJoinadsDomainPayload(payload, access.domains[0]),
    });
    return jsonResponse(200, {
      code: "success",
      data: cached.results.flatMap((result) => Array.isArray(result?.data) ? result.data : []),
      cache: cached.diagnostics,
    });
  } catch (error) {
    return jsonResponse(error.status || 500, { error: "Erro ao consultar JoinAds por pais", details: error.details || error.message });
  }
}

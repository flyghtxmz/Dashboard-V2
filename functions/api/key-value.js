import {
  jsonResponse,
  getQuery,
  getJoinadsToken,
  safeJson,
} from "../_utils.js";
import { getSession, requireDomainAccess } from "../_auth.js";
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
  const custom_value = params.get("custom_value");

  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (!access.domains[0]) missing.push("domain");
  if (!report_type) missing.push("report_type");
  if (!custom_key) missing.push("custom_key");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }
  const dateRange = validateDateRange(start_date, end_date, 15);
  if (!dateRange.ok) return jsonResponse(400, { error: dateRange.error });

  const q = new URLSearchParams();
  q.set("start_date", start_date);
  q.set("end_date", end_date);
  q.set("domain", access.domains[0]);
  q.set("report_type", report_type);
  q.set("custom_key", custom_key);
  if (custom_value) q.set("custom_value", custom_value);

  try {
    const response = await fetch(`${API_BASE}/key-value?${q.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro JoinAds", details: data });
    }
    if (data?.code === "error" || !Array.isArray(data?.data)) {
      return jsonResponse(502, { error: "Resposta invalida da JoinAds", details: data });
    }

    return jsonResponse(200, data);
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar JoinAds",
      details: error.message,
    });
  }
}
